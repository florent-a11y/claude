import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { docDisplayStatus, invoiceOutstanding } from "@/lib/ledger";
import { fmtDate, todayISO } from "@/lib/dates";
import { fmtMoney, toIDR } from "@/lib/money";
import { Card, Badge, statusTone, Money, Chips, EmptyState, withParams, Stat } from "@/components/ui";
import { AutoSubmitInput } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../shared";

export const dynamic = "force-dynamic";
const STATUSES = ["draft", "sent", "partial", "overdue", "paid", "void"];

export default async function Sales({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const today = todayISO();
  const status = first(sp.status), q = first(sp.q)?.toLowerCase(), year = first(sp.year);
  const all = (await db.list("invoices", { where: { entityId } })).map((i) => ({ i, display: docDisplayStatus(i, today) }));
  const years = [...new Set(all.map((x) => x.i.date.slice(0, 4)))].sort().reverse();
  const rows = all.filter((x) => (!status || x.display === status) && (!year || x.i.date.startsWith(year)) && (!q || x.i.number.toLowerCase().includes(q) || x.i.customer.name.toLowerCase().includes(q))).sort((a, b) => b.i.date.localeCompare(a.i.date) || b.i.number.localeCompare(a.i.number));
  const open = all.filter((x) => x.display === "sent" || x.display === "partial" || x.display === "overdue");
  const outstandingIDR = open.reduce((s, x) => s + toIDR(invoiceOutstanding(x.i), x.i.currency, x.i.fxRate), 0);
  const overdueIDR = open.filter((x) => x.display === "overdue").reduce((s, x) => s + toIDR(invoiceOutstanding(x.i), x.i.currency, x.i.fxRate), 0);
  const invoicedYTD = all.filter((x) => x.i.status !== "void" && x.i.status !== "draft" && x.i.date.startsWith(today.slice(0, 4))).reduce((s, x) => s + toIDR(x.i.total, x.i.currency, x.i.fxRate), 0);
  const b = base(entityId);
  const url = `${b}/sales`;
  const current = { status, q, year };
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Outstanding (IDR)" value={fmtMoney(outstandingIDR)} hint={`${open.length} open`} />
        <Stat label="Overdue (IDR)" value={fmtMoney(overdueIDR)} tone={overdueIDR > 0 ? "text-red-700" : ""} />
        <Stat label={`Invoiced ${today.slice(0, 4)} (IDR)`} value={fmtMoney(invoicedYTD)} />
        <Stat label="Drafts" value={all.filter((x) => x.i.status === "draft").length} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-wrap items-center gap-2" method="get">
          {status && <input type="hidden" name="status" value={status} />}
          <select name="year" defaultValue={year ?? ""} className="input !w-auto !py-1"><option value="">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
          <AutoSubmitInput name="q" defaultValue={q} placeholder="Search number or customer…" className="input !w-64 !py-1" />
          <button className="btn-secondary !py-1 text-xs">Filter</button>
        </form>
        <div className="flex gap-2"><Link href={`${b}/reports/ar-aging`} className="btn-secondary">AR aging</Link><Link href={`${b}/sales/new`} className="btn-primary">New invoice</Link></div>
      </div>
      <Chips items={[{ href: withParams(url, current, { status: undefined }), label: `All (${all.length})`, active: !status }, ...STATUSES.map((s) => ({ href: withParams(url, current, { status: s }), label: `${s} (${all.filter((x) => x.display === s).length})`, active: status === s }))]} />
      {rows.length === 0 ? <EmptyState title="No invoices" hint="Create the first invoice for this entity." action={<Link href={`${b}/sales/new`} className="btn-primary">New invoice</Link>} /> : (
        <Card className="overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Number</th><th>Date</th><th>Due</th><th>Customer</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Outstanding</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map(({ i, display }) => (
                <tr key={i.id} className={i.status === "void" ? "opacity-60" : ""}>
                  <td className="pl-4 font-medium"><Link href={`${b}/sales/${i.id}`} className="hover:underline">{i.number}</Link></td>
                  <td className="whitespace-nowrap">{fmtDate(i.date)}</td>
                  <td className={`whitespace-nowrap ${display === "overdue" ? "text-red-700" : ""}`}>{fmtDate(i.dueDate)}</td>
                  <td className="max-w-xs truncate">{i.customer.name}</td>
                  <td className="num"><Money amount={i.total} currency={i.currency} /></td>
                  <td className="num"><Money amount={i.amountPaid} currency={i.currency} /></td>
                  <td className="num">{i.status === "void" || i.status === "draft" ? "—" : <Money amount={invoiceOutstanding(i)} currency={i.currency} />}</td>
                  <td><Badge tone={statusTone(display)}>{display}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
