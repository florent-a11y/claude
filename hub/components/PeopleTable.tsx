import Link from "next/link";
import { Avatar } from "./Avatar";
import { ReportTable } from "./ReportTable";
import { formatDate, timeAgo } from "@/lib/format";
import type { PersonRow } from "@/lib/queries/reports";

export function PeopleTable({ rows, kind, actions }: { rows: PersonRow[]; kind: "internal" | "client"; actions?: (p: PersonRow) => React.ReactNode }) {
  const columns = kind === "internal"
    ? ["Name", "Job Title", "Admin", "Status", "Workspaces", "Date Created", ...(actions ? [""] : [])]
    : ["Name", "Company", "Status", "Workspaces", "Date Created", "Last Active", ...(actions ? [""] : [])];
  return (
    <ReportTable columns={columns} empty={rows.length === 0}>
      {rows.map((p) => (
        <tr key={p.id} className={`hover:bg-slate-50 ${p.active ? "" : "text-slate-400"}`}>
          <td className="px-4 py-3">
            <span className="flex items-center gap-3">
              <Avatar name={p.name} color={p.active ? p.color : "#cbd5e1"} size="md" />
              <span className="min-w-0"><span className={`block truncate font-medium ${p.active ? "text-slate-900" : ""}`}>{p.name}</span><span className="block truncate text-xs text-slate-500">{p.email}</span></span>
            </span>
          </td>
          {kind === "internal" ? (
            <>
              <td className="px-4 py-3">{p.title || "—"}</td>
              <td className="px-4 py-3">{p.role === "admin" ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white">✓</span> : "–"}</td>
            </>
          ) : (
            <td className="px-4 py-3">{p.client_id ? <Link href={`/clients/${p.client_id}`} className="hover:text-indigo-700">{p.client_name}</Link> : "—"}</td>
          )}
          <td className="px-4 py-3"><span className={`badge ${p.active ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>{p.active ? "ACTIVE" : "DEACTIVATED"}</span></td>
          <td className="px-4 py-3">{p.workspace_count}</td>
          <td className="px-4 py-3">{formatDate(p.created_at)}</td>
          {kind === "client" && <td className="px-4 py-3">{p.last_login_at ? timeAgo(p.last_login_at) : "—"}</td>}
          {actions && <td className="px-4 py-3 text-right">{actions(p)}</td>}
        </tr>
      ))}
    </ReportTable>
  );
}
