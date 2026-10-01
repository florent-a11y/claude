import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { depreciationSchedule, netBookValue } from "@/lib/ledger";
import { FISCAL_ASSET_GROUPS } from "@/lib/types";
import { fmtDate, todayISO, periodLabel } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Card, Badge, statusTone, DL, Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Search } from "../../shared";
import { disposeAssetAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AssetPage({ params, searchParams }: { params: Promise<{ entityId: string; assetId: string }>; searchParams: Search }) {
  const user = await requireUser();
  const { entityId, assetId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const asset = await db.get("fixed_assets", assetId);
  if (!asset || asset.entityId !== entityId) notFound();
  const [accounts, banks, journals] = await Promise.all([db.list("accounts", { where: { entityId } }), db.list("bank_accounts", { where: { entityId, active: true } }), db.list("journal_entries", { where: (j) => j.entityId === entityId && j.status === "posted" && ((j.source === "depreciation" && j.lines.some((l) => l.description === `Depreciation ${asset.name}`)) || j.sourceId === asset.id), orderBy: "date" })]);
  const accName = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : id; };
  const schedule = depreciationSchedule(asset, { fiscalYearStartMonth: entity.fiscalYearStartMonth });
  const writable = can(user, "books:write");
  const b = base(entityId);
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs text-ink-500"><Link href={`${b}/assets`} className="hover:underline">Assets</Link> / {asset.name}</p><h2 className="text-xl font-bold">{asset.name} <Badge tone={statusTone(asset.status === "fully_depreciated" ? "done" : asset.status === "disposed" ? "cancelled" : asset.status)}>{asset.status.replace("_", " ")}</Badge></h2></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card title={`Depreciation schedule (${schedule.length} months)`} className="overflow-x-auto">
          {schedule.length === 0 ? <p className="text-sm text-ink-500">Not depreciated.</p> : (
            <table className="table">
              <thead><tr><th>Period</th><th className="num">Depreciation</th><th className="num">Accumulated</th><th className="num">NBV</th><th>Posted</th></tr></thead>
              <tbody>
                {schedule.map((r) => <tr key={r.period} className={asset.depreciatedThrough && r.period <= asset.depreciatedThrough ? "" : "text-ink-500"}><td>{periodLabel(r.period)}</td><td className="num">{fmtMoney(r.amount)}</td><td className="num">{fmtMoney(r.accumulated)}</td><td className="num">{fmtMoney(r.nbv)}</td><td className="text-xs">{asset.depreciatedThrough && r.period <= asset.depreciatedThrough ? "✓" : ""}</td></tr>)}
              </tbody>
            </table>
          )}
        </Card>
        <div className="space-y-4">
          <Card title="Details">
            <DL items={[["Acquired", fmtDate(asset.acquisitionDate)], ["Cost", fmtMoney(asset.cost)], ["Salvage", fmtMoney(asset.salvageValue)], ["Group", FISCAL_ASSET_GROUPS[asset.fiscalGroup].label], ["Method", asset.method.replace("_", " ")], ["Useful life", `${asset.usefulLifeMonths} months`], ["Accumulated", fmtMoney(asset.accumulatedDepreciation)], ["Net book value", <strong key="n">{fmtMoney(netBookValue(asset))}</strong>], ["Depreciated through", asset.depreciatedThrough ?? "—"], ["Asset account", accName(asset.assetAccountId)], ["Accum. account", accName(asset.accumDeprAccountId)], ["Expense account", accName(asset.deprExpenseAccountId)], ["Disposed", asset.disposedAt ? `${fmtDate(asset.disposedAt)} for ${fmtMoney(asset.disposalProceeds ?? 0)}` : "—"]]} />
          </Card>
          {journals.length > 0 && <Card title="Journals"><ul className="space-y-1 text-sm">{journals.map((j) => <li key={j.id}><Link href={`${b}/journal/${j.id}`} className="text-brand-600 underline">{j.number}</Link> <span className="text-xs text-ink-500">{fmtDate(j.date)} · {j.memo}</span></li>)}</ul></Card>}
          {writable && asset.status !== "disposed" && (
            <Card title="Dispose / write off">
              <form action={disposeAssetAction.bind(null, entityId, asset.id)} className="space-y-3">
                <Field label="Disposal date"><input name="date" type="date" defaultValue={todayISO()} required className="input" /></Field>
                <Field label="Proceeds (IDR)" hint="0 for a write-off."><input name="proceeds" inputMode="numeric" defaultValue="0" className="input text-right" /></Field>
                <Field label="Proceeds received in" hint="Leave blank to book to other receivables."><Select name="bankAccountId" defaultValue="" options={[{ value: "", label: "— other receivables —" }, ...banks.map((x) => ({ value: x.id, label: x.name }))]} /></Field>
                <SubmitButton className="btn-danger" pendingText="Posting…">Dispose</SubmitButton>
                <p className="text-xs text-ink-500">Run depreciation through the disposal month first. Posts Dr accumulated depreciation / Dr proceeds / Cr asset cost, gain or loss to other income/expenses.</p>
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
