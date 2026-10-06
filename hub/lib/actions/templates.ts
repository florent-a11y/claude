"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireInternal } from "../auth";
import { run } from "../db";
import { newId, nowIso } from "../ids";
import { getTemplate } from "../queries/templates";
import { str, type ActionState } from "./state";
import type { TemplateStep } from "../types";

function readSteps(fd: FormData): TemplateStep[] {
  const titles = fd.getAll("step_title");
  const steps: TemplateStep[] = [];
  titles.forEach((t, i) => {
    const title = typeof t === "string" ? t.trim().slice(0, 300) : "";
    if (!title) return;
    const type = String(fd.getAll("step_type")[i] ?? "task");
    const dueRaw = String(fd.getAll("step_due")[i] ?? "").trim();
    const assign = String(fd.getAll("step_assign")[i] ?? "none");
    steps.push({
      type: type === "approval" || type === "file_request" ? type : "task",
      title,
      description: String(fd.getAll("step_description")[i] ?? "").trim().slice(0, 2000),
      due_in_days: dueRaw === "" ? null : Math.max(0, Math.min(3650, Number(dueRaw) || 0)),
      assign_to: assign === "team" || assign === "client" ? assign : "none",
      internal: String(fd.getAll("step_internal")[i] ?? "") === "1",
    });
  });
  return steps;
}

export async function saveTemplate(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireInternal();
  const id = str(fd, "id", 40);
  const name = str(fd, "name", 200);
  if (!name) return { error: "Give the flow a name." };
  const steps = readSteps(fd);
  if (!steps.length) return { error: "Add at least one step." };
  const description = str(fd, "description", 2000);
  if (id && getTemplate(id)) {
    run("UPDATE templates SET name = ?, description = ?, steps = ? WHERE id = ?", name, description, JSON.stringify(steps), id);
  } else {
    run(
      "INSERT INTO templates (id, name, description, steps, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      newId(), name, description, JSON.stringify(steps), user.id, nowIso(),
    );
  }
  revalidatePath("/templates");
  redirect("/templates");
}

export async function deleteTemplate(id: string): Promise<void> {
  await requireInternal();
  run("DELETE FROM templates WHERE id = ?", id);
  revalidatePath("/templates");
}
