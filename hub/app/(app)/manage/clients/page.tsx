import Link from "next/link";
import { requireInternal } from "@/lib/auth";
import { peopleReport } from "@/lib/queries/reports";
import { ReportHeader } from "@/components/ReportTable";
import { PeopleTable } from "@/components/PeopleTable";

export const metadata = { title: "Clients report" };

export default async function ClientsReportPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requireInternal();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const rows = peopleReport("client").filter((p) => (!q || `${p.name} ${p.email} ${p.client_name ?? ""}`.toLowerCase().includes(q)) && (sp.status === "active" ? p.active : sp.status === "deactivated" ? !p.active : true));
  return (
    <>
      <ReportHeader
        title="Clients"
        count={rows.length}
        actions={user.role === "admin" && <Link href="/admin/clients" className="btn btn-primary btn-sm">Invite</Link>}
        filters={
          <form className="flex flex-wrap items-center gap-2">
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Search for user…" className="input w-64 py-1.5 text-sm" />
            <select name="status" defaultValue={sp.status ?? ""} className="input w-auto py-1.5 text-sm"><option value="">Status: All</option><option value="active">Active</option><option value="deactivated">Deactivated</option></select>
            <button className="btn btn-secondary btn-sm">Filter</button>
          </form>
        }
      />
      <PeopleTable rows={rows} kind="client" />
    </>
  );
}
