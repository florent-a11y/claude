import { MessageSquare } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { peopleReport } from "@/lib/queries/reports";
import { listClients } from "@/lib/queries/clients";
import { setUserActive } from "@/lib/actions/team";
import { startDirect } from "@/lib/actions/dm";
import { ReportHeader } from "@/components/ReportTable";
import { PeopleTable } from "@/components/PeopleTable";
import { ConfirmButton } from "@/components/ConfirmButton";
import { InviteDialog, ResetPasswordForm } from "../users/AdminForms";

export const metadata = { title: "Clients" };

export default async function AdminClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const rows = peopleReport("client").filter((p) => (!q || `${p.name} ${p.email} ${p.client_name ?? ""}`.toLowerCase().includes(q)) && (sp.status === "active" ? p.active : sp.status === "deactivated" ? !p.active : true));
  return (
    <>
      <ReportHeader
        title="Clients"
        count={rows.length}
        actions={<InviteDialog kind="client" companies={listClients().map((c) => ({ id: c.id, name: c.name }))} />}
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
        kind="client"
        actions={(p) => (
          <span className="inline-flex flex-wrap items-center justify-end gap-1">
            {!!p.active && <form action={startDirect.bind(null, p.id)}><button className="btn btn-ghost btn-sm px-2" title="Message"><MessageSquare className="h-4 w-4" /></button></form>}
            <ResetPasswordForm userId={p.id} userName={p.name} />
            <form action={setUserActive.bind(null, p.id, !p.active)}>
              <ConfirmButton message={p.active ? `Deactivate ${p.name}? They will no longer be able to sign in.` : `Reactivate ${p.name}?`} className={`btn btn-sm ${p.active ? "btn-ghost text-red-600" : "btn-secondary"}`}>{p.active ? "Deactivate" : "Reactivate"}</ConfirmButton>
            </form>
          </span>
        )}
      />
    </>
  );
}
