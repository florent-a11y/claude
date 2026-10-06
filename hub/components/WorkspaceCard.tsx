import Link from "next/link";
import { CheckSquare, ShieldCheck, Users } from "lucide-react";
import { WorkspaceStatusBadge } from "./Badge";
import { formatDate, isOverdue, timeAgo } from "@/lib/format";
import type { WorkspaceWithMeta } from "@/lib/types";

export function WorkspaceCard({ ws }: { ws: WorkspaceWithMeta }) {
  return (
    <Link href={`/workspaces/${ws.id}`} className="card group flex flex-col p-4 transition hover:border-indigo-300 hover:shadow-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {ws.client_name && (
            <div className="mb-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: ws.client_color ?? "#94a3b8" }} />
              <span className="truncate">{ws.client_name}</span>
            </div>
          )}
          <h3 className="truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-700">{ws.name}</h3>
        </div>
        <WorkspaceStatusBadge status={ws.status} />
      </div>
      {ws.description && <p className="mb-3 line-clamp-2 text-xs text-slate-500">{ws.description}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><CheckSquare className="h-3.5 w-3.5" /> {ws.open_tasks} open</span>
        {ws.pending_approvals > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-700"><ShieldCheck className="h-3.5 w-3.5" /> {ws.pending_approvals} pending</span>
        )}
        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {ws.member_count}</span>
        {ws.due_date && (
          <span className={isOverdue(ws.due_date, ws.status === "completed") ? "text-red-600" : ""}>Due {formatDate(ws.due_date)}</span>
        )}
        <span className="ml-auto">{timeAgo(ws.last_activity_at)}</span>
      </div>
    </Link>
  );
}
