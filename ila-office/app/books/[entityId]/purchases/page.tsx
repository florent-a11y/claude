import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { docDisplayStatus, billOutstanding } from "@/lib/ledger";
import { fmtDate, todayISO } from "@/lib/dates";
import { fmtMoney, toIDR } from "@/lib/money";
import { Card, Badge, statusTone, Money, Chips, EmptyState, withParams, Stat } from "@/components/ui";
import { AutoSubmitInput } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../shared";

export const dynamic = "force-dynamic";
const STATUSES = ["draft", "sent", "partial", "overdue", "paid", "void"];

export default async function Purchases({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const today = todayISO();
  const status = first(sp.status), q = first(sp.q)?.toLowerCase(), year = first(sp.year);
  const all = (await db.list("bills", { where: { entityId } })).map((bill) => ({ bill, display: docDisplayStatus(bill, today) }));
  const years = [...new Set(all.map((x) => x.bill.date.slice(0, 4)))].sort().reverse();
  const rows = all.filter((x) => (!status || x.display === status) && (!year || x.bill.date.startsWith(year)) && (!q || x.bill.number.toLowerCase().includes(q) || x.bill.vendor.name.toLowerCase().includes(q) || x.bill.vendorInvoiceNumber?.toLowerCase().includes(q))).sort((a, b) => b.bill.date.localeCompare(a.bill.date) || b.bill.number.localeCompare(a.bill.number));
  const open = all.filter((x) => x.display === "sent" || x.display === "partial" || x.display === "overdue");
  const payableIDR = open.reduce((s, x) => s + toIDR(billOutstanding(x.bill), x.bill.currency, x.bill.fxRate), 0);
  const withheldYTD = all.filter((x) => x.bill.status !== "void" && x.bill.status !== "draft" && x.bill.date.startsWith(today.slice(0, 4))).reduce((s, x) => s + toIDR(x.bill.withholdingTotal, x.bill.currency, x.bill.fxRate), 0);
  const b = base(entityId);
  const url = `${b}/purchases`;
  const current = { status, q, year };
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Payable (IDR)" value={fmtMoney(payableIDR)} hint={`${open.length} open`} />
        <Stat label="Overdue" value={open.filter((x) => x.display === "overdue").length} tone={open.some((x) => x.display === "overdue") ? "text-red-700" : ""} />
        <Stat label={`Withheld ${today.slice(0, 4)} (IDR)`} value={fmtMoney(withheldYTD)} hint="PPh 23 / 4(2) / 26 to remit" />
        <Stat label="Drafts" value={all.filter((x) => x.bill.status === "draft").length} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-wrap items-center gap-2" method="get">
          {status && <input type="hidden" name="status" value={status} />}
          <select name="year" defaultValue={year ?? ""} className="input !w-auto !py-1"><option value="">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
          <AutoSubmitInput name="q" defaultValue={q} placeholder="Search number or vendor…" className="input !w-64 !py-1" />
          <button className="btn-secondary !py-1 text-xs">Filter</button>
        </form>
        <div className="flex gap-2"><Link href={`${b}/reports/ap-aging`} className="btn-secondary">AP aging</Link><Link href={`${b}/purchases/new`} className="btn-primary">New bill</Link></div>
      </div>
      <Chips items={[{ href: withParams(url, current, { status: undefined }), label: `All (${all.length})`, active: !status }, ...STATUSES.map((s) => ({ href: withParams(url, current, { status: s }), label: `${s} (${all.filter((x) => x.display === s).length})`, active: status === s }))]} />
      {rows.length === 0 ? <EmptyState title="No bills" hint="Record vendor invoices here; withholding is computed per line." action={<Link href={`${b}/purchases/new`} className="btn-primary">New bill</Link>} /> : (
        <Card className="overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Number</th><th>Date</th><th>Due</th><th>Vendor</th><th className="num">Total</th><th className="num">Withheld</th><th className="num">Payable</th><th className="num">Paid</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map(({ bill, display }) => (
                <tr key={bill.id} className={bill.status === "void" ? "opacity-60" : ""}>
                  <td className="pl-4 font-medium"><Link href={`${b}/purchases/${bill.id}`} className="hover:underline">{bill.number}</Link>{bill.vendorInvoiceNumber && <span className="block text-xs text-ink-500">{bill.vendorInvoiceNumber}</span>}</td>
                  <td className="whitespace-nowrap">{fmtDate(bill.date)}</td>
                  <td className={`whitespace-nowrap ${display === "overdue" ? "text-red-700" : ""}`}>{fmtDate(bill.dueDate)}</td>
                  <td className="max-w-xs truncate">{bill.vendor.name}</td>
                  <td className="num"><Money amount={bill.total} currency={bill.currency} /></td>
                  <td className="num">{bill.withholdingTotal ? <Money amount={bill.withholdingTotal} currency={bill.currency} /> : "—"}</td>
                  <td className="num"><Money amount={bill.amountPayable} currency={bill.currency} /></td>
                  <td className="num"><Money amount={bill.amountPaid} currency={bill.currency} /></td>
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
