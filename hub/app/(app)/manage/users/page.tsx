import Link from "next/link";
import { requireInternal } from "@/lib/auth";
import { peopleReport } from "@/lib/queries/reports";
import { ReportHeader } from "@/components/ReportTable";
import { PeopleTable } from "@/components/PeopleTable";

export const metadata = { title: "Internal users report" };

export default async function UsersReportPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireInternal();
  const { q = "" } = await searchParams;
  const t = q.trim().toLowerCase();
  const rows = peopleReport("internal").filter((p) => !t || `${p.name} ${p.email} ${p.title}`.toLowerCase().includes(t));
  return (
    <>
      <ReportHeader
        title="Internal Users"
        count={rows.length}
        actions={user.role === "admin" && <Link href="/admin/users" className="btn btn-primary btn-sm">Invite</Link>}
        filters={<form className="flex items-center gap-2"><input name="q" defaultValue={q} placeholder="Search for user…" className="input w-64 py-1.5 text-sm" /><button className="btn btn-secondary btn-sm">Filter</button></form>}
      />
      <PeopleTable rows={rows} kind="internal" />
    </>
  );
}
