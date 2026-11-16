import { notFound } from "next/navigation";
import { can, isClient, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AuditLog } from "@/components/AuditTrail";
import { base, requireEntity, type Params, type Search } from "../shared";

export const dynamic = "force-dynamic";

/** Books → Audit log: the changes recorded for one entity (journal, invoices, bills, payments, payroll, tax, settings of the entity). Team roles only. */
export default async function EntityAuditLog({ params, searchParams }: { params: Params; searchParams: Search }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  if (isClient(user)) notFound();
  const users = await db.list("users", { orderBy: "name" });
  return (
    <div className="space-y-4 pb-8">
      <p className="max-w-3xl text-sm text-ink-500">Who created, edited, deleted, posted, voided, approved, paid, locked or imported each record of this entity, and when. Written automatically with every change and never edited afterwards. Times are Bali time (WITA).</p>
      <AuditLog base={`${base(entityId)}/audit`} params={sp} entityId={entityId} users={users} exportHref={can(user, "admin") ? "/settings/audit/export" : undefined} />
    </div>
  );
}
