import { all } from "../db";
import { isInternal } from "../auth";
import type { MessageWithMeta, PublicUser } from "../types";

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
  return rows.reverse();
}

/** Messages created after a given ISO timestamp (for polling). */
export function listMessagesAfter(workspaceId: string, user: PublicUser, after: string): MessageWithMeta[] {
  const vis = isInternal(user) ? "" : "AND m.internal = 0";
  return all<MessageWithMeta>(
    `${BASE} WHERE m.workspace_id = ? AND m.created_at > ? ${vis} ORDER BY m.created_at ASC, m.rowid ASC LIMIT 200`,
    workspaceId,
    after,
  );
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
