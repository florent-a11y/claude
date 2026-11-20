import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { depreciationStarted } from "@/lib/books";
import { depreciationSchedule, netBookValue } from "@/lib/ledger";
import { FISCAL_ASSET_GROUPS } from "@/lib/types";
import { fmtDate, fmtDateTime, todayISO, periodLabel, periodOf, nextPeriod, prevPeriod } from "@/lib/dates";
import { fmtMoney, roundMoney } from "@/lib/money";
import { Card, Badge, statusTone, DL, CardTable, Cols, Dash, Notice } from "@/components/ui";
import { ConfirmForm } from "@/components/client";
import { Attachments } from "@/components/Attachments";
import { AuditTrail } from "@/components/AuditTrail";
import { ErrorNotice, base, first, requireEntity, type Search } from "../../shared";
import { AssetForm } from "../AssetForm";
import { DisposeForm, type DisposeTx } from "../DisposeForm";
import { assetSource } from "../source";
import { deleteAssetAction, disposeAssetAction, updateAssetAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * One asset: schedule, where it came from, its journals, and the three things an accountant does with it: confirm
 * it (registered automatically from a purchase, see lib/asset-auto.ts, or brought in from the ledger, see
 * lib/asset-takeon.ts) or correct it, and sell or dispose of it. For an asset brought in from the ledger the
 * schedule shows what the register posts after the previous books' last month.
 * `?tx=<statement line>&date=&proceeds=&bankAccountId=` (from the bank matching page) prefills the sale.
 */
export default async function AssetPage({ params, searchParams }: { params: Promise<{ entityId: string; assetId: string }>; searchParams: Search }) {
  const user = await requireUser();
  const { entityId, assetId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const asset = await db.get("fixed_assets", assetId);
  if (!asset || asset.entityId !== entityId) notFound();
  const txId = first(sp.tx);
  const [accounts, banks, journals, source, txRow] = await Promise.all([
    db.list("accounts", { where: { entityId } }), db.list("bank_accounts", { where: { entityId, active: true }, orderBy: "name" }),
    db.list("journal_entries", { where: (j) => j.entityId === entityId && j.status === "posted" && ((j.source === "depreciation" && j.lines.some((l) => l.description === `Depreciation ${asset.name}`)) || j.sourceId === asset.id || j.id === asset.disposalJournalId), orderBy: "date" }),
    assetSource(entityId, asset), txId ? db.get("bank_transactions", txId) : Promise.resolve(null),
  ]);
  const accName = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : "— to choose —"; };
  const schedule = depreciationSchedule(asset, { fiscalYearStartMonth: entity.fiscalYearStartMonth });
  const writable = can(user, "books:write");
  const b = base(entityId);
  const here = `${b}/assets/${asset.id}`;
  const disposed = asset.status === "disposed";
  const started = depreciationStarted(asset);
  // Brought in from the ledger (lib/asset-takeon.ts): what the previous books had depreciated, and where the cost came from.
  const takeOn = asset.takeOn;
  const origin = takeOn ? (takeOn.mode === "account" ? `Brought in from the ledger: account ${accName(asset.assetAccountId)}, balance at ${fmtDateTime(takeOn.at)}` : "Brought in from the ledger") : undefined;
  const disposal = journals.find((j) => j.id === asset.disposalJournalId) ?? (disposed ? journals.find((j) => j.source === "adjustment" && j.sourceId === asset.id) : undefined);
  // Assets disposed of before the result was stored: accumulated depreciation is frozen at the disposal, so it can still be derived.
  const result = disposed ? asset.disposalGainLoss ?? roundMoney((asset.disposalProceeds ?? 0) - netBookValue(asset)) : 0;

  // A sale started from a statement line: only an unmatched money-in line of this entity counts.
  const txBank = txRow && txRow.entityId === entityId ? banks.find((x) => x.id === txRow.bankAccountId) : undefined;
  const tx: DisposeTx | undefined = txRow && txBank && txRow.status === "unmatched" && txRow.amount > 0 ? { id: txRow.id, bankAccountId: txBank.id, bankName: txBank.name, currency: txBank.currency, amount: txRow.amount } : undefined;
  const txProblem = txId && !tx ? (!txRow || txRow.entityId !== entityId ? "The bank statement line was not found." : txRow.status !== "unmatched" ? `The bank statement line is already ${txRow.status}.` : "This bank statement line cannot be the sale of an asset.") : undefined;
  const keep = tx ? new URLSearchParams({ tx: tx.id, ...(first(sp.date) ? { date: first(sp.date)! } : {}), ...(first(sp.proceeds) ? { proceeds: first(sp.proceeds)! } : {}), bankAccountId: tx.bankAccountId }).toString() : undefined;
  const queryDate = first(sp.date);
  const queryProceeds = Number(first(sp.proceeds));
  const queryBank = banks.find((x) => x.id === first(sp.bankAccountId));
  const defaults = {
    date: queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : tx ? txRow!.date : todayISO(),
    proceeds: Number.isFinite(queryProceeds) && queryProceeds > 0 ? queryProceeds : tx && tx.currency === "IDR" ? tx.amount : undefined,
    proceedsTo: tx ? tx.bankAccountId : queryBank ? queryBank.id : "none",
  };

  const active = accounts.filter((a) => a.active || [asset.assetAccountId, asset.accumDeprAccountId, asset.deprExpenseAccountId].includes(a.id));
  const opt = (a: typeof accounts[number]) => ({ id: a.id, code: a.code, name: a.name });
  const form = (
    <AssetForm
      action={updateAssetAction.bind(null, entityId, asset.id)} defaultDate={asset.acquisitionDate}
      assetAccounts={active.filter((a) => a.subtype === "fixed_asset").map(opt)} accumAccounts={active.filter((a) => a.subtype === "accum_depr").map(opt)}
      expenseAccounts={active.filter((a) => a.subtype === "depreciation" || a.type === "expense").sort((x, y) => (x.subtype === "depreciation" ? -1 : 1) - (y.subtype === "depreciation" ? -1 : 1)).map(opt)}
      edit={{ name: asset.name, fiscalGroup: asset.fiscalGroup, method: asset.method, usefulLifeMonths: asset.usefulLifeMonths, salvageValue: asset.salvageValue, assetAccountId: asset.assetAccountId, accumDeprAccountId: asset.accumDeprAccountId, deprExpenseAccountId: asset.deprExpenseAccountId, notes: asset.notes, cost: asset.cost, acquisitionDate: asset.acquisitionDate, locked: started, confirm: Boolean(asset.needsReview), keep,
        takeOn: takeOn && asset.needsReview ? { accumulated: takeOn.accumulated, through: takeOn.through, fiscalYearStartMonth: entity.fiscalYearStartMonth, lastMonth: prevPeriod(periodOf(todayISO())) } : undefined,
      }}
    />
  );
  const details: Array<[ReactNode, ReactNode]> = [
    ["Acquired", fmtDate(asset.acquisitionDate)], ["Cost", fmtMoney(asset.cost)], ["Salvage", fmtMoney(asset.salvageValue)], ["Group", FISCAL_ASSET_GROUPS[asset.fiscalGroup].label], ["Method", asset.method.replace("_", " ")], ["Useful life", `${asset.usefulLifeMonths} months`],
    ["Accumulated", fmtMoney(asset.accumulatedDepreciation)], [disposed ? "Net book value when disposed" : "Net book value", <strong key="n">{fmtMoney(netBookValue(asset))}</strong>], ["Depreciated through", asset.depreciatedThrough ?? "—"],
    ["Asset account", accName(asset.assetAccountId)], ["Accum. account", accName(asset.accumDeprAccountId)], ["Expense account", accName(asset.deprExpenseAccountId)],
    ["Registered from", source ? <span key="s"><Link href={source.href} className="text-brand-600 underline">{source.label}</Link>{origin && <span className="block text-xs text-ink-500">{origin}</span>}</span> : origin ?? "by hand"],
  ];
  if (takeOn) details.push(["Previous books", takeOn.through ? `${fmtMoney(takeOn.accumulated)} depreciated through ${periodLabel(takeOn.through)}` : "never depreciated"]);
  if (disposed) details.push(
    ["Disposed", `${fmtDate(asset.disposedAt)} for ${fmtMoney(asset.disposalProceeds ?? 0)}`],
    [result >= 0 ? "Gain on disposal" : "Loss on disposal", <strong key="g" className={result > 0 ? "text-green-700" : result < 0 ? "text-red-700" : ""}>{fmtMoney(Math.abs(result))}</strong>],
    ["Disposal entry", disposal ? <Link key="d" href={`${b}/journal/${disposal.id}`} className="text-brand-600 underline">{disposal.number}</Link> : "—"],
  );
  const remove = writable && !disposed && !started && !(asset.attachments?.length) && (
    <ConfirmForm action={deleteAssetAction.bind(null, entityId, asset.id)} message={`Remove "${asset.name}" from the asset register? The ledger is not changed.`}>
      <button type="submit" className="text-xs text-red-700 underline">{asset.needsReview ? (takeOn ? "Not to be in the register: remove it (its account can then be left out on the Assets page)" : "Not a new asset: remove it from the register") : "Remove from the register (nothing is posted on it)"}</button>
    </ConfirmForm>
  );
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-500"><Link href={`${b}/assets`} className="hover:underline">Assets</Link> / {asset.name}</p>
          <h2 className="text-xl font-bold">{asset.name} <Badge tone={statusTone(asset.status === "fully_depreciated" ? "done" : disposed ? "cancelled" : asset.status)}>{asset.status.replace("_", " ")}</Badge>{asset.needsReview && !disposed && <Badge tone="amber" className="ml-1">needs review</Badge>}</h2>
        </div>
      </div>
      {txProblem && <Notice tone="amber">{txProblem} <Link href={here} className="underline">Continue without it</Link>.</Notice>}
      {tx && !disposed && <Notice tone="blue">Sale from the statement line of {fmtDate(txRow!.date)} on {tx.bankName}: {txRow!.description} · {fmtMoney(tx.amount, tx.currency)}. The line is matched to the disposal entry once it is posted. <Link href={here} className="underline">Record the disposal without this line</Link>.</Notice>}
      {asset.needsReview && !disposed && (
        <div className="space-y-3">
          <Notice tone="amber">
            {takeOn ? (
              <>This asset was already in the ledger and was brought into the register{takeOn.mode === "account" ? <> as the balance of {accName(asset.assetAccountId)}</> : source ? <> from <Link href={source.href} className="underline">{source.label}</Link></> : null}. Check the acquisition date (an opening entry carries the date the books were taken over), the cost, the fiscal group, the useful life, the accounts and what the previous books had depreciated, then confirm: the register then posts the months that follow. Until then it is not depreciated and cannot be sold or disposed of. An asset that is not in use yet (construction in progress) is better removed and its account left out of the register until it is.</>
            ) : (
              <>{asset.sourceJournalId ? <>This asset was registered automatically{source ? <> from <Link href={source.href} className="underline">{source.label}</Link></> : null}.</> : <>This asset needs review.</>} Check the fiscal group, the useful life and the accounts, then confirm: until then it is not depreciated and cannot be sold or disposed of.</>
            )}
            {asset.notes && <span className="mt-1 block whitespace-pre-line">{asset.notes}</span>}
          </Notice>
          {writable && form}
          {remove}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <Card title={`Depreciation schedule (${schedule.length} months${takeOn?.through ? " left" : ""})`} className="min-w-0">
            {takeOn?.through && asset.fiscalGroup !== "land" && <p className="mb-3 text-sm text-ink-500">The previous books depreciated {fmtMoney(takeOn.accumulated)} through {periodLabel(takeOn.through)}. {schedule.length > 0 ? <>The register continues from {periodLabel(nextPeriod(takeOn.through))}{asset.needsReview ? ", once the asset is confirmed" : ""}.</> : <>Nothing is left to depreciate.</>}</p>}
            {schedule.length === 0 ? <p className="text-sm text-ink-500">{takeOn?.through && asset.fiscalGroup !== "land" ? "Fully depreciated." : "Not depreciated."}</p> : (
              <CardTable>
                <table className="table table-data min-w-[600px]">
                  <Cols widths={[undefined, 140, 140, 140, 80]} />
                  <thead><tr><th>Period</th><th className="num">Depreciation</th><th className="num">Accumulated</th><th className="num">NBV</th><th>Posted</th></tr></thead>
                  <tbody>
                    {schedule.map((r) => {
                      const posted = Boolean(asset.depreciatedThrough && r.period <= asset.depreciatedThrough);
                      return (
                        <tr key={r.period} className={posted ? "" : "row-muted"}>
                          <td className="whitespace-nowrap">{periodLabel(r.period)}</td>
                          <td className="num"><span className="money">{fmtMoney(r.amount)}</span></td>
                          <td className="num"><span className="money">{fmtMoney(r.accumulated)}</span></td>
                          <td className="num"><span className="money">{fmtMoney(r.nbv)}</span></td>
                          <td className="text-xs">{posted ? "✓" : <Dash />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardTable>
            )}
          </Card>
          {writable && !disposed && !asset.needsReview && (
            <details className="card">
              <summary className="cursor-pointer text-sm font-semibold text-ink-700">Edit details</summary>
              <div className="mt-3 space-y-3">{form}{remove}</div>
            </details>
          )}
          <Attachments entityId={entityId} docType="asset" docId={asset.id} items={asset.attachments ?? []} canWrite={writable} backTo={here} />
        </div>
        <div className="space-y-4">
          <Card title="Details">
            <DL items={details} />
            {asset.notes && (disposed || !asset.needsReview) && <p className="mt-3 whitespace-pre-line border-t border-slate-100 pt-3 text-xs text-ink-500">{asset.notes}</p>}
          </Card>
          {journals.length > 0 && <Card title="Journals"><ul className="space-y-1 text-sm">{journals.map((j) => <li key={j.id}><Link href={`${b}/journal/${j.id}`} className="text-brand-600 underline">{j.number}</Link> <span className="text-xs text-ink-500">{fmtDate(j.date)} · {j.memo}</span></li>)}</ul></Card>}
          {writable && !disposed && (
            <div id="dispose" className="scroll-mt-4">
              <Card title="Sell / dispose">
                {asset.needsReview ? <p className="text-sm text-ink-500">Confirm the asset first: the depreciation posted up to the disposal, and so the gain or loss, depend on its fiscal group and useful life.</p> : (
                  <DisposeForm
                    action={disposeAssetAction.bind(null, entityId, asset.id)} fiscalYearStartMonth={entity.fiscalYearStartMonth} banks={banks.map((x) => ({ id: x.id, name: x.name, currency: x.currency }))} defaults={defaults} tx={tx} keep={keep}
                    asset={{ cost: asset.cost, salvageValue: asset.salvageValue, acquisitionDate: asset.acquisitionDate, method: asset.method, usefulLifeMonths: asset.usefulLifeMonths, fiscalGroup: asset.fiscalGroup, depreciatedThrough: asset.depreciatedThrough, status: asset.status, accumulatedDepreciation: asset.accumulatedDepreciation, takeOn: takeOn && { accumulated: takeOn.accumulated, through: takeOn.through } }}
                  />
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
      <AuditTrail table="fixed_assets" docId={asset.id} />
    </div>
  );
}
