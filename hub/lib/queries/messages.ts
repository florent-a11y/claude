import { all } from "../db";
import { isInternal } from "../auth";
import type { ApprovalWithMeta, FileWithMeta, MessageWithMeta, PublicUser, TaskWithMeta, TimelineRef } from "../types";

const BASE = `
  SELECT m.*, u.name AS user_name, u.color AS user_color, u.role AS user_role,
         f.name AS file_name, f.size AS file_size, f.mime AS file_mime
  FROM messages m
  LEFT JOIN users u ON u.id = m.user_id
  LEFT JOIN files f ON f.id = m.file_id`;

export function listMessages(workspaceId: string, user: PublicUser, limit = 200): MessageWithMeta[] {
  const vis = isInternal(user) ? "" : "AND m.internal = 0";
  const rows = all<MessageWithMeta>(
    `${BASE} WHERE m.workspace_id = ? ${vis} ORDER BY m.created_at DESC, m.rowid DESC LIMIT ?`,
    workspaceId,
    limit,
  );
  return attachRefs(rows.reverse(), user);
}

/** Messages created after a given ISO timestamp (for polling). */
export function listMessagesAfter(workspaceId: string, user: PublicUser, after: string): MessageWithMeta[] {
  const vis = isInternal(user) ? "" : "AND m.internal = 0";
  const rows = all<MessageWithMeta>(
    `${BASE} WHERE m.workspace_id = ? AND m.created_at > ? ${vis} ORDER BY m.created_at ASC, m.rowid ASC LIMIT 200`,
    workspaceId,
    after,
  );
  return attachRefs(rows, user);
}

const TASK_REF = `
  SELECT t.*, a.name AS assignee_name, a.color AS assignee_color, w.name AS workspace_name, c.name AS client_name
  FROM tasks t LEFT JOIN users a ON a.id = t.assignee_id JOIN workspaces w ON w.id = t.workspace_id LEFT JOIN clients c ON c.id = w.client_id`;
const APPROVAL_REF = `
  SELECT a.*, r.name AS requester_name, r.color AS requester_color, p.name AS approver_name, p.color AS approver_color,
         f.name AS file_name, w.name AS workspace_name, c.name AS client_name
  FROM approvals a LEFT JOIN users r ON r.id = a.requested_by LEFT JOIN users p ON p.id = a.approver_id
  LEFT JOIN files f ON f.id = a.file_id JOIN workspaces w ON w.id = a.workspace_id LEFT JOIN clients c ON c.id = w.client_id`;
const FILE_REF = `SELECT f.*, u.name AS uploader_name, u.color AS uploader_color FROM files f LEFT JOIN users u ON u.id = f.uploader_id`;

/** Attaches the current state of referenced tasks / approvals / files so the timeline can draw live cards. */
export function attachRefs(rows: MessageWithMeta[], user: PublicUser): MessageWithMeta[] {
  const ids = { task: new Set<string>(), approval: new Set<string>(), file: new Set<string>() };
  for (const m of rows) {
    if (m.ref_type === "task" || m.ref_type === "approval" || m.ref_type === "file") {
      if (m.ref_id) ids[m.ref_type].add(m.ref_id);
    }
  }
  const q = (sql: string, set: Set<string>, col: string) =>
    set.size ? all<Record<string, unknown> & { id: string }>(`${sql} WHERE ${col} IN (${[...set].map(() => "?").join(",")})`, ...set) : [];
  const internal = isInternal(user);
  const tasks = new Map((q(TASK_REF, ids.task, "t.id") as unknown as TaskWithMeta[]).filter((t) => internal || !t.internal).map((t) => [t.id, t]));
  const approvals = new Map((q(APPROVAL_REF, ids.approval, "a.id") as unknown as ApprovalWithMeta[]).map((a) => [a.id, a]));
  const files = new Map((q(FILE_REF, ids.file, "f.id") as unknown as FileWithMeta[]).filter((f) => internal || !f.internal).map((f) => [f.id, f]));
  return rows.map((m) => {
    let ref: TimelineRef | undefined;
    if (m.ref_id) {
      if (m.ref_type === "task" && tasks.has(m.ref_id)) ref = { kind: "task", task: tasks.get(m.ref_id)! };
      else if (m.ref_type === "approval" && approvals.has(m.ref_id)) ref = { kind: "approval", approval: approvals.get(m.ref_id)! };
      else if (m.ref_type === "file" && files.has(m.ref_id)) ref = { kind: "file", file: files.get(m.ref_id)! };
    }
    return ref ? { ...m, ref } : m;
  });
}

/** Everything that happened to one step: system events and comments (for the Action Details panel). */
export function listMessagesForRef(workspaceId: string, user: PublicUser, refId: string): MessageWithMeta[] {
  const vis = isInternal(user) ? "" : "AND m.internal = 0";
  return attachRefs(all<MessageWithMeta>(`${BASE} WHERE m.workspace_id = ? AND m.ref_id = ? ${vis} ORDER BY m.created_at ASC, m.rowid ASC LIMIT 300`, workspaceId, refId), user);
}

/** Recent activity across all workspaces the user can see. */
export function listRecentActivity(user: PublicUser, limit = 15): (MessageWithMeta & { workspace_name: string; client_name: string | null })[] {
  const internal = isInternal(user);
  const scope = internal ? "" : "AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = m.workspace_id AND wm.user_id = ?) AND m.internal = 0";
  const params: unknown[] = internal ? [limit] : [user.id, limit];
  return all(
    `SELECT m.*, u.name AS user_name, u.color AS user_color, u.role AS user_role,
            f.name AS file_name, f.size AS file_size, f.mime AS file_mime,
            w.name AS workspace_name, c.name AS client_name
     FROM messages m
     JOIN workspaces w ON w.id = m.workspace_id
     LEFT JOIN clients c ON c.id = w.client_id
     LEFT JOIN users u ON u.id = m.user_id
     LEFT JOIN files f ON f.id = m.file_id
     WHERE w.status IN ('active','on_hold') ${scope}
     ORDER BY m.created_at DESC LIMIT ?`,
    ...params,
  );
}
