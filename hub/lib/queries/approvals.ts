import { all, one } from "../db";
import type { Approval, ApprovalWithMeta } from "../types";

const BASE = `
  SELECT a.*, r.name AS requester_name, r.color AS requester_color, p.name AS approver_name, p.color AS approver_color,
         f.name AS file_name, w.name AS workspace_name, c.name AS client_name
  FROM approvals a
  LEFT JOIN users r ON r.id = a.requested_by
  LEFT JOIN users p ON p.id = a.approver_id
  LEFT JOIN files f ON f.id = a.file_id
  JOIN workspaces w ON w.id = a.workspace_id
  LEFT JOIN clients c ON c.id = w.client_id`;

const ORDER = `ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, COALESCE(a.due_date, '9999') ASC, a.created_at DESC`;

export function listWorkspaceApprovals(workspaceId: string): ApprovalWithMeta[] {
  return all<ApprovalWithMeta>(`${BASE} WHERE a.workspace_id = ? ${ORDER}`, workspaceId);
}

export function getApproval(id: string): Approval | undefined {
  return one<Approval>("SELECT * FROM approvals WHERE id = ?", id);
}

export function getApprovalWithMeta(id: string): ApprovalWithMeta | undefined {
  return one<ApprovalWithMeta>(`${BASE} WHERE a.id = ?`, id);
}

/** Approvals waiting on the user. */
export function listApprovalsForMe(userId: string): ApprovalWithMeta[] {
  return all<ApprovalWithMeta>(`${BASE} WHERE a.approver_id = ? AND a.status = 'pending' ${ORDER}`, userId);
}

/** Approvals the user requested (any status). */
export function listApprovalsByMe(userId: string): ApprovalWithMeta[] {
  return all<ApprovalWithMeta>(`${BASE} WHERE a.requested_by = ? ${ORDER} LIMIT 50`, userId);
}

export function listAllPendingApprovals(): ApprovalWithMeta[] {
  return all<ApprovalWithMeta>(`${BASE} WHERE a.status = 'pending' AND w.status IN ('active','on_hold') ${ORDER}`);
}

export function countApprovalsForMe(userId: string): number {
  return one<{ n: number }>("SELECT COUNT(*) AS n FROM approvals WHERE approver_id = ? AND status = 'pending'", userId)!.n;
}
