import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountBalances, totalsByType } from "@/lib/balances";
import { entityAccounts, entityEntries } from "@/lib/books";
import { sumBySubtype, invoiceOutstanding, billOutstanding, entryTotal, fiscalYearStartOf } from "@/lib/ledger";
import { todayISO, fmtDate, periodOf } from "@/lib/dates";
import { toIDR, fmtMoney } from "@/lib/money";
import { Card, Stat, Badge, statusTone, Money, EmptyState } from "@/components/ui";
import { base, requireEntity, type Params } from "./shared";

export const dynamic = "force-dynamic";

export default async function Overview({ params }: { params: Params }) {
  await requireUser();
  const { entityId } = await params;
  const entity = await requireEntity(entityId);
  const today = todayISO();
  const [accounts, entries, invoices, bills, unmatched, bankAccounts] = await Promise.all([
    entityAccounts(entityId), entityEntries(entityId),
    db.list("invoices", { where: (i) => i.entityId === entityId && (i.status === "sent" || i.status === "partial") }),
    db.list("bills", { where: (b) => b.entityId === entityId && (b.status === "sent" || b.status === "partial") }),
    db.count("bank_transactions", { entityId, status: "unmatched" }),
    db.list("bank_accounts", { where: { entityId, active: true } }),
  ]);
  const bal = accountBalances(entries, { to: today });
  const cash = sumBySubtype(accounts, bal, ["cash", "bank"]);
  const arOutstanding = invoices.reduce((s, i) => s + toIDR(invoiceOutstanding(i), i.currency, i.fxRate), 0);
  const apOutstanding = bills.reduce((s, b) => s + toIDR(billOutstanding(b), b.currency, b.fxRate), 0);
  const fyStart = fiscalYearStartOf(today, entity.fiscalYearStartMonth);
  const ytd = totalsByType(accounts, accountBalances(entries, { from: fyStart, to: today }));
  const mtd = totalsByType(accounts, accountBalances(entries, { from: `${periodOf(today)}-01`, to: today }));
  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)).slice(0, 8);
  const overdue = invoices.filter((i) => i.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const b = base(entityId);
  const bankBalances = bankAccounts.map((ba) => { const a = accounts.find((x) => x.id === ba.accountId); return { ba, balance: a ? (bal.get(a.id)?.net ?? 0) : 0 }; });
  return (
    <div className="space-y-5 pb-8">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
        <Stat label="Cash & bank" value={fmtMoney(cash)} hint={bankBalances.length ? bankBalances.map((x) => `${x.ba.name}: ${fmtMoney(x.balance)}`).join(" · ") : "No bank account yet"} />
        <Stat label="Receivables (AR)" value={fmtMoney(arOutstanding)} hint={`${invoices.length} open invoice${invoices.length === 1 ? "" : "s"}`} tone={overdue.length ? "text-amber-700" : ""} />
        <Stat label="Payables (AP)" value={fmtMoney(apOutstanding)} hint={`${bills.length} open bill${bills.length === 1 ? "" : "s"}`} />
        <Stat label="Revenue MTD" value={fmtMoney(mtd.revenue)} hint={periodOf(today)} />
        <Stat label="Revenue YTD" value={fmtMoney(ytd.revenue)} hint={`since ${fmtDate(fyStart)}`} />
        <Stat label="Net profit YTD" value={fmtMoney(ytd.revenue - ytd.expense)} tone={ytd.revenue - ytd.expense < 0 ? "text-red-700" : "text-green-700"} hint={`expenses ${fmtMoney(ytd.expense)}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Bank reconciliation" actions={<Link href={`${b}/bank`} className="text-xs text-brand-600 underline">Bank</Link>}>
          <p className="text-3xl font-bold tabular-nums">{unmatched}</p>
          <p className="text-sm text-ink-500">unmatched bank line{unmatched === 1 ? "" : "s"} to review</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {bankAccounts.map((ba) => <Link key={ba.id} href={`${b}/bank/${ba.id}?status=unmatched`} className="rounded-full bg-slate-100 px-2 py-0.5 hover:bg-brand-50">{ba.name}</Link>)}
            {bankAccounts.length === 0 && <Link href={`${b}/bank`} className="text-brand-600 underline">Add a bank account</Link>}
          </div>
        </Card>
        <Card title="Overdue invoices" actions={<Link href={`${b}/sales?status=overdue`} className="text-xs text-brand-600 underline">Sales</Link>} className="lg:col-span-2">
          {overdue.length === 0 ? <p className="text-sm text-ink-500">Nothing overdue.</p> : (
            <table className="table">
              <thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th className="num">Outstanding</th></tr></thead>
              <tbody>
                {overdue.slice(0, 6).map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`${b}/sales/${i.id}`} className="font-medium hover:underline">{i.number}</Link></td>
                    <td>{i.customer.name}</td>
                    <td><Badge tone="red">{fmtDate(i.dueDate)}</Badge></td>
                    <td className="num"><Money amount={invoiceOutstanding(i)} currency={i.currency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <Card title="Recent journal entries" actions={<div className="flex gap-3 text-xs"><Link href={`${b}/journal/new`} className="text-brand-600 underline">New entry</Link><Link href={`${b}/journal`} className="text-brand-600 underline">All</Link></div>}>
        {recent.length === 0 ? <EmptyState title="No journal entries yet" hint="Post an invoice, import a bank statement or create a manual entry." action={<Link href={`${b}/journal/new`} className="btn-primary">New journal entry</Link>} /> : (
          <table className="table">
            <thead><tr><th>Number</th><th>Date</th><th>Memo</th><th>Source</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {recent.map((e) => (
                <tr key={e.id}>
                  <td><Link href={`${b}/journal/${e.id}`} className="font-medium hover:underline">{e.number}</Link></td>
                  <td className="whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="max-w-md truncate">{e.memo}</td>
                  <td><Badge tone={statusTone(e.source)}>{e.source}</Badge></td>
                  <td className="num"><Money amount={entryTotal(e)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-xs text-ink-500">Balances as of {fmtDate(today)}; revenue and profit since the fiscal year start.</p>
    </div>
  );
}
