"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireInternal } from "../auth";
import { run } from "../db";
import { newId, nowIso } from "../ids";
import { getTemplate, parseStepsInput } from "../queries/templates";
import { getWorkspaceForUser, getWorkspacePlain } from "../queries/workspaces";
import { createSteps } from "../services";
import { bool, str, type ActionState } from "./state";
import type { TemplateStep } from "../types";

/** Strips workspace-specific assignees so a flow stays reusable. */
function forTemplate(steps: TemplateStep[]): TemplateStep[] {
  return steps.map((s) => ({ ...s, assignee_id: null }));
}

export async function saveTemplate(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireInternal();
  const id = str(fd, "id", 40);
  const name = str(fd, "name", 200);
  if (!name) return { error: "Give the flow a name." };
  const steps = parseStepsInput(str(fd, "steps", 200_000));
  if (!steps) return { error: "Every step needs a title." };
  if (!steps.length) return { error: "Add at least one step." };
  const description = str(fd, "description", 2000);
  const json = JSON.stringify(forTemplate(steps));
  if (id && getTemplate(id)) {
    run("UPDATE templates SET name = ?, description = ?, steps = ? WHERE id = ?", name, description, json, id);
  } else {
    run("INSERT INTO templates (id, name, description, steps, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", newId(), name, description, json, user.id, nowIso());
  }
  revalidatePath("/templates");
  redirect("/templates");
}

export async function deleteTemplate(id: string): Promise<void> {
  await requireInternal();
  run("DELETE FROM templates WHERE id = ?", id);
  revalidatePath("/templates");
}

/** Creates the steps composed in the builder directly inside a workspace, optionally saving them as a flow too. */
export async function buildProject(workspaceId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireInternal();
  if (!getWorkspaceForUser(workspaceId, user)) return { error: "Workspace not found." };
  const ws = getWorkspacePlain(workspaceId)!;
  const steps = parseStepsInput(str(fd, "steps", 200_000));
  if (!steps) return { error: "Every step needs a title." };
  if (!steps.length) return { error: "Add at least one step." };
  if (bool(fd, "save_as_flow")) {
    const name = str(fd, "flow_name", 200);
    if (!name) return { error: "Give the flow a name, or untick “Also save as a flow”." };
    run("INSERT INTO templates (id, name, description, steps, created_by, created_at) VALUES (?, ?, '', ?, ?, ?)", newId(), name, JSON.stringify(forTemplate(steps)), user.id, nowIso());
    revalidatePath("/templates");
  }
  createSteps(ws, steps, user, `built the project plan (${steps.length} steps)`);
  revalidatePath(`/workspaces/${workspaceId}`, "layout");
  revalidatePath("/tasks");
  redirect(`/workspaces/${workspaceId}/tasks`);
}
