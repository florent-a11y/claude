import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { addMonths, fmtDate, lastDayOfMonth, periodLabel, periodOf, todayISO } from "@/lib/dates";
import { fmtMoney, fmtNumber, parseMoney } from "@/lib/money";
import { fmtRate, parseRate, rateToSubmit } from "@/lib/fx-core";
import { getFxRates, type FxLookup } from "@/lib/fx";
import { buildRevaluation, existingRevaluation } from "@/lib/fx-revaluation";
import { loadRevaluationData } from "@/lib/fx-revaluation-services";
import { Badge, Card, Cols, EmptyState, Notice, Stat, TableCard } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../shared";
import { postRevaluationAction, voidRevaluationAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Month-end FX revaluation: every foreign-currency bank or cash account at Bank Indonesia's closing rate, the
 * unrealised difference previewed, then posted as one entry dated the last day of the month (source "fx").
 * The closing rates come from BI for the month end (editable); the foreign balance comes from the ledger and can be
 * replaced by the statement balance.
 */
export default async function RevaluationPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const today = todayISO();
  const period = first(sp.period) ?? periodOf(addMonths(`${periodOf(today)}-01`, -1));
  const data = await loadRevaluationData(entityId);
  const b = base(entityId);
  const here = `${b}/revaluation`;
  const prev = periodOf(addMonths(`${period}-01`, -1));
  const next = periodOf(addMonths(`${period}-01`, 1));
  const endDate = lastDayOfMonth(period);
  const currencies = [...new Set(data.banks.map((x) => x.currency))];
  // Closing rates: typed on this page (?rate_USD=) win over Bank Indonesia's rate for the month end.
  const bi: Record<string, FxLookup> = currencies.length ? await getFxRates(currencies, endDate) : {};
  const rates: Record<string, number | undefined> = {};
  const rateSource: Record<string, string> = {};
  for (const c of currencies) {
    const typed = parseRate(first(sp[`rate_${c}`]) ?? "");
    if (typed > 0) { rates[c] = typed; rateSource[c] = "entered on this page"; continue; }
    const q = bi[c];
    if (q) {
      rates[c] = q.rate.mid;
      rateSource[c] = q.match === "exact" ? `Bank Indonesia mid rate, ${fmtDate(q.rate.rateDate)}` : q.match === "previous" ? `Bank Indonesia mid rate of ${fmtDate(q.rate.rateDate)}, the last publication before ${fmtDate(endDate)}` : `Bank Indonesia's latest mid rate (${fmtDate(q.rate.rateDate)}); the rate of ${fmtDate(endDate)} could not be retrieved`;
    } else rateSource[c] = "Bank Indonesia not available: enter the closing rate";
  }
  const overrides: Record<string, number | undefined> = {};
  for (const bank of data.banks) { const v = first(sp[`fc_${bank.id}`]); if (v !== undefined && v.trim() !== "") overrides[bank.id] = parseMoney(v); }
  const rev = buildRevaluation({ period, banks: data.banks, accounts: data.accounts, entries: data.entries, rates, overrides });
  const existing = existingRevaluation(data.entries, period);
  const write = can(user, "books:write");
  const net = rev.unrealisedGain - rev.unrealisedLoss;
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">FX revaluation · {periodLabel(period)}</h2>
          <p className="text-sm text-ink-500">Foreign-currency bank and cash balances restated at the closing rate of {fmtDate(endDate)}; the difference posts to unrealised FX gain or loss in one entry dated {fmtDate(endDate)}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          <Link href={`${here}?period=${prev}`} className="btn-secondary !px-3" aria-label="Previous month">‹</Link>
          <span className="text-sm font-medium">{periodLabel(period)}</span>
          <Link href={`${here}?period=${next}`} className="btn-secondary !px-3" aria-label="Next month">›</Link>
          <Link href={`${b}/reconciliation`} className="btn-secondary">Reconciliation</Link>
        </div>
      </div>

      {data.banks.length === 0 ? (
        <EmptyState title="No foreign-currency bank account" hint="Only bank or cash accounts kept in a currency other than IDR are revalued. Add them on the Bank tab with their currency." action={<Link href={`${b}/bank`} className="btn-primary">Bank accounts</Link>} />
      ) : (
        <>
          {existing && <Notice tone="green">{periodLabel(period)} is revalued: <Link href={`${b}/journal/${existing.id}`} className="underline">{existing.number}</Link> dated {fmtDate(existing.date)}. The figures below are what the ledger shows after that entry.{write && <> To redo it after a late entry, void it first.</>}</Notice>}
          {rev.missingRates.length > 0 && <Notice tone="amber">No closing rate for {rev.missingRates.join(", ")}: Bank Indonesia could not be reached. Type the rate below (IDR per 1 unit) and recalculate.</Notice>}

          <form method="get" className="space-y-4">
            <input type="hidden" name="period" value={period} />
            <Card title="Closing rates (IDR per 1 unit)">
              <div className="grid gap-3 md:grid-cols-3">
                {currencies.map((c) => (
                  <label key={c} className="block">
                    <span className="label">{c}</span>
                    <input name={`rate_${c}`} inputMode="decimal" defaultValue={rates[c] ? fmtRate(rates[c] as number) : ""} className="input" placeholder="e.g. 16,500.00" />
                    <span className="mt-1 block text-xs text-ink-500">{rateSource[c]}{bi[c] && !first(sp[`rate_${c}`]) ? ` · buy ${fmtRate(bi[c].rate.buy)} · sell ${fmtRate(bi[c].rate.sell)}` : ""}</span>
                  </label>
                ))}
              </div>
            </Card>
            <TableCard footer={<div className="flex flex-wrap items-center gap-3"><button className="btn-secondary !py-1 text-xs">Recalculate</button><span className="text-xs text-ink-500">Type a statement balance to replace the ledger's foreign balance, or a rate, then recalculate.</span></div>}>
              <table className="table table-data min-w-[980px]">
                <Cols widths={[undefined, 56, 170, 150, 110, 110, 150, 150]} />
                <thead><tr><th>Account</th><th>Ccy</th><th className="num">Foreign balance</th><th className="num">Book value (IDR)</th><th className="num">Book rate</th><th className="num">Closing rate</th><th className="num">Revalued (IDR)</th><th className="num">Difference</th></tr></thead>
                <tbody>
                  {rev.rows.map((r) => (
                    <tr key={r.bank.id}>
                      <td><span className="cell-primary" title={r.bank.name}>{r.bank.name}</span><span className="cell-sub">{r.account.code} {r.account.name}</span></td>
                      <td className="text-xs">{r.currency}</td>
                      <td className="num">
                        <input name={`fc_${r.bank.id}`} inputMode="decimal" defaultValue={r.fcOverridden ? fmtNumber(r.fcBalance, 2) : ""} placeholder={fmtNumber(r.fcBalance, 2)} className="input !py-1 text-right" aria-label={`${r.bank.name} balance in ${r.currency}`} />
                        <span className="cell-sub">{r.fcOverridden ? "typed (statement balance)" : r.fcApproximate ? "≈ from the ledger (some entries converted at their rate)" : "from the ledger"}</span>
                      </td>
                      <td className="num"><span className="money">{fmtMoney(r.bookIDR)}</span></td>
                      <td className="num text-xs text-ink-500">{r.bookRate !== null ? fmtRate(r.bookRate) : "—"}</td>
                      <td className="num">{r.rate !== null ? fmtRate(r.rate) : <Badge tone="amber">missing</Badge>}</td>
                      <td className="num">{r.revaluedIDR !== null ? <span className="money">{fmtMoney(r.revaluedIDR)}</span> : "—"}</td>
                      <td className={`num money ${r.difference === null ? "" : r.difference > 0 ? "text-green-700" : r.difference < 0 ? "text-red-700" : "text-ink-500"}`}>{r.difference !== null ? fmtMoney(r.difference) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          </form>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Unrealised gain" value={fmtMoney(rev.unrealisedGain)} tone="text-green-700" />
            <Stat label="Unrealised loss" value={fmtMoney(rev.unrealisedLoss)} tone="text-red-700" />
            <Stat label="Net effect on profit" value={fmtMoney(net)} tone={net < 0 ? "text-red-700" : net > 0 ? "text-green-700" : ""} />
            <Stat label="Accounts to adjust" value={rev.postable.length} hint={`of ${rev.rows.length} foreign-currency account${rev.rows.length === 1 ? "" : "s"}`} />
          </div>

          <Card title="Post" className="no-print">
            {!write ? <p className="text-sm text-ink-500">Accountants post the revaluation once the month's bank statements are reconciled.</p> : existing ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>{existing.number} is posted for {periodLabel(period)}.</span>
                <ConfirmForm action={voidRevaluationAction.bind(null, entityId, period)} message={`Void ${existing.number}? The accounts go back to their previous book value; you can post the revaluation again afterwards.`}><button className="btn-danger" type="submit">Void {existing.number}</button></ConfirmForm>
              </div>
            ) : period > periodOf(today) ? <p className="text-sm text-ink-500">{periodLabel(period)} has not ended yet.</p> : rev.missingRates.length > 0 ? <p className="text-sm text-ink-500">Enter the missing closing rate first.</p> : rev.postable.length === 0 ? <p className="text-sm text-ink-500">Nothing to post: every account already stands at the closing rate.</p> : (
              <form action={postRevaluationAction.bind(null, entityId)} className="space-y-3">
                <input type="hidden" name="period" value={period} />
                {currencies.map((c) => <input key={c} type="hidden" name={`rate_${c}`} value={rates[c] ? rateToSubmit(rates[c] as number) : ""} />)}
                {rev.rows.filter((r) => r.fcOverridden).map((r) => <input key={r.bank.id} type="hidden" name={`fc_${r.bank.id}`} value={String(r.fcBalance)} />)}
                <p className="text-sm text-ink-700">Posts one entry dated {fmtDate(rev.endDate)}: {rev.postable.map((r) => `${r.difference as number > 0 ? "Dr" : "Cr"} ${r.account.code} ${fmtMoney(Math.abs(r.difference as number))}`).join(", ")} against unrealised FX gain/loss (7-1110 / 8-1110, created on first use). Reconcile the month's statements first so the foreign balances are final.</p>
                <SubmitButton pendingText="Posting…">Post revaluation {periodLabel(period)}</SubmitButton>
              </form>
            )}
          </Card>
          <p className="text-xs text-ink-500">Bank and cash balances are revalued; the entry is not reversed, so each month revalues from the previous closing rate. Foreign-currency invoices and bills keep their document rate and book the realised difference on receipt or payment.</p>
        </>
      )}
    </div>
  );
}
