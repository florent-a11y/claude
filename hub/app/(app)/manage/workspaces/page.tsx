import Link from "next/link";
import { requireInternal } from "@/lib/auth";
import { workspaceReport } from "@/lib/queries/reports";
import { ReportHeader, ReportTable } from "@/components/ReportTable";
import { HexIcon } from "@/components/WorkspaceList";
import { WorkspaceStatusBadge } from "@/components/Badge";
import { STATUS_LABEL, STEP_TYPES } from "@/lib/steps";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Workspaces report" };

export default async function WorkspacesReportPage({ searchParams }: { searchParams: Promise<{ scope?: string; q?: string }> }) {
  const user = await requireInternal();
  const sp = await searchParams;
  const scope = sp.scope === "all" ? "all" : "open";
  const q = (sp.q ?? "").trim().toLowerCase();
  const rows = workspaceReport(user, scope).filter((r) => !q || `${r.name} ${r.client_name ?? ""}`.toLowerCase().includes(q));
  return (
    <>
      <ReportHeader
        title="Workspaces"
        count={rows.length}
        filters={
          <form className="flex flex-wrap items-center gap-2">
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Workspace name" className="input w-56 py-1.5 text-sm" />
            <select name="scope" defaultValue={scope} className="input w-auto py-1.5 text-sm">
              <option value="open">Open workspaces</option>
              <option value="all">All workspaces</option>
            </select>
            <button className="btn btn-secondary btn-sm">Filter</button>
          </form>
        }
      />
      <ReportTable columns={["Workspace Name", "Current Action", "Current Assignees", "Workspace Status", "Owned By"]} empty={rows.length === 0}>
        {rows.map((r) => {
          const total = r.open_tasks + r.done_tasks + r.pending_approvals + r.decided_approvals;
          const done = r.done_tasks + r.decided_approvals;
          const pct = total ? Math.round((done / total) * 100) : 0;
          const t = r.current ? STEP_TYPES[r.current.kind] : null;
          return (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/workspaces/${r.id}`} className="flex items-center gap-3">
                  <HexIcon color={r.client_color ?? "#64748b"} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900 hover:text-indigo-700">{r.name}</span>
                    <span className="mt-1 block h-1 w-36 overflow-hidden rounded bg-slate-100"><span className="block h-full bg-indigo-500" style={{ width: `${pct}%` }} /></span>
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3">
                {r.current && t ? (
                  <Link href={`/workspaces/${r.id}?step=${r.current.id}`} className="flex items-center gap-3">
                    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.tint} ${t.text}`}><t.icon className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{r.current.title}</span>
                      <span className="block text-xs text-slate-500">{t.label} • {STATUS_LABEL[r.current.status]}</span>
                    </span>
                  </Link>
                ) : <span className="text-xs text-slate-400">No open action</span>}
              </td>
              <td className="px-4 py-3 text-slate-700">{r.assignee_names.length === 0 ? "—" : r.assignee_names.length === 1 ? r.assignee_names[0] : `${r.assignee_names.length} Assignees`}</td>
              <td className="px-4 py-3"><WorkspaceStatusBadge status={r.status} /></td>
              <td className="px-4 py-3"><span className="block text-slate-900">{r.owner_name ?? "—"}</span><span className="block text-xs text-slate-500">{timeAgo(r.last_activity_at)}</span></td>
            </tr>
          );
        })}
      </ReportTable>
    </>
  );
}
