import { all } from "../db";
import { isInternal, PUBLIC_USER_COLUMNS } from "../auth";
import { approvalToStep, taskToStep, type Step } from "../steps";
import { listWorkspaces } from "./workspaces";
import type { ApprovalWithMeta, PublicUser, TaskWithMeta, WorkspaceWithMeta } from "../types";

const TASKS = `
  SELECT t.*, a.name AS assignee_name, a.color AS assignee_color, w.name AS workspace_name, c.name AS client_name
  FROM tasks t LEFT JOIN users a ON a.id = t.assignee_id JOIN workspaces w ON w.id = t.workspace_id LEFT JOIN clients c ON c.id = w.client_id`;
const APPROVALS = `
  SELECT a.*, r.name AS requester_name, r.color AS requester_color, p.name AS approver_name, p.color AS approver_color,
         f.name AS file_name, w.name AS workspace_name, c.name AS client_name
  FROM approvals a LEFT JOIN users r ON r.id = a.requested_by LEFT JOIN users p ON p.id = a.approver_id
  LEFT JOIN files f ON f.id = a.file_id JOIN workspaces w ON w.id = a.workspace_id LEFT JOIN clients c ON c.id = w.client_id`;

export interface WorkspaceReportRow extends WorkspaceWithMeta {
  current: Step | null;
  assignee_names: string[];
}

/** Manage → Reports → Workspaces: every workspace with the step it is currently waiting on. */
export function workspaceReport(user: PublicUser, status: "open" | "all" = "open"): WorkspaceReportRow[] {
  const workspaces = listWorkspaces(user, { status });
  const vis = isInternal(user) ? "" : "AND t.internal = 0";
  const tasks = all<TaskWithMeta>(`${TASKS} WHERE t.status != 'done' ${vis} ORDER BY t.created_at ASC`);
  const approvals = all<ApprovalWithMeta>(`${APPROVALS} WHERE a.status = 'pending' ORDER BY a.created_at ASC`);
  const byWs = new Map<string, Step[]>();
  for (const t of tasks) byWs.set(t.workspace_id, [...(byWs.get(t.workspace_id) ?? []), taskToStep(t)]);
  for (const a of approvals) byWs.set(a.workspace_id, [...(byWs.get(a.workspace_id) ?? []), approvalToStep(a)]);
  return workspaces.map((w) => {
    const open = (byWs.get(w.id) ?? []).sort((x, y) => (x.created_at < y.created_at ? -1 : 1));
    const names = [...new Set(open.map((s) => s.assignee?.name).filter((n): n is string => !!n))];
    return { ...w, current: open[0] ?? null, assignee_names: names };
  });
}

export interface ActionReportRow extends Step {
  workspace_id: string;
  workspace_name: string;
  client_name: string | null;
}

/** Manage → Reports → Actions: every step across workspaces. */
export function actionsReport(user: PublicUser, scope: "open" | "all" = "open"): ActionReportRow[] {
  const vis = isInternal(user) ? "" : "AND t.internal = 0";
  const member = isInternal(user) ? "" : "AND EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id AND m.user_id = ?)";
  const p = isInternal(user) ? [] : [user.id];
  const tasks = all<TaskWithMeta>(`${TASKS} WHERE w.status IN ('active','on_hold') ${scope === "open" ? "AND t.status != 'done'" : ""} ${vis} ${member}`, ...p);
  const approvals = all<ApprovalWithMeta>(`${APPROVALS} WHERE w.status IN ('active','on_hold') ${scope === "open" ? "AND a.status = 'pending'" : ""} ${member.replace("w.id", "a.workspace_id")}`, ...p);
  const rows: ActionReportRow[] = [
    ...tasks.map((t) => ({ ...taskToStep(t), workspace_id: t.workspace_id, workspace_name: t.workspace_name, client_name: t.client_name })),
    ...approvals.map((a) => ({ ...approvalToStep(a), workspace_id: a.workspace_id, workspace_name: a.workspace_name, client_name: a.client_name })),
  ];
  return rows.sort((x, y) => (y.created_at < x.created_at ? -1 : 1));
}

export interface PersonRow extends PublicUser {
  client_name: string | null;
  workspace_count: number;
  last_login_at: string | null;
}

/** Internal users or client users with workspace counts and last sign-in. */
export function peopleReport(kind: "internal" | "client"): PersonRow[] {
  const cols = PUBLIC_USER_COLUMNS.split(", ").map((c) => "u." + c).join(", ");
  return all<PersonRow>(
    `SELECT ${cols}, c.name AS client_name,
       (SELECT COUNT(*) FROM workspace_members m WHERE m.user_id = u.id) AS workspace_count,
       (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login_at
     FROM users u LEFT JOIN clients c ON c.id = u.client_id
     WHERE ${kind === "client" ? "u.role = 'client'" : "u.role IN ('admin','member')"}
     ORDER BY u.active DESC, u.name COLLATE NOCASE`,
  );
}
