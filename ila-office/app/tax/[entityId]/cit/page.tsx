import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayISO, periodLabel } from "@/lib/dates";
import { TAX_REGIME_LABELS } from "@/lib/types";
import { computeCitForEntity, fiscalYearRange } from "@/lib/tax/services";
import { Card, Chips, Field, Notice } from "@/components/ui";
import { PrintButton } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function CitPage({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await db.get("entities", entityId);
  if (!entity) notFound();
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : Number(todayISO().slice(0, 4)) - (Number(todayISO().slice(5, 7)) < 5 ? 1 : 0);
  const n = (k: string) => (sp[k] ? Number(sp[k]) || 0 : 0);
  const adjustments = { nonTaxableIncome: n("nonTaxable"), otherPositive: n("otherPos"), otherNegative: n("otherNeg"), note: sp.note };
  const cit = await computeCitForEntity(entity, year, adjustments, n("loss"));
  const { from, to } = fiscalYearRange(entity, year);
  const cur = entity.baseCurrency;
  const f = (v: number) => v.toLocaleString("en-US");
  const line = (label: string, amount: number, opts: { bold?: boolean; sub?: boolean; note?: string; key?: string } = {}) => (
    <tr key={opts.key ?? label} className={opts.bold ? "font-semibold" : ""}><td className={opts.sub ? "pl-6 text-ink-500" : ""}>{label}{opts.note && <span className="ml-2 text-xs font-normal text-ink-500">{opts.note}</span>}</td><td className={`num ${amount < 0 ? "text-red-700" : ""}`}>{f(amount)}</td></tr>
  );
  const query = (y: number) => `/tax/${entityId}/cit?year=${y}${sp.nonTaxable ? `&nonTaxable=${sp.nonTaxable}` : ""}${sp.otherPos ? `&otherPos=${sp.otherPos}` : ""}${sp.otherNeg ? `&otherNeg=${sp.otherNeg}` : ""}${sp.loss ? `&loss=${sp.loss}` : ""}`;
  return (
    <div className="grid gap-4 pb-8 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2 no-print">
          <Chips items={[year - 2, year - 1, year].map((y) => ({ href: query(y), label: String(y), active: y === year }))} />
          <PrintButton label="Print schedule" />
        </div>
        <Card title={`Corporate income tax computation · fiscal year ${year} (${from} → ${to})`}>
          <p className="mb-3 text-xs text-ink-500">{entity.legalName} · NPWP {entity.npwp ?? "—"} · regime: {TAX_REGIME_LABELS[entity.tax.regime]} · amounts in {cur}</p>
          {entity.tax.regime === "none" && <Notice tone="blue">No corporate income tax regime set for this entity.</Notice>}
          <table className="table">
            <tbody>
              {line("Revenue", cit.revenue)}
              {line("Gross turnover (peredaran bruto)", cit.turnover, { sub: true })}
              {line("Expenses", -cit.expenses)}
              {line("Accounting profit before tax", cit.accountingProfit, { bold: true })}
              {cit.nonDeductibleExpenses.map((x) => line(`+ non-deductible: ${x.code} ${x.name}`, x.amount, { sub: true, key: `nd-${x.code}` }))}
              {line("+ Non-deductible expenses (positive adjustments)", cit.nonDeductibleTotal)}
              {line("− Income subject to final tax / non-taxable (negative adjustments)", -cit.nonTaxableIncome, { note: adjustments.note })}
              {cit.otherAdjustments !== 0 ? line("± Other fiscal adjustments", cit.otherAdjustments) : null}
              {line("Fiscal profit (penghasilan neto fiskal)", cit.fiscalProfit, { bold: true })}
              {cit.lossCarryForward ? line("− Loss carried forward (max 5 years)", -cit.lossCarryForward) : null}
              {line("Taxable income (penghasilan kena pajak, rounded down to 1,000)", cit.taxableIncome, { bold: true })}
              {cit.taxLines.map((l, i) => line(l.label, l.amount, { sub: true, note: l.note, key: `tax-${i}` }))}
              {line("Corporate income tax (PPh Badan terutang)", cit.cit, { bold: true })}
              {line("− PPh 25 instalments paid", -cit.credits.pph25, { sub: true })}
              {line("− PPh 23 withheld by customers", -cit.credits.pph23, { sub: true })}
              {line("− PPh 22 prepaid", -cit.credits.pph22, { sub: true })}
              {line(cit.pph29 >= 0 ? "PPh 29 payable (kurang bayar) — pay before filing the SPT Badan" : "PPh 28A overpaid (lebih bayar) — refund / restitution", cit.pph29, { bold: true })}
              {line("Next year's PPh 25 monthly instalment = (CIT − PPh 23/22 credits) / 12", cit.nextPph25Monthly)}
            </tbody>
          </table>
          {cit.finalTax && (
            <div className="mt-4">
              <h3 className="mb-1 text-sm font-semibold">PPh final 0.5% on monthly turnover (PP 55/2022) · total {f(cit.finalTax.total)}</h3>
              <table className="table"><thead><tr><th>Period</th><th className="num">Turnover</th><th className="num">0.5%</th><th>Due</th></tr></thead>
                <tbody>{cit.finalTax.monthly.map((m) => <tr key={m.period}><td>{periodLabel(m.period)}</td><td className="num">{f(m.turnover)}</td><td className="num">{f(m.tax)}</td><td className="text-xs text-ink-500">15th of the following month</td></tr>)}</tbody></table>
              <p className="mt-1 text-xs text-ink-500">Cumulative turnover {f(cit.turnover)}: the 0.5% regime is only available while annual turnover stays under 4.8 bn and within the eligibility years (PT: 3 years, CV/firma: 4, individuals: 7).</p>
            </div>
          )}
        </Card>
      </div>
      <Card title="Adjustments (not stored)" className="no-print">
        <form method="get" className="space-y-3">
          <input type="hidden" name="year" value={year} />
          <Field label="Income subject to final tax / non-taxable (IDR)" hint="e.g. revenue already taxed under PPh 4(2) (villa rent), bank interest. The chart of accounts has no final-tax flag, so enter it here."><input name="nonTaxable" type="number" min={0} defaultValue={sp.nonTaxable} className="input" /></Field>
          <Field label="Other positive adjustments"><input name="otherPos" type="number" min={0} defaultValue={sp.otherPos} className="input" /></Field>
          <Field label="Other negative adjustments"><input name="otherNeg" type="number" min={0} defaultValue={sp.otherNeg} className="input" /></Field>
          <Field label="Loss carried forward"><input name="loss" type="number" min={0} defaultValue={sp.loss} className="input" /></Field>
          <Field label="Note"><input name="note" defaultValue={sp.note} className="input" /></Field>
          <button className="btn-primary">Recompute</button>
        </form>
        <p className="mt-3 text-xs text-ink-500">Non-deductible expenses come from accounts flagged non-deductible in the chart of accounts (fines, donations, CIT expense). Prepaid tax credits come from the accounts tagged PPh 25 / 23 / 22 prepaid. SPT Badan is due 30 April; the annual GMS approving the financial statements within six months of year end.</p>
      </Card>
    </div>
  );
}
