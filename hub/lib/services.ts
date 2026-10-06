import fs from "node:fs";
import path from "node:path";
import { one, run, transaction } from "./db";
import { UPLOAD_DIR } from "./config";
import { newId, nowIso } from "./ids";
import { addDays } from "./format";
import { notify } from "./queries/notifications";
import { listMemberIds } from "./queries/workspaces";
import { getTemplate, parseSteps } from "./queries/templates";
import type { FileRow, PublicUser, TemplateStep, Workspace } from "./types";

export function touchWorkspace(workspaceId: string): void {
  const ts = nowIso();
  run("UPDATE workspaces SET last_activity_at = ?, updated_at = ? WHERE id = ?", ts, ts, workspaceId);
}

/** Append a system line to the workspace conversation (e.g. "Florent created a task"). */
export function logSystem(
  workspaceId: string,
  userId: string | null,
  body: string,
  opts: { internal?: boolean; refType?: string; refId?: string; fileId?: string } = {},
): void {
  run(
    `INSERT INTO messages (id, workspace_id, user_id, kind, body, internal, file_id, ref_type, ref_id, created_at)
     VALUES (?, ?, ?, 'system', ?, ?, ?, ?, ?, ?)`,
    newId(),
    workspaceId,
    userId,
    body,
    opts.internal ? 1 : 0,
    opts.fileId ?? null,
    opts.refType ?? null,
    opts.refId ?? null,
    nowIso(),
  );
  touchWorkspace(workspaceId);
}

/** Notify every member of a workspace except the actor. Internal-only events skip client members. */
export function notifyWorkspace(workspaceId: string, actorId: string, title: string, body: string, href: string, internalOnly = false): void {
  notify(listMemberIds(workspaceId, internalOnly), title, body, href, actorId);
}

export type UploadScope = { workspaceId: string; conversationId?: undefined } | { conversationId: string; workspaceId?: undefined };

export async function saveUpload(file: File, scope: UploadScope, uploader: PublicUser, folder = "", internal = false): Promise<FileRow> {
  const id = newId();
  const safeName = (file.name || "file").replace(/[\\/:*?"<>|]/g, "_").slice(0, 200);
  const owner = scope.workspaceId ?? `dm-${scope.conversationId}`;
  const key = `${owner}/${id}${path.extname(safeName).toLowerCase()}`;
  const dest = path.join(UPLOAD_DIR, key);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
  const row: FileRow = {
    id,
    workspace_id: scope.workspaceId ?? null,
    conversation_id: scope.conversationId ?? null,
    uploader_id: uploader.id,
    name: safeName,
    size: file.size,
    mime: file.type || "application/octet-stream",
    storage_key: key,
    folder: folder.trim(),
    internal: internal ? 1 : 0,
    created_at: nowIso(),
  };
  run(
    `INSERT INTO files (id, workspace_id, conversation_id, uploader_id, name, size, mime, storage_key, folder, internal, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id, row.workspace_id, row.conversation_id, row.uploader_id, row.name, row.size, row.mime, row.storage_key, row.folder, row.internal, row.created_at,
  );
  return row;
}

export function deleteStoredFile(storageKey: string): void {
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, storageKey));
  } catch {
    /* already gone */
  }
}

/** Create the tasks / file requests / approvals of a template inside a workspace. */
export function applyTemplate(ws: Workspace, templateId: string, actor: PublicUser): number {
  const tpl = getTemplate(templateId);
  if (!tpl) return 0;
  const steps = parseSteps(tpl.steps);
  if (!steps.length) return 0;
  return createSteps(ws, steps, actor, `applied the "${tpl.name}" flow (${steps.length} steps)`);
}

/** Create a list of steps (tasks, file requests, approvals, messages) inside a workspace. */
export function createSteps(ws: Workspace, steps: TemplateStep[], actor: PublicUser, summary: string): number {
  if (!steps.length) return 0;
  const ts = nowIso();
  const members = listMemberIds(ws.id);
  const memberSet = new Set(members);
  const firstClient = members.find((id) => id !== actor.id && isClientMember(ws.id, id)) ?? null;
  transaction(() => {
    for (const step of steps) {
      const due = step.due_in_days == null ? null : addDays(step.due_in_days);
      const assignee = step.assignee_id && memberSet.has(step.assignee_id) ? step.assignee_id : resolveAssignee(step, actor, firstClient, ws.owner_id);
      if (step.type === "message") {
        run(
          `INSERT INTO messages (id, workspace_id, user_id, kind, body, internal, file_id, ref_type, ref_id, created_at)
           VALUES (?, ?, ?, 'text', ?, ?, NULL, NULL, NULL, ?)`,
          newId(), ws.id, actor.id, step.description?.trim() || step.title, step.internal ? 1 : 0, ts,
        );
      } else if (step.type === "approval") {
        run(
          `INSERT INTO approvals (id, workspace_id, title, description, requested_by, approver_id, file_id, status, decision_note, due_date, decided_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', '', ?, NULL, ?)`,
          newId(), ws.id, step.title, step.description ?? "", actor.id, assignee, due, ts,
        );
      } else {
        run(
          `INSERT INTO tasks (id, workspace_id, title, description, kind, assignee_id, due_date, status, priority, internal, created_by, created_at, updated_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'todo', 'normal', ?, ?, ?, ?, NULL)`,
          newId(), ws.id, step.title, step.description ?? "", step.type === "file_request" ? "file_request" : "task", assignee, due, step.internal ? 1 : 0, actor.id, ts, ts,
        );
      }
    }
    logSystem(ws.id, actor.id, summary);
  });
  return steps.length;
}

function isClientMember(workspaceId: string, userId: string): boolean {
  return !!one(
    "SELECT 1 FROM workspace_members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? AND m.user_id = ? AND u.role = 'client'",
    workspaceId,
    userId,
  );
}

function resolveAssignee(step: TemplateStep, actor: PublicUser, firstClient: string | null, ownerId: string | null): string | null {
  if (step.assign_to === "client") return firstClient;
  if (step.assign_to === "team") return ownerId ?? actor.id;
  return null;
}
