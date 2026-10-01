import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, quarterOf, todayISO, periodLabel } from "@/lib/dates";
import { ENTITY_TYPE_LABELS, OBLIGATION_STATUS_LABELS } from "@/lib/types";
import { lkpmPackForEntity } from "@/lib/tax/services";
import { LKPM_ASSET_LABELS, quartersOf, type LkpmAssetCategory } from "@/lib/tax/lkpm";
import { Card, Chips, DL, Notice } from "@/components/ui";
import { PrintButton } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function LkpmPage({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await db.get("entities", entityId);
  if (!entity) notFound();
  const today = todayISO();
  const quarter = sp.quarter && /^\d{4}-Q[1-4]$/.test(sp.quarter) ? sp.quarter : quarterOf(today.slice(0, 7));
  const year = Number(quarter.slice(0, 4));
  const pack = await lkpmPackForEntity(entityId, quarter);
  const f = (v: number) => v.toLocaleString("en-US");
  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <Chips items={[...quartersOf(year - 1).slice(3), ...quartersOf(year)].map((q) => ({ href: `/tax/${entityId}/lkpm?quarter=${q}`, label: q, active: q === quarter }))} />
        <div className="flex gap-2"><a href={`/tax/${entityId}/lkpm/export?quarter=${quarter}`} className="btn-secondary">Export CSV</a><PrintButton label="Print data pack" /></div>
      </div>
      {!entity.tax.lkpm && <Notice tone="amber">This entity is not flagged for LKPM. PT PMA must report every quarter; PMDN above the thresholds too.</Notice>}
      <Card title={`LKPM data pack · ${quarter} (${fmtDate(pack.from)} – ${fmtDate(pack.to)}) · due 10 ${periodLabel(`${pack.to.slice(0, 4)}-${String(Number(pack.to.slice(5, 7)) % 12 + 1).padStart(2, "0")}`)}`}>
        <DL items={[["Company", entity.legalName], ["Type", ENTITY_TYPE_LABELS[entity.type]], ["NIB", entity.nib ?? "—"], ["NPWP", entity.npwp ?? "—"], ["Location", [entity.address, entity.city, entity.region].filter(Boolean).join(", ") || "—"]]} />
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Realisasi investasi · investment realisation (IDR)">
          <table className="table">
            <tbody>
              {(Object.keys(LKPM_ASSET_LABELS) as LkpmAssetCategory[]).map((c) => <tr key={c}><td>{LKPM_ASSET_LABELS[c]}</td><td className="num">{f(pack.fixedAssets[c])}</td></tr>)}
              <tr className="font-semibold"><td>Modal tetap · fixed assets (gross cost, cumulative)</td><td className="num">{f(pack.fixedAssetsTotal)}</td></tr>
              <tr><td>Modal kerja · working capital (operating expenses of the quarter)</td><td className="num">{f(pack.workingCapital)}</td></tr>
              <tr className="font-semibold"><td>Total realisasi investasi</td><td className="num">{f(pack.investmentRealisation)}</td></tr>
              <tr><td>Modal disetor · paid-up capital</td><td className="num">{f(pack.paidUpCapital)}</td></tr>
            </tbody>
          </table>
          {pack.assetAdditions.length > 0 && (
            <div className="mt-3"><p className="mb-1 text-xs font-semibold text-ink-700">Fixed-asset additions this quarter</p>
              <table className="table"><tbody>{pack.assetAdditions.map((a, i) => <tr key={i}><td className="text-xs">{fmtDate(a.date)}</td><td className="text-xs">{a.name}</td><td className="text-xs text-ink-500">{LKPM_ASSET_LABELS[a.category].split(" (")[0]}</td><td className="num">{f(a.cost)}</td></tr>)}</tbody></table></div>
          )}
        </Card>
        <Card title="Activity and workforce">
          <table className="table">
            <tbody>
              <tr><td>Revenue of the quarter</td><td className="num">{f(pack.revenueQuarter)}</td></tr>
              <tr><td>Expenses of the quarter</td><td className="num">{f(pack.expensesQuarter)}</td></tr>
              <tr><td>Tenaga kerja Indonesia · local employees</td><td className="num">{pack.headcount.local}</td></tr>
              <tr><td>Tenaga kerja asing · foreign employees</td><td className="num">{pack.headcount.foreign}</td></tr>
              <tr className="font-semibold"><td>Total headcount at quarter end</td><td className="num">{pack.headcount.total}</td></tr>
            </tbody>
          </table>
          {pack.foreignEmployees.length > 0 && <ul className="mt-2 text-xs text-ink-500">{pack.foreignEmployees.map((e, i) => <li key={i}>{e.name}{e.position ? ` · ${e.position}` : ""}{e.passportNumber ? ` · passport ${e.passportNumber}` : ""}</li>)}</ul>}
          {pack.headcount.total === 0 && <p className="mt-2 text-xs text-ink-500">No employee on record. Headcount comes from the Payroll › Employees register (foreign flag).</p>}
        </Card>
      </div>
      <Card title="Kendala / kewajiban · outstanding obligations at quarter end">
        {pack.outstandingObligations.length === 0 ? <p className="text-sm text-ink-500">Nothing outstanding.</p> : (
          <table className="table"><thead><tr><th>Obligation</th><th>Period</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>{pack.outstandingObligations.map((o) => <tr key={o.id}><td className="text-xs">{o.label}</td><td className="text-xs">{periodLabel(o.period)}</td><td className="text-xs">{fmtDate(o.reportDue)}</td><td className="text-xs">{OBLIGATION_STATUS_LABELS[o.status]}</td></tr>)}</tbody></table>
        )}
      </Card>
      <p className="text-xs text-ink-500 no-print">Figures come from posted journals (fixed-asset accounts by name: land, buildings, machinery/equipment/vehicles, other), the share-capital accounts and the employee register. Submit on OSS (oss.go.id › LKPM) by the 10th of the month after the quarter. <Link href={`/tax/${entityId}?year=${year}`} className="underline">Calendar</Link></p>
    </div>
  );
}
