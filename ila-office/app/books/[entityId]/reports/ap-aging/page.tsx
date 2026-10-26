import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { apAging } from "@/lib/ledger";
import { fmtDate, todayISO } from "@/lib/dates";
import { base, first, requireEntity, type Params, type Search } from "../../shared";
import { ReportHeader } from "../ReportHeader";
import { AgingTable } from "../AgingTable";

export const dynamic = "force-dynamic";

export default async function ApAgingPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const asOf = first(sp.asOf) ?? todayISO();
  const bills = await db.list("bills", { where: { entityId } });
  const report = apAging(bills, asOf);
  const b = base(entityId);
  return (
    <div className="pb-8">
      <ReportHeader title="Accounts payable aging" subtitle={`As of ${fmtDate(asOf)} · ${report.rows.length} open bills · ${report.groups.length} vendors`} entityLegalName={entity.legalName} csvHref={`/api/books/${entityId}/reports/ap-aging?asOf=${asOf}`}>
        <label className="block"><span className="label">As of</span><input name="asOf" type="date" defaultValue={asOf} className="input !py-1" /></label>
      </ReportHeader>
      <AgingTable report={report} docHref={(id) => `${b}/purchases/${id}`} who="Vendor" />
    </div>
  );
}
