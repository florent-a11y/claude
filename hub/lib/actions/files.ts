"use server";

import { revalidatePath } from "next/cache";
import { isInternal, requireUser } from "../auth";
import { run } from "../db";
import { MAX_UPLOAD_BYTES } from "../config";
import { getFile } from "../queries/files";
import { getWorkspaceForUser } from "../queries/workspaces";
import { deleteStoredFile, logSystem, notifyWorkspace, saveUpload } from "../services";
import { bool, str, type ActionState } from "./state";

export async function uploadFiles(workspaceId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const ws = getWorkspaceForUser(workspaceId, user);
  if (!ws) return { error: "Workspace not found." };
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose at least one file." };
  const folder = str(fd, "folder", 100);
  const internal = isInternal(user) && bool(fd, "internal");
  for (const f of files) {
    if (f.size > MAX_UPLOAD_BYTES) return { error: `${f.name} is larger than the 50 MB limit.` };
  }
  const names: string[] = [];
  for (const f of files) {
    const saved = await saveUpload(f, { workspaceId }, user, folder, internal);
    names.push(saved.name);
    logSystem(workspaceId, user.id, `uploaded ${saved.name}${folder ? ` to ${folder}` : ""}`, { internal, refType: "file", refId: saved.id, card: true });
  }
  notifyWorkspace(workspaceId, user.id, `New files in ${ws.name}`, names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : ""), `/workspaces/${workspaceId}/files`, internal);
  revalidatePath(`/workspaces/${workspaceId}`, "layout");
  return { ok: true };
}

export async function deleteFile(fileId: string): Promise<void> {
  const user = await requireUser();
  const file = getFile(fileId);
  if (!file) return;
  if (file.workspace_id) {
    const ws = getWorkspaceForUser(file.workspace_id, user);
    if (!ws) return;
    if (file.uploader_id !== user.id && !isInternal(user)) return;
  } else if (file.uploader_id !== user.id) {
    return;
  }
  run("DELETE FROM files WHERE id = ?", fileId);
  deleteStoredFile(file.storage_key);
  if (file.workspace_id) revalidatePath(`/workspaces/${file.workspace_id}`, "layout");
  if (file.conversation_id) revalidatePath(`/messages/${file.conversation_id}`);
}
