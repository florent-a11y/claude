import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { autoDepreciationOn, heldForFirstRun } from "@/lib/asset-auto";
import { netBookValue, depreciationDue } from "@/lib/ledger";
import { FISCAL_ASSET_GROUPS } from "@/lib/types";
import { fmtDate, todayISO, periodOf, periodLabel, prevPeriod } from "@/lib/dates";
import { fmtMoney, roundMoney } from "@/lib/money";
import { Badge, statusTone, Money, Cols, Dash, EmptyState, Stat, Field, TableCard, Notice, Chips, Card } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../shared";
import { assetSources } from "./source";
import { runDepreciationAction, setAutoDepreciationAction } from "./actions";

export const dynamic = "force-dynamic";

const FILTERS = ["current", "review", "disposed", "all"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * The fixed-asset register. Purchases posted to a fixed-asset account arrive here on their own, flagged "needs
 * review" until an accountant confirms them; sold and disposed assets move under "Disposed" and leave the totals;
 * depreciation is posted by the daily job for the month just ended (lib/asset-auto.ts), or by hand from here.
 */
export default async function Assets({ params, searchParams }: { params: Params; searchParams: Search }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const [all, runs] = await Promise.all([db.list("fixed_assets", { where: { entityId } }), db.list("journal_entries", { where: { entityId, source: "depreciation", status: "posted" } })]);
  const assets = all.sort((a, b) => a.acquisitionDate.localeCompare(b.acquisitionDate) || a.name.localeCompare(b.name));
  const sources = await assetSources(entityId, assets);
  const writable = can(user, "books:write");
  const b = base(entityId);
  const lastMonth = prevPeriod(periodOf(todayISO()));
  const inUse = assets.filter((a) => a.status !== "disposed");
  const review = inUse.filter((a) => a.needsReview);
  const disposedCount = assets.length - inUse.length;
  const requested = first(sp.show) as Filter | undefined;
  const filter: Filter = requested && FILTERS.includes(requested) ? requested : "current";
  const rows = filter === "all" ? assets : filter === "disposed" ? assets.filter((a) => a.status === "disposed") : filter === "review" ? review : inUse;
  // Unposted depreciation of the assets that are depreciated at all: those waiting for review are not.
  const dueOf = (a: typeof assets[number]) => (a.status === "active" && !a.needsReview ? depreciationDue(a, lastMonth, { fiscalYearStartMonth: entity.fiscalYearStartMonth }).amount : 0);
  const due = roundMoney(inUse.reduce((s, a) => s + dueOf(a), 0));
  const totals = { cost: roundMoney(inUse.reduce((s, a) => s + a.cost, 0)), accum: roundMoney(inUse.reduce((s, a) => s + a.accumulatedDepreciation, 0)) };
  const shown = rows.filter((a) => a.status !== "disposed");
  const shownTotals = { cost: roundMoney(shown.reduce((s, a) => s + a.cost, 0)), accum: roundMoney(shown.reduce((s, a) => s + a.accumulatedDepreciation, 0)) };
  const autoOn = autoDepreciationOn(entity);
  const held = inUse.filter((a) => heldForFirstRun(a, lastMonth) && dueOf(a) > 0);
  // Monthly runs carry their period as sourceId; the catch-up entries posted before a disposal ("<assetId>:catchup") are not runs.
  const lastRun = runs.filter((j) => /^\d{4}-\d{2}$/.test(j.sourceId ?? "")).sort((x, y) => (y.sourceId ?? "").localeCompare(x.sourceId ?? "") || y.date.localeCompare(x.date))[0];
  const href = (f: Filter) => (f === "current" ? `${b}/assets` : `${b}/assets?show=${f}`);
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Assets" value={inUse.length} hint={`${disposedCount} disposed`} />
        <Stat label="Cost" value={fmtMoney(totals.cost)} />
        <Stat label="Net book value" value={fmtMoney(totals.cost - totals.accum)} hint={`accumulated ${fmtMoney(totals.accum)}`} />
        <Stat label={`Due through ${lastMonth}`} value={fmtMoney(due)} tone={due > 0 ? "text-amber-700" : ""} hint="unposted depreciation" />
      </div>
      {review.length > 0 && (
        <Notice tone="amber">
          {review.length === 1 ? "1 asset was registered automatically and needs review" : `${review.length} assets were registered automatically and need review`}: check the fiscal group, the useful life and the accounts, then confirm. Depreciation starts once an asset is confirmed.{" "}
          {filter !== "review" && <Link href={href("review")} className="font-medium underline">Show {review.length === 1 ? "it" : "them"}</Link>}
        </Notice>
      )}
      <Card title="Depreciation">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <Badge tone={autoOn ? "green" : "slate"}>{autoOn ? "automatic" : "manual"}</Badge>
            <span>{autoOn ? "Depreciation is posted automatically on the 1st for the previous month." : "Automatic depreciation is off for this entity: run it from here each month."}</span>
            <span className="text-ink-500">Last posted: {lastRun ? <><Link href={`${b}/journal/${lastRun.id}`} className="underline">{periodLabel(lastRun.sourceId!)}</Link> ({lastRun.number})</> : "never"}</span>
            {writable && (
              <form action={setAutoDepreciationAction.bind(null, entityId)} className="inline">
                <input type="hidden" name="on" value={autoOn ? "" : "1"} />
                <button type="submit" className="btn-secondary !px-2 !py-1 text-xs">{autoOn ? "Turn off" : "Turn on"}</button>
              </form>
            )}
          </div>
          {autoOn && held.length > 0 && (
            <Notice tone="blue">
              {held.length === 1 ? "1 asset registered by hand has" : `${held.length} assets registered by hand have`} never been depreciated from this register and {held.length === 1 ? "is" : "are"} behind ({held.map((a) => a.name).slice(0, 3).join(", ")}{held.length > 3 ? "…" : ""}). The automatic run leaves {held.length === 1 ? "it" : "them"} alone, in case the earlier depreciation is already in the ledger (opening balances, imported history): running depreciation below posts the whole backlog and starts {held.length === 1 ? "it" : "them"}.
            </Notice>
          )}
          {writable && (
            <form action={runDepreciationAction.bind(null, entityId)} className="flex flex-wrap items-end gap-2">
              <Field label="Run depreciation through"><input name="period" type="month" defaultValue={lastMonth} className="input !py-1" required /></Field>
              <SubmitButton pendingText="Posting…">Run depreciation</SubmitButton>
              <span className="text-xs text-ink-500">Posts one journal (Dr depreciation expense / Cr accumulated depreciation) for every active, confirmed asset; months already posted are skipped.</span>
            </form>
          )}
        </div>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chips items={[
          { href: href("current"), label: `In use (${inUse.length})`, active: filter === "current" },
          { href: href("review"), label: `Needs review (${review.length})`, active: filter === "review" },
          { href: href("disposed"), label: `Disposed (${disposedCount})`, active: filter === "disposed" },
          { href: href("all"), label: `All (${assets.length})`, active: filter === "all" },
        ]} />
        {writable && <Link href={`${b}/assets/new`} className="btn-primary">Register asset</Link>}
      </div>
      {assets.length === 0 ? <EmptyState title="No fixed assets" hint="Assets bought through a bill, an expense or a journal on a fixed-asset account appear here on their own. Register by hand the ones already in the books (opening balances, imported history)." action={writable ? <Link href={`${b}/assets/new`} className="btn-primary">Register asset</Link> : undefined} />
        : rows.length === 0 ? <EmptyState title={filter === "review" ? "Nothing to review" : filter === "disposed" ? "No disposed assets" : "No assets in use"} hint={filter === "disposed" ? "Sold, scrapped and written-off assets are listed here." : undefined} /> : (
        <TableCard>
          <table className="table table-data min-w-[1120px]">
            <Cols widths={[undefined, 150, 112, 134, 134, 134, 84, 176]} />
            <thead><tr><th>Asset</th><th>Registered from</th><th>Acquired</th><th className="num">Cost</th><th className="num">Accum. depr.</th><th className="num">NBV</th><th>Through</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const meta = `${FISCAL_ASSET_GROUPS[a.fiscalGroup].label.split(" (")[0]} · ${a.usefulLifeMonths} m · ${a.method === "straight_line" ? "Straight line" : "Declining"}`;
                const disposed = a.status === "disposed";
                const source = sources.get(a.id);
                const result = disposed ? a.disposalGainLoss ?? roundMoney((a.disposalProceeds ?? 0) - netBookValue(a)) : 0;
                const sold = disposed ? `${fmtDate(a.disposedAt)} · ${result > 0 ? `gain ${fmtMoney(result)}` : result < 0 ? `loss ${fmtMoney(-result)}` : "no gain or loss"}` : "";
                return (
                  <tr key={a.id} className={disposed ? "row-muted" : ""}>
                    <td>
                      <Link href={`${b}/assets/${a.id}`} className={disposed ? "cell font-medium" : "cell-primary"} title={a.name}>{a.name}</Link>
                      <span className="cell-sub" title={meta}>{meta}</span>
                    </td>
                    <td>{source ? <Link href={source.href} className="cell text-brand-600 underline" title={source.label}>{source.label}</Link> : <span className="cell text-xs text-ink-500">by hand</span>}</td>
                    <td className="whitespace-nowrap">{fmtDate(a.acquisitionDate)}</td>
                    <td className="num"><Money amount={a.cost} className="money" /></td>
                    <td className="num"><Money amount={a.accumulatedDepreciation} className="money" /></td>
                    <td className="num font-medium"><Money amount={netBookValue(a)} className="money" /></td>
                    <td className="whitespace-nowrap text-xs">{a.depreciatedThrough ?? <Dash />}</td>
                    <td>
                      <Badge tone={statusTone(a.status === "fully_depreciated" ? "done" : disposed ? "cancelled" : a.status)}>{a.status.replace("_", " ")}</Badge>
                      {a.needsReview && <Badge tone="amber" className="ml-1">needs review</Badge>}
                      {disposed && <span className="cell-sub" title={sold}>{sold}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {shown.length > 0 && <tfoot><tr><td colSpan={3}>Total (excluding disposed)</td><td className="num">{fmtMoney(shownTotals.cost)}</td><td className="num">{fmtMoney(shownTotals.accum)}</td><td className="num">{fmtMoney(shownTotals.cost - shownTotals.accum)}</td><td colSpan={2}></td></tr></tfoot>}
          </table>
        </TableCard>
      )}
    </div>
  );
}
