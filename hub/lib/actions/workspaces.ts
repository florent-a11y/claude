"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireInternal } from "../auth";
import { run, transaction } from "../db";
import { newId, nowIso } from "../ids";
import { getUser } from "../queries/users";
import { getWorkspaceForUser, getWorkspacePlain, isMember } from "../queries/workspaces";
import { notify } from "../queries/notifications";
import { applyTemplate, logSystem, touchWorkspace } from "../services";
import { bool, isDate, opt, str, type ActionState } from "./state";
import type { RoleMap, WorkspaceStatus } from "../types";

const STATUSES: WorkspaceStatus[] = ["active", "on_hold", "completed", "archived"];

export async function createWorkspace(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireInternal();
  const name = str(fd, "name", 200);
  if (!name) return { error: "Give the workspace a name." };
  const dueDate = opt(fd, "due_date", 10);
  if (!isDate(dueDate)) return { error: "Invalid due date." };
  const clientId = opt(fd, "client_id", 40);
  const templateId = opt(fd, "template_id", 40);
  const memberIds = fd.getAll("member_ids").filter((v): v is string => typeof v === "string");
  const id = newId();
  const ts = nowIso();
  transaction(() => {
    run(
      `INSERT INTO workspaces (id, name, description, client_id, status, owner_id, due_date, created_at, updated_at, last_activity_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      id, name, str(fd, "description", 5000), clientId, user.id, dueDate, ts, ts, ts,
    );
    const members = new Set<string>([user.id, ...memberIds]);
    for (const uid of members) {
      if (!getUser(uid)) continue;
      run("INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, joined_at) VALUES (?, ?, ?)", id, uid, ts);
    }
    logSystem(id, user.id, "created this workspace");
  });
  if (templateId) applyTemplate(getWorkspacePlain(id)!, templateId, user);
  notify([...memberIds], `Added to ${name}`, `${user.name} added you to a new workspace.`, `/workspaces/${id}`, user.id);
  redirect(`/workspaces/${id}`);
}

export async function updateWorkspace(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireInternal();
  const ws = getWorkspaceForUser(id, user);
  if (!ws) return { error: "Workspace not found." };
  const name = str(fd, "name", 200);
  if (!name) return { error: "Name is required." };
  const dueDate = opt(fd, "due_date", 10);
  if (!isDate(dueDate)) return { error: "Invalid due date." };
  const status = str(fd, "status", 20) as WorkspaceStatus;
  if (!STATUSES.includes(status)) return { error: "Invalid status." };
  const ownerId = opt(fd, "owner_id", 40);
  run(
    `UPDATE workspaces SET name = ?, description = ?, client_id = ?, status = ?, owner_id = ?, due_date = ?, updated_at = ? WHERE id = ?`,
    name, str(fd, "description", 5000), opt(fd, "client_id", 40), status, ownerId && getUser(ownerId) ? ownerId : null, dueDate, nowIso(), id,
  );
  if (status !== ws.status) {
    logSystem(id, user.id, `changed the status to ${status.replace("_", " ")}`);
  }
  revalidatePath(`/workspaces/${id}`, "layout");
  return { ok: true };
}

export async function setWorkspaceStatus(id: string, status: WorkspaceStatus): Promise<void> {
  const user = await requireInternal();
  if (!STATUSES.includes(status) || !getWorkspaceForUser(id, user)) return;
  run("UPDATE workspaces SET status = ?, updated_at = ? WHERE id = ?", status, nowIso(), id);
  logSystem(id, user.id, `changed the status to ${status.replace("_", " ")}`);
  revalidatePath(`/workspaces/${id}`, "layout");
  revalidatePath("/workspaces");
}

export async function addMember(workspaceId: string, fd: FormData): Promise<void> {
  const user = await requireInternal();
  const ws = getWorkspaceForUser(workspaceId, user);
  const uid = str(fd, "user_id", 40);
  const target = uid ? getUser(uid) : undefined;
  if (!ws || !target || isMember(workspaceId, uid)) return;
  run("INSERT INTO workspace_members (workspace_id, user_id, joined_at) VALUES (?, ?, ?)", workspaceId, uid, nowIso());
  logSystem(workspaceId, user.id, `added ${target.name} to the workspace`);
  notify([uid], `Added to ${ws.name}`, `${user.name} added you to the workspace.`, `/workspaces/${workspaceId}`, user.id);
  revalidatePath(`/workspaces/${workspaceId}`, "layout");
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  const user = await requireInternal();
  const ws = getWorkspaceForUser(workspaceId, user);
  const target = getUser(userId);
  if (!ws || !target) return;
  run("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?", workspaceId, userId);
  logSystem(workspaceId, user.id, `removed ${target.name} from the workspace`);
  revalidatePath(`/workspaces/${workspaceId}`, "layout");
}

export async function applyTemplateAction(workspaceId: string, fd: FormData): Promise<void> {
  const user = await requireInternal();
  const ws = getWorkspacePlain(workspaceId);
  const templateId = str(fd, "template_id", 40);
  if (!ws || !templateId) return;
  // role mapping comes as role:<name> = <user id>
  const roleMap: RoleMap = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("role:") && typeof v === "string") roleMap[k.slice(5)] = v || null;
  }
  const n = applyTemplate(ws, templateId, user, roleMap);
  if (n) touchWorkspace(workspaceId);
  revalidatePath(`/workspaces/${workspaceId}`, "layout");
  redirect(`/workspaces/${workspaceId}`);
}

export async function deleteWorkspace(id: string): Promise<void> {
  await requireAdmin();
  run("DELETE FROM workspaces WHERE id = ?", id);
  revalidatePath("/workspaces");
  redirect("/workspaces");
}
