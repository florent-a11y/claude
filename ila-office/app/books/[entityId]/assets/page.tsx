import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { autoDepreciationOn, heldForFirstRun } from "@/lib/asset-auto";
import { takeOnPreview } from "@/lib/asset-takeon-services";
import { netBookValue, depreciationDue } from "@/lib/ledger";
import { FISCAL_ASSET_GROUPS } from "@/lib/types";
import { fmtDate, todayISO, periodOf, periodLabel, prevPeriod } from "@/lib/dates";
import { fmtMoney, roundMoney } from "@/lib/money";
import { Badge, statusTone, Money, Cols, Dash, EmptyState, Stat, Field, TableCard, CardTable, Notice, Chips, Card } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../shared";
import { assetSources } from "./source";
import { runDepreciationAction, setAssetAccountOutsideAction, setAutoDepreciationAction, takeOnAction } from "./actions";

export const dynamic = "force-dynamic";

const FILTERS = ["current", "review", "disposed", "all"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * The fixed-asset register. Purchases posted to a fixed-asset account arrive here on their own, flagged "needs
 * review" until an accountant confirms them; sold and disposed assets move under "Disposed" and leave the totals;
 * depreciation is posted by the daily job for the month just ended (lib/asset-auto.ts), or by hand from here.
 * Fixed assets the ledger carries without the register knowing them (QuickBooks history, opening balances) are
 * offered to be brought in (lib/asset-takeon.ts), and a check at the foot of the page compares ledger and register.
 */
export default async function Assets({ params, searchParams }: { params: Params; searchParams: Search }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const [all, runs, takeOn] = await Promise.all([db.list("fixed_assets", { where: { entityId } }), db.list("journal_entries", { where: { entityId, source: "depreciation", status: "posted" } }), takeOnPreview(entityId)]);
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
  // Ledger against register: a cost account left out of the register is expected to differ.
  const differing = takeOn.ledgerVsRegister.filter((r) => !r.outside && Math.abs(r.difference) >= 0.005);
  const checkRows = (kind: "cost" | "accumulated") => takeOn.ledgerVsRegister.filter((r) => r.kind === kind);
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
          {review.length === 1 ? "1 asset was registered automatically and needs review" : `${review.length} assets were registered automatically and need review`}: check the fiscal group, the useful life and the accounts, then confirm. Depreciation starts once an asset is confirmed.{review.some((a) => a.takeOn) ? " For the assets brought in from the ledger, also enter the real acquisition date and check the depreciation taken over from the previous books: the register continues from there." : ""}{" "}
          {filter !== "review" && <Link href={href("review")} className="font-medium underline">Show {review.length === 1 ? "it" : "them"}</Link>}
        </Notice>
      )}
      {takeOn.offers.length > 0 && (
        <Notice tone="amber">
          The ledger carries {fmtMoney(takeOn.unregisteredTotal)} of fixed assets that are not in the register ({takeOn.offers.length === 1 ? "1 account" : `${takeOn.offers.length} accounts`}): they are not depreciated from here until they are brought in{writable ? " below" : ""} and confirmed.
        </Notice>
      )}
      {(takeOn.offers.length > 0 || takeOn.leftOut.length > 0) && (
        <Card title={takeOn.offers.length > 0 ? "In the ledger, not in the register" : "Accounts left out of the register"}>
          {takeOn.offers.length > 0 && (
            <form action={takeOnAction.bind(null, entityId)} className="space-y-3">
              <CardTable bottom={false}>
                <table className={`table table-data ${writable ? "min-w-[960px]" : "min-w-[720px]"}`}>
                  <Cols widths={[undefined, 200, 76, 230, ...(writable ? [250] : [])]} />
                  <thead><tr><th>Account</th><th className="num">Not in the register</th><th className="num">Lines</th><th>Accumulated depreciation</th>{writable && <th>Bring in as</th>}</tr></thead>
                  <tbody>
                    {takeOn.offers.map((o) => {
                      const accum = takeOn.accumulated.find((x) => x.accountId === o.accumAccountId);
                      const lines = o.lines.length === 0 ? "no purchase line left" : o.lines.slice(0, 3).map((l) => l.description || l.journalNumber).join(" · ") + (o.lines.length > 3 ? ` · and ${o.lines.length - 3} more` : "");
                      return (
                        <tr key={o.accountId}>
                          <td><span className="cell font-medium" title={`${o.code} ${o.name}`}>{o.code} {o.name}</span><span className="cell-sub" title={lines}>{lines}</span></td>
                          <td className="num"><Money amount={o.unregistered} className="money font-medium" /><span className="cell-sub" title={`Ledger ${fmtMoney(o.ledgerCost)}, register ${fmtMoney(o.registeredCost)}`}>{o.registeredCost >= 0.005 ? `of ${fmtMoney(o.ledgerCost)} in the ledger` : "nothing in the register yet"}</span></td>
                          <td className="num">{o.lines.length}{o.credits >= 0.005 && <span className="cell-sub" title={`credits ${fmtMoney(o.credits)}`}>credits {fmtMoney(o.credits)}</span>}</td>
                          <td>{accum
                            ? <><span className="cell" title={`${accum.code} ${accum.name}`}>{accum.code} {accum.name}</span><span className="cell-sub">{o.accumulated >= 0.005 ? `${fmtMoney(o.accumulated)} through ${o.through ? periodLabel(o.through) : "?"}` : "nothing to take over"}</span></>
                            : <span className="cell text-xs text-ink-500">none found: chosen on review</span>}</td>
                          {writable && (
                            <td>
                              <select name={`mode:${o.accountId}`} defaultValue={o.defaultMode} className="input !py-1 text-sm" aria-label={`How to bring in ${o.code} ${o.name}`} title={o.accountOnly ? `One asset per purchase line is not offered: ${o.accountOnly}` : undefined}>
                                {o.lineAllowed && <option value="line">One asset per purchase line ({o.lines.length})</option>}
                                <option value="account">One asset for the account</option>
                                <option value="skip">Leave this account out of the register</option>
                              </select>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardTable>
              {writable && (
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton pendingText="Bringing in…">Bring into the register</SubmitButton>
                  <span className="text-xs text-ink-500">Nothing is posted: the cost and the depreciation to date are already in the ledger. Each asset arrives flagged “needs review” with the accumulated depreciation of the previous books; once it is confirmed the monthly run continues from there.</span>
                </div>
              )}
            </form>
          )}
          {takeOn.leftOut.length > 0 && (
            <ul className={`space-y-1 text-xs text-ink-500 ${takeOn.offers.length > 0 ? "mt-3 border-t border-slate-100 pt-3" : ""}`}>
              {takeOn.leftOut.map((l) => (
                <li key={l.accountId} className="flex flex-wrap items-center gap-x-2">
                  <span>Left out: {l.code} {l.name} ({fmtMoney(l.ledgerCost)} in the ledger)</span>
                  {writable && <form action={setAssetAccountOutsideAction.bind(null, entityId, l.accountId)} className="inline"><button type="submit" className="underline">bring back</button></form>}
                </li>
              ))}
            </ul>
          )}
        </Card>
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
      {assets.length === 0 ? <EmptyState title="No fixed assets" hint="Assets bought through a bill, an expense or a journal on a fixed-asset account appear here on their own. Assets the ledger already carries (QuickBooks history, opening balances) are offered above to be brought in." action={writable ? <Link href={`${b}/assets/new`} className="btn-primary">Register asset</Link> : undefined} />
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
                    <td>{source ? <Link href={source.href} className="cell text-brand-600 underline" title={source.label}>{source.label}</Link> : <span className="cell text-xs text-ink-500">{a.takeOn ? "ledger balance" : "by hand"}</span>}{a.takeOn && source && <span className="cell-sub">brought in from the ledger</span>}</td>
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
      {takeOn.ledgerVsRegister.length > 0 && (
        <details className="card" open={differing.length > 0}>
          <summary className="cursor-pointer text-sm font-semibold text-ink-700">
            Ledger and register{" "}
            {differing.length === 0 ? <Badge tone="green">agree</Badge> : <Badge tone="amber">{differing.length === 1 ? "1 difference" : `${differing.length} differences`}</Badge>}
          </summary>
          <div className="mt-3 space-y-3">
            <CardTable bottom={false}>
              <table className="table table-data min-w-[640px]">
                <Cols widths={[undefined, 150, 150, 150]} />
                <thead><tr><th>Account</th><th className="num">Ledger</th><th className="num">Register</th><th className="num">Difference</th></tr></thead>
                {(["cost", "accumulated"] as const).map((kind) => checkRows(kind).length > 0 && (
                  <tbody key={kind}>
                    <tr className="group-row"><td colSpan={4}>{kind === "cost" ? "Cost" : "Accumulated depreciation"}</td></tr>
                    {checkRows(kind).map((r) => {
                      const off = Math.abs(r.difference) >= 0.005;
                      return (
                        <tr key={r.accountId}>
                          <td><span className="cell" title={`${r.code} ${r.name}`}>{r.code} {r.name}</span>{r.outside && <span className="cell-sub">left out of the register</span>}</td>
                          <td className="num"><Money amount={r.ledger} className="money" /></td>
                          <td className="num"><Money amount={r.register} className="money" /></td>
                          <td className={`num ${off && !r.outside ? "font-semibold text-red-700" : "text-ink-500"}`}>{off ? fmtMoney(r.difference) : "✓"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </CardTable>
            <p className="text-xs text-ink-500">Ledger: the balance of each fixed-asset and accumulated-depreciation account. Register: cost and accumulated depreciation of the assets on that account, disposed ones excepted. A difference means the ledger moved without the register (a journal posted by hand, an asset not brought in yet) or the other way round.</p>
          </div>
        </details>
      )}
    </div>
  );
}
