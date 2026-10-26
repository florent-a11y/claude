import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addMonths, fmtDate, fmtDateTime, periodLabel, periodOf, todayISO } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { buildReconciliation, type ReconItem } from "@/lib/reconciliation";
import { Card, CardTable, Cols, Dash, Badge, Stat, Notice } from "@/components/ui";
import { ConfirmForm, PrintButton, SubmitButton } from "@/components/client";
import { base, first, requireEntity, ErrorNotice, type Params, type Search } from "../../../shared";
import { setJournalCleared, signOff, undoSignOff } from "./actions";

export const dynamic = "force-dynamic";

/** Monthly bank reconciliation: the statement's closing balance against the books, with the items that explain any gap. */
export default async function ReconcilePage({ params, searchParams }: { params: Promise<{ entityId: string; bankAccountId: string }>; searchParams: Search }) {
  const user = await requireUser();
  const { entityId, bankAccountId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const bank = await db.get("bank_accounts", bankAccountId);
  if (!bank || bank.entityId !== entityId) notFound();
  const [transactions, entries] = await Promise.all([db.list("bank_transactions", { where: { bankAccountId } }), db.list("journal_entries", { where: { entityId, status: "posted" } })]);
  const lastLine = transactions.reduce<string | undefined>((m, t) => (!m || t.date > m ? t.date : m), undefined);
  const period = first(sp.period) ?? periodOf(lastLine ?? todayISO());
  const signoffs = [...(bank.reconciliations ?? [])].sort((a, b2) => b2.period.localeCompare(a.period));
  const signed = signoffs.find((s) => s.period === period);
  const manualRaw = first(sp.statement);
  // A manually typed closing balance wins; a signed-off month keeps the balance it was signed off with.
  const manual = manualRaw ? Number(manualRaw.replace(/[^0-9.-]/g, "")) : signed?.statementBalance;
  const r = buildReconciliation({ bank, transactions, entries, period, statementBalance: manual });
  const write = can(user, "books:write");
  const b = base(entityId);
  const here = `${b}/bank/${bank.id}/reconcile`;
  const nav = (p: string) => `${here}?period=${p}`;
  const prev = periodOf(addMonths(`${period}-01`, -1));
  const next = periodOf(addMonths(`${period}-01`, 1));
  const money = (n: number) => fmtMoney(n, bank.currency);
  const latest = signoffs[0];
  const settledNote = bank.reconciledThrough ? `Items dated on or before ${fmtDate(bank.reconciledThrough)} are settled by earlier sign-offs.` : undefined;
  const itemRows = (items: ReconItem[], kind: "statement" | "ledger") => items.map((i) => (
    <tr key={i.id}>
      <td className="whitespace-nowrap">{fmtDate(i.date)}</td>
      <td>{kind === "ledger" ? <Link href={`${b}/journal/${i.journalId}`} className="cell font-medium hover:underline">{i.ref}</Link> : <span className="cell text-xs text-ink-500">{i.ref || <Dash />}</span>}</td>
      <td><span className="cell" title={i.description}>{i.description}</span>{i.counterparty && <span className="cell-sub">{i.counterparty}</span>}</td>
      <td className={`num money ${i.amount < 0 ? "text-red-700" : "text-green-700"}`}>{money(i.amount)}{i.approximate && <span className="ml-1 text-xs text-ink-500" title="Converted from IDR at the journal rate">≈</span>}</td>
      {write && <td className="whitespace-nowrap text-right text-xs">
        {kind === "statement" ? <Link href={`${b}/bank/${bank.id}/tx/${i.txId}`} className="btn-secondary !px-2 !py-1 text-xs">Match</Link> : (
          <form action={setJournalCleared.bind(null, entityId, bank.id, i.journalId as string, period, true)}><button className="btn-secondary !px-2 !py-1 text-xs" title="This entry does appear on the bank statement (for example before statements were imported)">On statement</button></form>
        )}
      </td>}
    </tr>
  ));
  const cols = write ? [110, 120, undefined, 150, 124] : [110, 120, undefined, 150];
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-500 no-print"><Link href={`${b}/reconciliation`} className="hover:underline">Reconciliation</Link> / {bank.name}</p>
          <p className="hidden text-xs text-ink-500 print:block">{entity.legalName}</p>
          <h2 className="text-xl font-bold">Bank reconciliation · {periodLabel(period)}</h2>
          <p className="text-sm text-ink-500">{bank.name} · {[bank.bankName, bank.accountNumber].filter(Boolean).join(" ")} · {bank.currency} · as of {fmtDate(r.endDate)}{signed && <> · <Badge tone="green">signed off {fmtDate(signed.at.slice(0, 10))}{signed.byName ? ` by ${signed.byName}` : ""}</Badge></>}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          <Link href={nav(prev)} className="btn-secondary !px-3" aria-label="Previous month">‹</Link>
          <span className="text-sm font-medium">{periodLabel(period)}</span>
          <Link href={nav(next)} className="btn-secondary !px-3" aria-label="Next month">›</Link>
          <Link href={`${b}/bank/${bank.id}/import`} className="btn-secondary">Import statement</Link>
          <Link href={`${b}/bank/${bank.id}`} className="btn-secondary">Statement lines</Link>
          <PrintButton label="Print" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Balance per bank statement" value={r.statementBalance === null ? "—" : money(r.statementBalance)} hint={r.statementBalanceSource === "statement" ? `from the last statement line, ${fmtDate(r.lastStatementDate)}` : r.statementBalanceSource === "manual" ? (manualRaw ? "entered manually" : "as signed off") : "no statement balance yet"} />
        <Stat label="Balance per books" value={money(r.ledgerBalance)} hint={r.ledgerApproximate ? "≈ some entries converted from IDR" : `posted entries up to ${fmtDate(r.endDate)}`} />
        <Stat label="Outstanding items" value={r.unbookedStatement.length + r.unpresentedLedger.length} hint={`${r.unbookedStatement.length} on the statement only · ${r.unpresentedLedger.length} in the books only`} />
        <Stat label="Difference" value={r.difference === null ? "—" : money(r.difference)} tone={r.difference === null ? "" : r.balanced ? "text-green-700" : "text-red-700"} hint={r.difference === null ? "enter the statement balance" : r.balanced ? "statement and books agree" : "to explain before signing off"} />
      </div>

      {r.statementBalance === null && (
        <Card title="Closing balance on the bank statement">
          <p className="mb-3 text-sm text-ink-500">{transactions.length === 0 ? <>No statement has been imported for this account yet. <Link href={`${b}/bank/${bank.id}/import`} className="underline">Import the {periodLabel(period)} statement</Link> (PDF, Excel or CSV), or type its closing balance below.</> : <>The imported lines carry no running balance, so type the closing balance printed on the {periodLabel(period)} statement.</>}</p>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="period" value={period} />
            <label className="block"><span className="label">Closing balance ({bank.currency})</span><input name="statement" inputMode="decimal" defaultValue={manualRaw} className="input !w-56" required /></label>
            <button className="btn-primary">Use this balance</button>
          </form>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card title={`Statement lines not yet in the books (${r.unbookedStatement.length})`}>
            {r.unbookedStatement.length === 0 ? <p className="text-sm text-ink-500">Every statement line up to {fmtDate(r.endDate)} is booked or excluded.</p> : (
              <CardTable>
                <table className="table table-data min-w-[640px]">
                  <Cols widths={cols} />
                  <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th className="num">Amount</th>{write && <th></th>}</tr></thead>
                  <tbody>{itemRows(r.unbookedStatement, "statement")}</tbody>
                  <tfoot><tr><td colSpan={3}>Total</td><td className="num money">{money(r.sumUnbooked)}</td>{write && <td></td>}</tr></tfoot>
                </table>
              </CardTable>
            )}
          </Card>
          <Card title={`Ledger entries not on the statement (${r.unpresentedLedger.length})`}>
            {r.unpresentedLedger.length === 0 ? <p className="text-sm text-ink-500">Every posted movement on this account up to {fmtDate(r.endDate)} has a statement line.</p> : (
              <CardTable bottom={r.clearedLedger.length === 0}>
                <table className="table table-data min-w-[640px]">
                  <Cols widths={cols} />
                  <thead><tr><th>Date</th><th>Entry</th><th>Memo</th><th className="num">Amount</th>{write && <th></th>}</tr></thead>
                  <tbody>{itemRows(r.unpresentedLedger, "ledger")}</tbody>
                  <tfoot><tr><td colSpan={3}>Total (deposits in transit less outstanding payments)</td><td className="num money">{money(r.sumUnpresented)}</td>{write && <td></td>}</tr></tfoot>
                </table>
              </CardTable>
            )}
            {r.clearedLedger.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-ink-500">{r.clearedLedger.length} entr{r.clearedLedger.length === 1 ? "y" : "ies"} ticked as on the statement</summary>
                <ul className="mt-2 divide-y divide-slate-100">
                  {r.clearedLedger.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                      <span className="min-w-0"><span className="whitespace-nowrap text-ink-500">{fmtDate(i.date)}</span> · <Link href={`${b}/journal/${i.journalId}`} className="font-medium hover:underline">{i.ref}</Link> · <span className="text-ink-700">{i.description}</span></span>
                      <span className="flex shrink-0 items-center gap-3"><span className="money">{money(i.amount)}</span>{write && <form action={setJournalCleared.bind(null, entityId, bank.id, i.journalId as string, period, false)}><button className="text-brand-600 hover:underline">untick</button></form>}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          <Card title="Reconciliation statement">
            <table className="table table-statement -mx-5 w-[calc(100%+2.5rem)] whitespace-nowrap">
              <tbody>
                <tr><td>Balance per bank statement</td><td className="num money">{r.statementBalance === null ? <Dash /> : money(r.statementBalance)}</td></tr>
                <tr><td className="indent">+ not yet on the statement ({r.unpresentedLedger.length})</td><td className="num money">{money(r.sumUnpresented)}</td></tr>
                <tr className="row-total"><td>Adjusted bank balance</td><td className="num money">{r.adjustedBank === null ? <Dash /> : money(r.adjustedBank)}</td></tr>
                <tr><td>Balance per books</td><td className="num money">{money(r.ledgerBalance)}</td></tr>
                <tr><td className="indent">+ not yet booked ({r.unbookedStatement.length})</td><td className="num money">{money(r.sumUnbooked)}</td></tr>
                <tr className="row-total"><td>Adjusted book balance</td><td className="num money">{money(r.adjustedBooks)}</td></tr>
                <tr className="row-grand"><td>Difference</td><td className={`num money ${r.difference === null ? "" : r.balanced ? "text-green-700" : "text-red-700"}`}>{r.difference === null ? <Dash /> : money(r.difference)}</td></tr>
              </tbody>
            </table>
            {settledNote && <p className="mt-3 text-xs text-ink-500">{settledNote}</p>}
          </Card>
          <Card title="Sign-off" className="no-print">
            {signed ? (
              <div className="space-y-2 text-sm">
                <Notice tone="green">{periodLabel(period)} was signed off on {fmtDateTime(signed.at)}{signed.byName ? ` by ${signed.byName}` : ""}: statement {money(signed.statementBalance)}, books {money(signed.ledgerBalance)}.</Notice>
                {signed.note && <p className="text-ink-700">{signed.note}</p>}
                {write && latest?.period === period && <ConfirmForm action={undoSignOff.bind(null, entityId, bank.id, period)} message={`Remove the sign-off for ${periodLabel(period)}?`}><button className="text-xs text-red-600 hover:underline">Undo this sign-off</button></ConfirmForm>}
              </div>
            ) : !write ? <p className="text-sm text-ink-500">ILA signs each month off once the statement and the books agree.</p> : r.statementBalance === null ? <p className="text-sm text-ink-500">Enter the statement closing balance above first.</p> : r.balanced ? (
              <form action={signOff.bind(null, entityId, bank.id)} className="space-y-3">
                <input type="hidden" name="period" value={period} />
                <input type="hidden" name="statementBalance" value={String(r.statementBalance)} />
                <p className="text-sm text-ink-700">Statement and books agree for {periodLabel(period)}{r.unbookedStatement.length + r.unpresentedLedger.length > 0 ? ` with ${r.unbookedStatement.length + r.unpresentedLedger.length} outstanding item(s) listed` : ""}.</p>
                <label className="block"><span className="label">Note (optional)</span><input name="note" className="input" placeholder="e.g. payroll transfer of 26 Sept clears on 1 Oct" /></label>
                <SubmitButton>Mark {periodLabel(period)} reconciled</SubmitButton>
              </form>
            ) : (
              <Notice tone="amber">
                Difference of {money(r.difference ?? 0)}. To close the month: match or exclude each statement line above, and tick "On statement" on ledger entries whose statement line was never imported. Entries that will clear next month stay listed as outstanding and do not block the sign-off.
              </Notice>
            )}
            {signoffs.length > 0 && (
              <details className="mt-3 text-sm"><summary className="cursor-pointer text-ink-500">History ({signoffs.length})</summary>
                <ul className="mt-2 divide-y divide-slate-100 text-xs">
                  {signoffs.map((s) => <li key={s.period} className="flex items-center justify-between gap-2 py-1.5"><Link href={nav(s.period)} className="font-medium hover:underline">{periodLabel(s.period)}</Link><span className="text-ink-500">{fmtDate(s.at.slice(0, 10))}{s.byName ? ` · ${s.byName}` : ""}</span><span className="money">{money(s.statementBalance)}</span></li>)}
                </ul>
              </details>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
