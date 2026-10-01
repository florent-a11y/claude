import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { fiscalYearStartOf } from "@/lib/ledger";
import { Card } from "@/components/ui";
import { base, requireEntity, type Params } from "../shared";

export const dynamic = "force-dynamic";

export default async function Reports({ params }: { params: Params }) {
  await requireUser();
  const { entityId } = await params;
  const entity = await requireEntity(entityId);
  const today = todayISO();
  const fy = fiscalYearStartOf(today, entity.fiscalYearStartMonth);
  const b = `${base(entityId)}/reports`;
  const items = [
    { href: `${b}/trial-balance?asOf=${today}`, title: "Trial balance", text: "Every account with a balance as of a date; debits must equal credits." },
    { href: `${b}/profit-loss?from=${fy}&to=${today}&compare=1`, title: "Profit & loss", text: "Revenue, cost of sales, operating expenses and net profit for a range, with a comparison column." },
    { href: `${b}/balance-sheet?asOf=${today}`, title: "Balance sheet", text: "Assets, liabilities and equity including retained and current-year earnings." },
    { href: `${b}/general-ledger?from=${fy}&to=${today}`, title: "General ledger", text: "Movements of one account with opening balance and running balance." },
    { href: `${b}/ar-aging?asOf=${today}`, title: "AR aging", text: "Open invoices by customer and days past due (current, 1-30, 31-60, 61-90, 90+)." },
    { href: `${b}/ap-aging?asOf=${today}`, title: "AP aging", text: "Open bills by vendor and days past due." },
  ];
  return (
    <div className="pb-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => <Link key={i.href} href={i.href} className="card block hover:border-brand-500"><p className="font-semibold text-brand-700">{i.title}</p><p className="mt-1 text-sm text-ink-500">{i.text}</p></Link>)}
      </div>
      <Card title="Exports" className="mt-4">
        <p className="text-sm text-ink-500">Every report has a CSV export; the chart of accounts and the journal can also be exported: <Link className="text-brand-600 underline" href={`/api/books/${entityId}/reports/accounts`}>accounts.csv</Link> · <Link className="text-brand-600 underline" href={`/api/books/${entityId}/reports/journal?from=${fy}&to=${today}`}>journal.csv</Link></p>
      </Card>
    </div>
  );
}
