import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { netBookValue, depreciationDue } from "@/lib/ledger";
import { FISCAL_ASSET_GROUPS } from "@/lib/types";
import { fmtDate, todayISO, periodOf, prevPeriod } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Badge, statusTone, Money, Cols, Dash, EmptyState, Stat, Field, TableCard } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../shared";
import { runDepreciationAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Assets({ params, searchParams }: { params: Params; searchParams: Search }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const assets = (await db.list("fixed_assets", { where: { entityId } })).sort((a, b) => a.acquisitionDate.localeCompare(b.acquisitionDate));
  const writable = can(user, "books:write");
  const b = base(entityId);
  const lastMonth = prevPeriod(periodOf(todayISO()));
  const active = assets.filter((a) => a.status === "active");
  const due = active.map((a) => depreciationDue(a, lastMonth, { fiscalYearStartMonth: entity.fiscalYearStartMonth }).amount).reduce((s, x) => s + x, 0);
  const totals = { cost: assets.filter((a) => a.status !== "disposed").reduce((s, a) => s + a.cost, 0), accum: assets.filter((a) => a.status !== "disposed").reduce((s, a) => s + a.accumulatedDepreciation, 0) };
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Assets" value={assets.filter((a) => a.status !== "disposed").length} hint={`${assets.filter((a) => a.status === "disposed").length} disposed`} />
        <Stat label="Cost" value={fmtMoney(totals.cost)} />
        <Stat label="Net book value" value={fmtMoney(totals.cost - totals.accum)} hint={`accumulated ${fmtMoney(totals.accum)}`} />
        <Stat label={`Due through ${lastMonth}`} value={fmtMoney(due)} tone={due > 0 ? "text-amber-700" : ""} hint="unposted depreciation" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {writable ? (
          <form action={runDepreciationAction.bind(null, entityId)} className="flex flex-wrap items-end gap-2">
            <Field label="Run depreciation through"><input name="period" type="month" defaultValue={lastMonth} className="input !py-1" required /></Field>
            <SubmitButton pendingText="Posting…">Run depreciation</SubmitButton>
            <span className="text-xs text-ink-500">Posts one journal (Dr depreciation expense / Cr accumulated depreciation) for every active asset; months already posted are skipped.</span>
          </form>
        ) : <span />}
        {writable && <Link href={`${b}/assets/new`} className="btn-primary">Register asset</Link>}
      </div>
      {assets.length === 0 ? <EmptyState title="No fixed assets" hint="Register computers, vehicles, buildings and leasehold rights with their fiscal group." action={writable ? <Link href={`${b}/assets/new`} className="btn-primary">Register asset</Link> : undefined} /> : (
        <TableCard>
          <table className="table table-data min-w-[980px]">
            <Cols widths={[undefined, 118, 140, 140, 140, 96, 160]} />
            <thead><tr><th>Asset</th><th>Acquired</th><th className="num">Cost</th><th className="num">Accum. depr.</th><th className="num">NBV</th><th>Through</th><th>Status</th></tr></thead>
            <tbody>
              {assets.map((a) => {
                const meta = `${FISCAL_ASSET_GROUPS[a.fiscalGroup].label.split(" (")[0]} · ${a.usefulLifeMonths} m · ${a.method === "straight_line" ? "Straight line" : "Declining"}`;
                const disposed = a.status === "disposed";
                return (
                  <tr key={a.id} className={disposed ? "row-muted" : ""}>
                    <td>
                      <Link href={`${b}/assets/${a.id}`} className={disposed ? "cell font-medium" : "cell-primary"} title={a.name}>{a.name}</Link>
                      <span className="cell-sub" title={meta}>{meta}</span>
                    </td>
                    <td className="whitespace-nowrap">{fmtDate(a.acquisitionDate)}</td>
                    <td className="num"><Money amount={a.cost} className="money" /></td>
                    <td className="num"><Money amount={a.accumulatedDepreciation} className="money" /></td>
                    <td className="num font-medium"><Money amount={netBookValue(a)} className="money" /></td>
                    <td className="whitespace-nowrap text-xs">{a.depreciatedThrough ?? <Dash />}</td>
                    <td><Badge tone={statusTone(a.status === "fully_depreciated" ? "done" : a.status === "disposed" ? "cancelled" : a.status)}>{a.status.replace("_", " ")}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={2}>Total (excluding disposed)</td><td className="num">{fmtMoney(totals.cost)}</td><td className="num">{fmtMoney(totals.accum)}</td><td className="num">{fmtMoney(totals.cost - totals.accum)}</td><td colSpan={2}></td></tr></tfoot>
          </table>
        </TableCard>
      )}
    </div>
  );
}
