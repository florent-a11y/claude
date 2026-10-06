import { MessageSquare } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { peopleReport } from "@/lib/queries/reports";
import { setUserActive, setUserRole } from "@/lib/actions/team";
import { startDirect } from "@/lib/actions/dm";
import { ReportHeader } from "@/components/ReportTable";
import { PeopleTable } from "@/components/PeopleTable";
import { ConfirmButton } from "@/components/ConfirmButton";
import { InviteDialog, ResetPasswordForm } from "./AdminForms";

export const metadata = { title: "Internal Users" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const rows = peopleReport("internal").filter((p) => (!q || `${p.name} ${p.email} ${p.title}`.toLowerCase().includes(q)) && (sp.status === "active" ? p.active : sp.status === "deactivated" ? !p.active : true));
  return (
    <>
      <ReportHeader
        title="Internal Users"
        count={rows.length}
        actions={<InviteDialog kind="internal" />}
        filters={
          <form className="flex flex-wrap items-center gap-2">
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Search for user…" className="input w-64 py-1.5 text-sm" />
            <select name="status" defaultValue={sp.status ?? ""} className="input w-auto py-1.5 text-sm"><option value="">Status: All</option><option value="active">Active</option><option value="deactivated">Deactivated</option></select>
            <button className="btn btn-secondary btn-sm">Filter</button>
          </form>
        }
      />
      <PeopleTable
        rows={rows}
        kind="internal"
        actions={(p) =>
          p.id === me.id ? <span className="text-xs text-slate-400">You</span> : (
            <span className="inline-flex flex-wrap items-center justify-end gap-1">
              {!!p.active && <form action={startDirect.bind(null, p.id)}><button className="btn btn-ghost btn-sm px-2" title="Message"><MessageSquare className="h-4 w-4" /></button></form>}
              <form action={setUserRole.bind(null, p.id, p.role === "admin" ? "member" : "admin")}><button className="btn btn-ghost btn-sm">{p.role === "admin" ? "Remove admin" : "Make admin"}</button></form>
              <ResetPasswordForm userId={p.id} userName={p.name} />
              <form action={setUserActive.bind(null, p.id, !p.active)}>
                <ConfirmButton message={p.active ? `Deactivate ${p.name}? They will be signed out immediately.` : `Reactivate ${p.name}?`} className={`btn btn-sm ${p.active ? "btn-ghost text-red-600" : "btn-secondary"}`}>{p.active ? "Deactivate" : "Reactivate"}</ConfirmButton>
              </form>
            </span>
          )
        }
      />
    </>
  );
}
