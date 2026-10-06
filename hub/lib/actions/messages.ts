"use server";

import { revalidatePath } from "next/cache";
import { isInternal, requireUser } from "../auth";
import { one, run } from "../db";
import { newId, nowIso } from "../ids";
import { MAX_UPLOAD_BYTES } from "../config";
import { getWorkspaceForUser } from "../queries/workspaces";
import { notifyWorkspace, saveUpload, touchWorkspace } from "../services";
import { bool, str } from "./state";
import type { Message } from "../types";

export async function postMessage(workspaceId: string, fd: FormData): Promise<void> {
  const user = await requireUser();
  const ws = getWorkspaceForUser(workspaceId, user);
  if (!ws) return;
  const body = str(fd, "body", 10_000);
  const internal = isInternal(user) && bool(fd, "internal");
  const file = fd.get("file");
  let fileId: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) return;
    const saved = await saveUpload(file, { workspaceId }, user, "", internal);
    fileId = saved.id;
  }
  if (!body && !fileId) return;
  // Optional reference to a step (a comment made from the Action Details panel shows as "Re: <step>" in the chat).
  let refType: string | null = str(fd, "ref_type", 20) || null;
  let refId: string | null = str(fd, "ref_id", 40) || null;
  if (refType === "task") {
    if (!one("SELECT 1 FROM tasks WHERE id = ? AND workspace_id = ?", refId, workspaceId)) refType = refId = null;
  } else if (refType === "approval") {
    if (!one("SELECT 1 FROM approvals WHERE id = ? AND workspace_id = ?", refId, workspaceId)) refType = refId = null;
  } else {
    refType = refId = null;
  }
  const id = newId();
  run(
    `INSERT INTO messages (id, workspace_id, user_id, kind, body, internal, file_id, ref_type, ref_id, card, created_at)
     VALUES (?, ?, ?, 'text', ?, ?, ?, ?, ?, 0, ?)`,
    id, workspaceId, user.id, body, internal ? 1 : 0, fileId, refType, refId, nowIso(),
  );
  touchWorkspace(workspaceId);
  const preview = body ? body.slice(0, 120) : "Shared a file";
  notifyWorkspace(workspaceId, user.id, `${user.name} in ${ws.name}`, preview, `/workspaces/${workspaceId}`, internal);
  revalidatePath(`/workspaces/${workspaceId}`);
}

export async function deleteMessage(id: string): Promise<void> {
  const user = await requireUser();
  const msg = one<Message>("SELECT * FROM messages WHERE id = ?", id);
  if (!msg) return;
  if (msg.user_id !== user.id && user.role !== "admin") return;
  run("DELETE FROM messages WHERE id = ?", id);
  revalidatePath(`/workspaces/${msg.workspace_id}`);
}
