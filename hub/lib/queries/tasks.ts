import { all, one } from "../db";
import { isInternal } from "../auth";
import { today } from "../format";
import type { PublicUser, Task, TaskWithMeta } from "../types";

const BASE = `
  SELECT t.*, a.name AS assignee_name, a.color AS assignee_color, w.name AS workspace_name, c.name AS client_name
  FROM tasks t
  LEFT JOIN users a ON a.id = t.assignee_id
  JOIN workspaces w ON w.id = t.workspace_id
  LEFT JOIN clients c ON c.id = w.client_id`;

const ORDER = `ORDER BY CASE t.status WHEN 'in_progress' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END,
  CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
  COALESCE(t.due_date, '9999') ASC, t.created_at ASC`;

export function listWorkspaceTasks(workspaceId: string, user: PublicUser): TaskWithMeta[] {
  const vis = isInternal(user) ? "" : "AND t.internal = 0";
  return all<TaskWithMeta>(`${BASE} WHERE t.workspace_id = ? ${vis} ${ORDER}`, workspaceId);
}

export function getTask(id: string): Task | undefined {
  return one<Task>("SELECT * FROM tasks WHERE id = ?", id);
}

export function getTaskWithMeta(id: string): TaskWithMeta | undefined {
  return one<TaskWithMeta>(`${BASE} WHERE t.id = ?`, id);
}

/** Open tasks assigned to the user, soonest first. */
export function listMyTasks(user: PublicUser, includeDone = false): TaskWithMeta[] {
  const vis = isInternal(user) ? "" : "AND t.internal = 0";
  const done = includeDone ? "" : "AND t.status != 'done'";
  return all<TaskWithMeta>(`${BASE} WHERE t.assignee_id = ? ${vis} ${done} AND w.status IN ('active','on_hold') ${ORDER}`, user.id);
}

/** All open tasks across active workspaces (team view). */
export function listAllOpenTasks(filter: { assigneeId?: string; overdue?: boolean } = {}): TaskWithMeta[] {
  const where: string[] = ["t.status != 'done'", "w.status IN ('active','on_hold')"];
  const params: unknown[] = [];
  if (filter.assigneeId === "unassigned") where.push("t.assignee_id IS NULL");
  else if (filter.assigneeId) {
    where.push("t.assignee_id = ?");
    params.push(filter.assigneeId);
  }
  if (filter.overdue) {
    where.push("t.due_date < ?");
    params.push(today());
  }
  return all<TaskWithMeta>(`${BASE} WHERE ${where.join(" AND ")} ${ORDER}`, ...params);
}

export function countMyOpenTasks(userId: string): { open: number; overdue: number } {
  const row = one<{ open: number; overdue: number }>(
    `SELECT COUNT(*) AS open, SUM(CASE WHEN t.due_date < ? THEN 1 ELSE 0 END) AS overdue
     FROM tasks t JOIN workspaces w ON w.id = t.workspace_id
     WHERE t.assignee_id = ? AND t.status != 'done' AND w.status IN ('active','on_hold')`,
    today(),
    userId,
  );
  return { open: row?.open ?? 0, overdue: row?.overdue ?? 0 };
}

export function countTeamOverdue(): number {
  return one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tasks t JOIN workspaces w ON w.id = t.workspace_id
     WHERE t.status != 'done' AND t.due_date < ? AND w.status IN ('active','on_hold')`,
    today(),
  )!.n;
}
