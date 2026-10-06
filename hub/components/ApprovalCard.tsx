import Link from "next/link";
import { FileText, ThumbsDown, ThumbsUp, Trash2, XCircle } from "lucide-react";
import { Avatar } from "./Avatar";
import { ApprovalStatusBadge } from "./Badge";
import { ConfirmButton } from "./ConfirmButton";
import { cancelApproval, decideApproval, deleteApproval } from "@/lib/actions/approvals";
import { dueLabel, formatDateTime, isOverdue } from "@/lib/format";
import type { ApprovalWithMeta, PublicUser } from "@/lib/types";

export function ApprovalCard({ a, user, showWorkspace = false }: { a: ApprovalWithMeta; user: PublicUser; showWorkspace?: boolean }) {
  const canDecide = a.status === "pending" && (a.approver_id === user.id || user.role === "admin");
  const canCancel = a.status === "pending" && (a.requested_by === user.id || user.role !== "client");
  const overdue = isOverdue(a.due_date, a.status !== "pending");
  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <Avatar name={a.requester_name ?? "?"} color={a.requester_color} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{a.title}</span>
            <ApprovalStatusBadge status={a.status} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {a.requester_name} asked <span className="font-medium text-slate-700">{a.approver_name ?? "someone"}</span> · {formatDateTime(a.created_at)}
            {a.due_date && <span className={overdue ? " font-medium text-red-600" : ""}> · needed by {dueLabel(a.due_date)}</span>}
            {showWorkspace && (
              <> · <Link href={`/workspaces/${a.workspace_id}/approvals`} className="hover:text-indigo-600 hover:underline">{a.client_name ? `${a.client_name} · ` : ""}{a.workspace_name}</Link></>
            )}
          </p>
          {a.description && <p className="prose-sm-plain mt-2">{a.description}</p>}
          {a.file_id && (
            <a href={`/api/files/${a.file_id}`} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300" download>
              <FileText className="h-3.5 w-3.5 text-slate-400" /> {a.file_name}
            </a>
          )}
          {a.status !== "pending" && a.decision_note && (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-medium">Note:</span> {a.decision_note}</p>
          )}
          {canDecide && (
            <form action={decideApproval.bind(null, a.id)} className="mt-3 flex flex-wrap items-center gap-2">
              <input name="note" className="input w-64 py-1.5 text-xs" placeholder="Add a note (optional)" />
              <button name="decision" value="approved" className="btn btn-primary btn-sm bg-emerald-600 hover:bg-emerald-700"><ThumbsUp className="h-3.5 w-3.5" /> Approve</button>
              <button name="decision" value="rejected" className="btn btn-secondary btn-sm text-red-600"><ThumbsDown className="h-3.5 w-3.5" /> Reject</button>
            </form>
          )}
        </div>
        <div className="flex items-center gap-1">
          {canCancel && !canDecide && (
            <form action={cancelApproval.bind(null, a.id)}>
              <ConfirmButton message="Cancel this approval request?" className="btn btn-ghost btn-sm text-slate-500"><XCircle className="h-3.5 w-3.5" /> Cancel</ConfirmButton>
            </form>
          )}
          {user.role !== "client" && a.status !== "pending" && (
            <form action={deleteApproval.bind(null, a.id)}>
              <ConfirmButton message="Delete this approval record?" className="btn btn-ghost btn-sm px-2 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>
            </form>
          )}
        </div>
      </div>
    </li>
  );
}
