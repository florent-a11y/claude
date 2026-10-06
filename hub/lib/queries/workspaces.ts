import { all, one } from "../db";
import { isInternal } from "../auth";
import { PUBLIC_USER_COLUMNS } from "../auth";
import type { PublicUser, Workspace, WorkspaceStatus, WorkspaceWithMeta } from "../types";

const META = `
  SELECT w.*, c.name AS client_name, c.color AS client_color, o.name AS owner_name,
    (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id = w.id) AS member_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.workspace_id = w.id AND t.status != 'done' __TASKVIS__) AS open_tasks,
    (SELECT COUNT(*) FROM tasks t WHERE t.workspace_id = w.id AND t.status = 'done' __TASKVIS__) AS done_tasks,
    (SELECT COUNT(*) FROM approvals a WHERE a.workspace_id = w.id AND a.status = 'pending') AS pending_approvals,
    (SELECT COUNT(*) FROM approvals a WHERE a.workspace_id = w.id AND a.status IN ('approved','rejected')) AS decided_approvals,
    (SELECT m.body FROM messages m WHERE m.workspace_id = w.id __MSGVIS__ ORDER BY m.created_at DESC LIMIT 1) AS last_body,
    (SELECT u.name FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.workspace_id = w.id __MSGVIS__ ORDER BY m.created_at DESC LIMIT 1) AS last_author,
    (SELECT m.kind FROM messages m WHERE m.workspace_id = w.id __MSGVIS__ ORDER BY m.created_at DESC LIMIT 1) AS last_kind
  FROM workspaces w
  LEFT JOIN clients c ON c.id = w.client_id
  LEFT JOIN users o ON o.id = w.owner_id`;

function meta(user: Pick<PublicUser, "role">): string {
  const internal = isInternal(user);
  return META.replaceAll("__TASKVIS__", internal ? "" : "AND t.internal = 0").replaceAll("__MSGVIS__", internal ? "" : "AND m.internal = 0");
}

export interface WorkspaceFilter {
  status?: WorkspaceStatus | "all" | "open";
  clientId?: string;
  q?: string;
  mine?: boolean;
}

/** Workspaces visible to the user: all for the internal team, memberships only for clients. */
export function listWorkspaces(user: PublicUser, f: WorkspaceFilter = {}): WorkspaceWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!isInternal(user) || f.mine) {
    where.push("EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id AND m.user_id = ?)");
    params.push(user.id);
  }
  const status = f.status ?? "open";
  if (status === "open") where.push("w.status IN ('active','on_hold')");
  else if (status !== "all") {
    where.push("w.status = ?");
    params.push(status);
  }
  if (f.clientId) {
    where.push("w.client_id = ?");
    params.push(f.clientId);
  }
  if (f.q) {
    where.push("(w.name LIKE ? OR c.name LIKE ? OR w.description LIKE ?)");
    params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  const sql = `${meta(user)} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY w.last_activity_at DESC`;
  return all<WorkspaceWithMeta>(sql, ...params);
}

/** A workspace if the user may open it, else undefined. */
export function getWorkspaceForUser(id: string, user: PublicUser): WorkspaceWithMeta | undefined {
  const ws = one<WorkspaceWithMeta>(`${meta(user)} WHERE w.id = ?`, id);
  if (!ws) return undefined;
  if (isInternal(user)) return ws;
  return isMember(id, user.id) ? ws : undefined;
}

export function getWorkspacePlain(id: string): Workspace | undefined {
  return one<Workspace>("SELECT * FROM workspaces WHERE id = ?", id);
}

export function isMember(workspaceId: string, userId: string): boolean {
  return !!one("SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?", workspaceId, userId);
}

export interface MemberRow extends PublicUser {
  joined_at: string;
  client_name: string | null;
}

export function listMembers(workspaceId: string): MemberRow[] {
  return all<MemberRow>(
    `SELECT ${PUBLIC_USER_COLUMNS.split(", ").map((c) => "u." + c).join(", ")}, m.joined_at, c.name AS client_name
     FROM workspace_members m JOIN users u ON u.id = m.user_id LEFT JOIN clients c ON c.id = u.client_id
     WHERE m.workspace_id = ? ORDER BY u.role, u.name COLLATE NOCASE`,
    workspaceId,
  );
}

export function listMemberIds(workspaceId: string, internalOnly = false): string[] {
  const rows = all<{ user_id: string }>(
    `SELECT m.user_id FROM workspace_members m JOIN users u ON u.id = m.user_id
     WHERE m.workspace_id = ? AND u.active = 1 ${internalOnly ? "AND u.role != 'client'" : ""}`,
    workspaceId,
  );
  return rows.map((r) => r.user_id);
}

/** Workspaces with no activity for `days` days that are still active (follow-up candidates). */
export function listStaleWorkspaces(user: PublicUser, days = 5): WorkspaceWithMeta[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return all<WorkspaceWithMeta>(`${meta(user)} WHERE w.status = 'active' AND w.last_activity_at < ? ORDER BY w.last_activity_at ASC LIMIT 8`, cutoff);
}

export function countWorkspaces(status: WorkspaceStatus = "active"): number {
  return one<{ n: number }>("SELECT COUNT(*) AS n FROM workspaces WHERE status = ?", status)!.n;
}

export const STATUS_LABEL: Record<WorkspaceStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};
