import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page } from "@/components/ui";
import { AuditLog } from "@/components/AuditTrail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

/** Settings → Audit log (admins): every recorded change, in every entity and in the directory, with filters and a CSV export. */
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("admin");
  const sp = await searchParams;
  const [entities, users] = await Promise.all([db.list("entities", { orderBy: "name" }), db.list("users", { orderBy: "name" })]);
  return (
    <Page title="Audit log" subtitle="Who created, edited, deleted, posted, voided, approved, paid, locked or imported each record, and when. Written automatically with every change and never edited afterwards. Times are Bali time (WITA).">
      <AuditLog base="/settings/audit" params={sp} entities={entities} users={users} exportHref="/settings/audit/export" />
    </Page>
  );
}
