import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { scopeEntities } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountBalances, naturalBalance } from "@/lib/balances";
import { addDays, fmtDate, periodLabel, todayISO } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { OBLIGATION_LABELS, OBLIGATION_STATUS_LABELS, TAX_REGIME_SHORT } from "@/lib/types";
import { Page, Card, CardTable, Cols, Dash, Stat, Badge, statusTone, EmptyState } from "@/components/ui";

/** Home page for a client login: the companies allocated to it, their cash position and the filings coming up. */
export async function ClientHome({ user }: { user: SessionUser }) {
  const today = todayISO();
  const horizon = addDays(today, 60);
  const entities = scopeEntities(user, await db.list("entities", { where: (e) => e.status !== "closed", orderBy: "name" }));
  const ids = new Set(entities.map((e) => e.id));
  const [companies, obligations] = await Promise.all([
    db.list("companies", { where: (c) => !!c.entityId && ids.has(c.entityId) }),
    db.list("tax_obligations", { where: (o) => ids.has(o.entityId) && !["reported", "nil"].includes(o.status) && o.reportDue <= horizon }),
  ]);
  const cash = new Map<string, number>();
  for (const e of entities) {
    const [accounts, entries] = await Promise.all([db.list("accounts", { where: { entityId: e.id } }), db.list("journal_entries", { where: { entityId: e.id, status: "posted" } })]);
    const bal = accountBalances(entries);
    cash.set(e.id, accounts.filter((a) => a.subtype === "bank" || a.subtype === "cash").reduce((s, a) => s + naturalBalance(a, bal.get(a.id)), 0));
  }
  const upcoming = [...obligations].sort((a, b) => a.reportDue.localeCompare(b.reportDue));
  const overdue = upcoming.filter((o) => o.reportDue < today);
  const name = (id: string) => entities.find((e) => e.id === id)?.name ?? id;
  const companyOf = (entityId: string) => companies.find((c) => c.entityId === entityId);
  return (
    <Page title={`Welcome, ${user.name.split(" ")[0]}`} subtitle={`${fmtDate(today)} · ${entities.length} compan${entities.length === 1 ? "y" : "ies"} managed by ILA Global Consulting`}>
      {entities.length === 0 ? <EmptyState title="No company allocated to your login yet" hint="Ask your ILA contact to link your company to this account." /> : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
            <Stat label="Companies" value={entities.length} />
            <Stat label="Filings in the next 60 days" value={upcoming.length - overdue.length} hint="handled by ILA" />
            <Stat label="Overdue filings" value={overdue.length} tone={overdue.length ? "text-red-700" : "text-green-700"} hint={overdue.length ? "ILA is on it" : "nothing late"} />
            <Stat label="Cash & bank" value={fmtMoney([...cash.values()].reduce((a, b) => a + b, 0), "IDR")} hint="posted balances, all companies" />
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Card title="Your companies">
              <CardTable>
                <table className="table table-data min-w-[520px]">
                  <Cols widths={[undefined, 110, 140, 110]} />
                  <thead><tr><th>Company</th><th>Regime</th><th className="num">Cash & bank</th><th></th></tr></thead>
                  <tbody>
                    {entities.map((e) => {
                      const c = companyOf(e.id);
                      return (
                        <tr key={e.id}>
                          <td>{c ? <Link href={`/clients/companies/${c.id}`} className="cell-primary" title={e.name}>{e.name}</Link> : <span className="cell-primary">{e.name}</span>}<span className="cell-sub">{e.legalName}</span></td>
                          <td><span className="cell text-xs">{TAX_REGIME_SHORT[e.tax.regime]}{e.tax.pkp ? " · PKP" : ""}</span></td>
                          <td className="num money">{fmtMoney(cash.get(e.id) ?? 0, "IDR")}</td>
                          <td className="whitespace-nowrap text-right text-xs"><Link className="text-brand-600 hover:underline" href={`/books/${e.id}`}>Books</Link><span className="mx-1 text-slate-300">·</span><Link className="text-brand-600 hover:underline" href={`/tax/${e.id}`}>Tax</Link>{e.tax.payroll && <><span className="mx-1 text-slate-300">·</span><Link className="text-brand-600 hover:underline" href={`/payroll/${e.id}`}>Payroll</Link></>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardTable>
            </Card>
            <Card title="Upcoming filings">
              {upcoming.length === 0 ? <p className="text-sm text-ink-500">Nothing due in the next 60 days.</p> : (
                <CardTable>
                  <table className="table table-data min-w-[520px]">
                    <Cols widths={[undefined, 80, 100, 175]} />
                    <thead><tr><th>Filing</th><th>Period</th><th>Due</th><th>Status</th></tr></thead>
                    <tbody>
                      {upcoming.slice(0, 12).map((o) => (
                        <tr key={o.id}>
                          <td><span className="cell" title={OBLIGATION_LABELS[o.type]}>{OBLIGATION_LABELS[o.type]}</span>{entities.length > 1 && <span className="cell-sub">{name(o.entityId)}</span>}</td>
                          <td className="whitespace-nowrap text-xs">{periodLabel(o.period)}</td>
                          <td className={`whitespace-nowrap text-xs ${o.reportDue < today ? "text-red-700" : ""}`}>{fmtDate(o.reportDue)}</td>
                          <td><Badge tone={statusTone(o.status)} title={OBLIGATION_STATUS_LABELS[o.status]}><span className="truncate">{OBLIGATION_STATUS_LABELS[o.status]}</span></Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardTable>
              )}
              {upcoming.length === 0 ? null : <p className="mt-3 text-xs text-ink-500">Statuses are updated by ILA as each filing is prepared, approved and reported. Amounts and receipts are in the <Link href={`/tax/${entities[0].id}`} className="underline">tax calendar</Link>.</p>}
            </Card>
          </div>
        </>
      )}
    </Page>
  );
}
