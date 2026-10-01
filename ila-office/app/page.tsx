import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountBalances, naturalBalance } from "@/lib/balances";
import { fmtDate, todayISO, periodOf, periodLabel } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { toIDR } from "@/lib/money";
import { OBLIGATION_LABELS, OBLIGATION_STATUS_LABELS, type ObligationStatus } from "@/lib/types";
import { Page, Card, Stat, Badge, statusTone, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Home: the accounting and tax workload across ILA and every client entity, plus ILA's own position. */
export default async function Home() {
  const user = await requireUser();
  const today = todayISO();
  const period = periodOf(today);
  const [entities, obligations, invoices, bankTx, journals, activities] = await Promise.all([
    db.list("entities", { where: (e) => e.status !== "closed", orderBy: "name" }),
    db.list("tax_obligations", { where: (o) => (o.reportDue >= `${period}-01` && o.reportDue <= `${period}-31`) || (o.reportDue < today && !["reported", "nil"].includes(o.status)) }),
    db.list("invoices", { where: (i) => i.status === "sent" || i.status === "partial" }),
    db.list("bank_transactions", { where: { status: "unmatched" } }),
    db.list("journal_entries", { orderBy: "createdAt", desc: true, limit: 8 }),
    db.list("activities", { orderBy: "at", desc: true, limit: 8 }),
  ]);
  const own = entities.find((e) => e.isOwn);
  const entityName = (id: string) => entities.find((e) => e.id === id)?.name ?? id;

  // Obligations due this month (by reporting deadline) and overdue ones.
  const dueThisMonth = obligations.filter((o) => o.reportDue.startsWith(period));
  const overdue = obligations.filter((o) => o.reportDue < today && !["reported", "nil"].includes(o.status)).sort((a, b) => a.reportDue.localeCompare(b.reportDue));
  const byStatus = new Map<ObligationStatus, number>();
  for (const o of dueThisMonth) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);

  // ILA's own position.
  const ownInvoices = own ? invoices.filter((i) => i.entityId === own.id) : [];
  const receivables = ownInvoices.reduce((s, i) => s + toIDR(i.total - i.amountPaid, i.currency, i.fxRate), 0);
  const overdueInvoices = ownInvoices.filter((i) => i.dueDate < today).length;
  let cash = 0;
  if (own) {
    const [accounts, entries] = await Promise.all([db.list("accounts", { where: { entityId: own.id } }), db.list("journal_entries", { where: { entityId: own.id, status: "posted" } })]);
    const bal = accountBalances(entries);
    cash = accounts.filter((a) => a.subtype === "bank" || a.subtype === "cash").reduce((s, a) => s + naturalBalance(a, bal.get(a.id)), 0);
  }
  const unmatchedByEntity = new Map<string, number>();
  for (const t of bankTx) unmatchedByEntity.set(t.entityId, (unmatchedByEntity.get(t.entityId) ?? 0) + 1);

  return (
    <Page title={`Good day, ${user.name.split(" ")[0]}`} subtitle={`${fmtDate(today)} · ${entities.length} entities · tax period ${periodLabel(period)}`}
      actions={<>{own && <Link href={`/books/${own.id}/sales/new`} className="btn-secondary">New invoice</Link>}<Link href="/tax" className="btn-secondary">All clients calendar</Link><Link href="/settings/entities/new" className="btn-primary">New client entity</Link></>}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
        <Stat label={`Obligations due ${periodLabel(period)}`} value={dueThisMonth.length} hint={<Link href="/tax" className="hover:underline">{byStatus.get("reported") ?? 0} reported · {byStatus.get("not_started") ?? 0} not started</Link>} />
        <Stat label="Overdue obligations" value={overdue.length} tone={overdue.length ? "text-red-700" : "text-green-700"} hint={overdue.length ? "past the reporting deadline" : "nothing late"} />
        <Stat label="Unmatched bank lines" value={bankTx.length} hint={`${unmatchedByEntity.size} entit${unmatchedByEntity.size === 1 ? "y" : "ies"} to reconcile`} />
        <Stat label="ILA receivables" value={fmtMoney(receivables, "IDR")} tone={overdueInvoices ? "text-red-700" : ""} hint={own ? <Link href={`/books/${own.id}/sales`} className="hover:underline">{ownInvoices.length} open invoices · {overdueInvoices} overdue</Link> : "no ILA entity"} />
        <Stat label="ILA cash & bank" value={fmtMoney(cash, "IDR")} hint={own ? <Link href={`/books/${own.id}/bank`} className="hover:underline">posted balances</Link> : "—"} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Overdue tax obligations" actions={<Link href="/tax" className="text-xs text-brand-600 underline">All clients calendar</Link>}>
          {overdue.length === 0 ? <EmptyState title="Nothing is past its reporting deadline" /> : (
            <table className="table">
              <thead><tr><th>Entity</th><th>Obligation</th><th>Period</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>{overdue.slice(0, 12).map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/tax/${o.entityId}`} className="font-medium hover:underline">{entityName(o.entityId)}</Link></td>
                  <td className="text-xs">{OBLIGATION_LABELS[o.type]}</td><td className="text-xs">{periodLabel(o.period)}</td>
                  <td className="whitespace-nowrap text-xs text-red-700">{fmtDate(o.reportDue)}</td>
                  <td><Badge tone={statusTone(o.status)}>{OBLIGATION_STATUS_LABELS[o.status]}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
        <Card title={`Due ${periodLabel(period)} by status`} actions={<Link href="/tax" className="text-xs text-brand-600 underline">Open calendar</Link>}>
          {dueThisMonth.length === 0 ? <EmptyState title="No obligation due this month" hint="Generate the calendar from each entity's tax profile on its Tax page." /> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {([...byStatus.entries()] as Array<[ObligationStatus, number]>).sort((a, b) => b[1] - a[1]).map(([st, n]) => (
                <li key={st} className="flex items-center justify-between py-1.5"><Badge tone={statusTone(st)}>{OBLIGATION_STATUS_LABELS[st]}</Badge><span className="tabular-nums">{n}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Client books" actions={<Link href="/settings/entities" className="text-xs text-brand-600 underline">Entities</Link>}>
          {entities.length === 0 ? <EmptyState title="No entity yet" action={<Link href="/settings/entities/new" className="btn-primary">New entity</Link>} /> : (
            <table className="table">
              <thead><tr><th>Entity</th><th>Regime</th><th className="num">Unmatched</th><th></th></tr></thead>
              <tbody>{entities.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.isOwn && <span className="mr-1 text-accent-600">★</span>}{e.name}</td>
                  <td className="text-xs">{e.tax.regime.replace(/_/g, " ")}{e.tax.pkp ? " · PKP" : ""}{e.tax.payroll ? " · payroll" : ""}</td>
                  <td className="num">{unmatchedByEntity.get(e.id) ?? 0}</td>
                  <td className="whitespace-nowrap text-xs"><Link href={`/books/${e.id}`} className="text-brand-600 underline">Books</Link> · <Link href={`/tax/${e.id}`} className="text-brand-600 underline">Tax</Link>{e.tax.payroll && <> · <Link href={`/payroll/${e.id}`} className="text-brand-600 underline">Payroll</Link></>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
        <Card title="Recent journal entries">
          {journals.length === 0 ? <EmptyState title="No journal entries yet" hint="Post an invoice, import a bank statement or create a manual entry." /> : (
            <table className="table">
              <thead><tr><th>Date</th><th>Entity</th><th>Entry</th><th>Memo</th></tr></thead>
              <tbody>{journals.map((j) => (
                <tr key={j.id}>
                  <td className="whitespace-nowrap text-xs">{fmtDate(j.date)}</td><td className="text-xs">{entityName(j.entityId)}</td>
                  <td><Link href={`/books/${j.entityId}/journal/${j.id}`} className="text-brand-600 underline">{j.number}</Link></td>
                  <td className="text-xs">{j.memo}{j.status === "void" && <Badge tone="red" className="ml-1">void</Badge>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
        <Card title="Recent activity" className="lg:col-span-2">
          {activities.length === 0 ? <p className="text-sm text-ink-500">Nothing logged yet.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {activities.map((a) => (
                <li key={a.id} className="flex flex-wrap gap-2 py-1.5"><span className="w-36 shrink-0 text-xs text-ink-500">{new Date(a.at).toLocaleString("en-GB", { timeZone: "Asia/Makassar", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span><Badge>{a.kind}</Badge><span>{a.subject}</span>{a.byName && <span className="text-xs text-ink-500">· {a.byName}</span>}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Page>
  );
}
