"use server";

import { revalidatePath } from "next/cache";
import { isInternal, requireUser } from "../auth";
import { run } from "../db";
import { newId, nowIso } from "../ids";
import { MAX_UPLOAD_BYTES } from "../config";
import { getApproval } from "../queries/approvals";
import { getFile } from "../queries/files";
import { getUser } from "../queries/users";
import { getWorkspaceForUser } from "../queries/workspaces";
import { notify } from "../queries/notifications";
import { logSystem, saveUpload, touchWorkspace } from "../services";
import { isDate, opt, str, type ActionState } from "./state";

function revalidate(workspaceId: string) {
  revalidatePath(`/workspaces/${workspaceId}`, "layout");
  revalidatePath("/approvals");
  revalidatePath("/");
}

export async function createApproval(workspaceId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const ws = getWorkspaceForUser(workspaceId, user);
  if (!ws) return { error: "Workspace not found." };
  const title = str(fd, "title", 300);
  if (!title) return { error: "Give the approval a title." };
  const approverId = str(fd, "approver_id", 40);
  const approver = approverId ? getUser(approverId) : undefined;
  if (!approver) return { error: "Choose who needs to approve." };
  const due = opt(fd, "due_date", 10);
  if (!isDate(due)) return { error: "Invalid due date." };
  let fileId = opt(fd, "file_id", 40);
  if (fileId && getFile(fileId)?.workspace_id !== workspaceId) fileId = null;
  const upload = fd.get("file");
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > MAX_UPLOAD_BYTES) return { error: "File is larger than the 50 MB limit." };
    fileId = (await saveUpload(upload, workspaceId, user, "Approvals", false)).id;
  }
  const id = newId();
  run(
    `INSERT INTO approvals (id, workspace_id, title, description, requested_by, approver_id, file_id, status, decision_note, due_date, decided_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, NULL, ?)`,
    id, workspaceId, title, str(fd, "description", 5000), user.id, approver.id, fileId, due, nowIso(),
  );
  logSystem(workspaceId, user.id, `requested approval from ${approver.name}: ${title}`, { refType: "approval", refId: id, fileId: fileId ?? undefined });
  if (approver.id !== user.id) {
    notify([approver.id], `Approval requested in ${ws.name}`, title, `/workspaces/${workspaceId}/approvals`);
  }
  revalidate(workspaceId);
  return { ok: true };
}

export async function decideApproval(approvalId: string, fd: FormData): Promise<void> {
  const user = await requireUser();
  const a = getApproval(approvalId);
  if (!a || a.status !== "pending") return;
  if (a.approver_id !== user.id && user.role !== "admin") return;
  const decision = str(fd, "decision", 10);
  if (decision !== "approved" && decision !== "rejected") return;
  const note = str(fd, "note", 2000);
  run("UPDATE approvals SET status = ?, decision_note = ?, decided_at = ? WHERE id = ?", decision, note, nowIso(), approvalId);
  logSystem(a.workspace_id, user.id, `${decision} "${a.title}"${note ? ` — ${note}` : ""}`, { refType: "approval", refId: approvalId });
  if (a.requested_by && a.requested_by !== user.id) {
    notify([a.requested_by], `${decision === "approved" ? "Approved" : "Rejected"}: ${a.title}`, note || `${user.name} ${decision} your request.`, `/workspaces/${a.workspace_id}/approvals`);
  }
  revalidate(a.workspace_id);
}

export async function cancelApproval(approvalId: string): Promise<void> {
  const user = await requireUser();
  const a = getApproval(approvalId);
  if (!a || a.status !== "pending") return;
  if (a.requested_by !== user.id && !isInternal(user)) return;
  run("UPDATE approvals SET status = 'cancelled', decided_at = ? WHERE id = ?", nowIso(), approvalId);
  touchWorkspace(a.workspace_id);
  revalidate(a.workspace_id);
}

export async function deleteApproval(approvalId: string): Promise<void> {
  const user = await requireUser();
  const a = getApproval(approvalId);
  if (!a || !isInternal(user)) return;
  run("DELETE FROM approvals WHERE id = ?", approvalId);
  revalidate(a.workspace_id);
}
