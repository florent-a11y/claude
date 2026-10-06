import Link from "next/link";
import { requireInternal } from "@/lib/auth";
import { actionsReport } from "@/lib/queries/reports";
import { ReportHeader, ReportTable } from "@/components/ReportTable";
import { Avatar } from "@/components/Avatar";
import { STATUS_LABEL, STEP_TYPES } from "@/lib/steps";
import { dueLabel, isOverdue } from "@/lib/format";

export const metadata = { title: "Actions report" };

export default async function ActionsReportPage({ searchParams }: { searchParams: Promise<{ scope?: string; type?: string }> }) {
  const user = await requireInternal();
  const sp = await searchParams;
  const scope = sp.scope === "all" ? "all" : "open";
  const rows = actionsReport(user, scope).filter((r) => !sp.type || r.kind === sp.type);
  return (
    <>
      <ReportHeader
        title="Actions"
        count={rows.length}
        filters={
          <form className="flex flex-wrap items-center gap-2">
            <select name="type" defaultValue={sp.type ?? ""} className="input w-auto py-1.5 text-sm">
              <option value="">All types</option>
              {(["task", "file_request", "acknowledgement", "approval"] as const).map((k) => <option key={k} value={k}>{STEP_TYPES[k].label}</option>)}
            </select>
            <select name="scope" defaultValue={scope} className="input w-auto py-1.5 text-sm">
              <option value="open">Open</option>
              <option value="all">All (incl. completed)</option>
            </select>
            <button className="btn btn-secondary btn-sm">Filter</button>
          </form>
        }
      />
      <ReportTable columns={["Action", "Workspace", "Assignee", "Status", "Due"]} empty={rows.length === 0}>
        {rows.map((r) => {
          const t = STEP_TYPES[r.kind];
          const overdue = isOverdue(r.due_date, r.status === "completed" || r.status === "cancelled");
          return (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/workspaces/${r.workspace_id}?step=${r.id}`} className="flex items-center gap-3">
                  <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.tint} ${t.text}`}><t.icon className="h-4 w-4" /></span>
                  <span className="min-w-0"><span className="block truncate font-medium text-slate-900">{r.title}</span><span className="block text-xs text-slate-500">{t.label}</span></span>
                </Link>
              </td>
              <td className="px-4 py-3"><Link href={`/workspaces/${r.workspace_id}`} className="text-slate-700 hover:text-indigo-700">{r.workspace_name}</Link>{r.client_name && <span className="block text-xs text-slate-500">{r.client_name}</span>}</td>
              <td className="px-4 py-3">{r.assignee ? <span className="inline-flex items-center gap-2 text-slate-700"><Avatar name={r.assignee.name} color={r.assignee.color} size="xs" /> {r.assignee.name}</span> : <span className="text-slate-400">—</span>}</td>
              <td className="px-4 py-3"><span className={`badge ${r.status === "completed" ? "bg-emerald-50 text-emerald-700" : r.status === "in_progress" ? "bg-sky-50 text-sky-700" : r.status === "rejected" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{STATUS_LABEL[r.status]}</span></td>
              <td className={`px-4 py-3 ${overdue ? "font-medium text-red-600" : "text-slate-600"}`}>{r.due_date ? dueLabel(r.due_date) : "—"}</td>
            </tr>
          );
        })}
      </ReportTable>
    </>
  );
}
