import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayISO } from "@/lib/dates";
import { PTKP_STATUSES, type PtkpStatus } from "@/lib/types";
import { PTKP_TABLE, TER_CATEGORY, TER_TABLES, BIAYA_JABATAN_MAX_ANNUAL } from "@/lib/tax/constants";
import { pph21Annual, pph21Monthly } from "@/lib/tax/pph21";
import { payrollRunsOfYear } from "@/lib/tax/services";
import { Card, Field, Select, Money, DL, Chips, Notice, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Pph21Page({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await db.get("entities", entityId);
  if (!entity) notFound();
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : Number(todayISO().slice(0, 4));
  const gross = Number(sp.gross ?? 10_000_000) || 0;
  const ptkp = (PTKP_STATUSES as readonly string[]).includes(sp.ptkp ?? "") ? (sp.ptkp as PtkpStatus) : "TK/0";
  const hasNpwp = sp.npwp !== "no";
  const monthly = pph21Monthly({ grossMonthly: gross, ptkpStatus: ptkp, hasNpwp });
  const projection = pph21Annual({ grossAnnual: gross * 12, ptkpStatus: ptkp, hasNpwp, employeeJhtJp: 0, months: 12, withheldToDate: monthly.amount * 11 });
  const runs = entity.tax.payroll ? await payrollRunsOfYear(entityId, year) : [];
  const employees = new Map<string, { name: string; ptkp: PtkpStatus; hasNpwp: boolean; months: number; gross: number; jhtJp: number; withheldTer: number; decemberLine?: number }>();
  const employeeRecords = runs.length ? await db.list("employees", { where: { entityId } }) : [];
  const npwpOf = new Map(employeeRecords.map((e) => [e.id, Boolean(e.npwp)]));
  for (const r of runs) for (const l of r.lines) {
    const e = employees.get(l.employeeId) ?? { name: l.employeeName, ptkp: l.ptkpStatus, hasNpwp: npwpOf.get(l.employeeId) ?? true, months: 0, gross: 0, jhtJp: 0, withheldTer: 0 };
    e.months += 1;
    e.gross += l.pph21.method === "ter" ? l.pph21.base : l.gross + l.employer.bpjsKesehatan + l.employer.jkk + l.employer.jkm;
    e.jhtJp += l.employee.jht + l.employee.jp;
    if (l.pph21.method === "ter") e.withheldTer += l.pph21.amount; else e.decemberLine = l.pph21.amount;
    employees.set(l.employeeId, e);
  }
  const trueUp = [...employees.entries()].map(([id, e]) => ({ id, ...e, annual: pph21Annual({ grossAnnual: e.gross, ptkpStatus: e.ptkp, hasNpwp: e.hasNpwp, employeeJhtJp: e.jhtJp, months: e.months, withheldToDate: e.withheldTer }) })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="grid gap-4 pb-8 lg:grid-cols-3">
      <Card title="PPh 21 calculator (TER, PP 58/2023)" className="lg:col-span-1">
        <form method="get" className="space-y-3">
          <Field label="Monthly gross (salary + taxable allowances + employer BPJS Kesehatan/JKK/JKM)"><input name="gross" type="number" min={0} step={1000} defaultValue={gross} className="input" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="PTKP status"><Select name="ptkp" defaultValue={ptkp} options={PTKP_STATUSES.map((s) => ({ value: s, label: `${s} · ${PTKP_TABLE[s].toLocaleString("en-US")}` }))} /></Field>
            <Field label="NPWP"><Select name="npwp" defaultValue={hasNpwp ? "yes" : "no"} options={[{ value: "yes", label: "Has NPWP" }, { value: "no", label: "No NPWP (+20%)" }]} /></Field>
          </div>
          <input type="hidden" name="year" value={year} />
          <button className="btn-primary">Calculate</button>
        </form>
        <div className="mt-4 space-y-3">
          <DL items={[
            ["TER category", <b key="c">{monthly.category}</b>], ["Effective rate", `${(monthly.rate * 100).toFixed(2)}%`], ["Base (rounded down)", <Money key="b" amount={monthly.base} />],
            ["Monthly PPh 21", <b key="m"><Money amount={monthly.amount} /></b>], ...(monthly.surcharge ? [["of which no-NPWP surcharge", <Money key="s" amount={monthly.surcharge} />] as [string, React.ReactNode]] : []),
          ]} />
          <p className="text-xs font-semibold text-ink-700">Annual projection at this gross × 12 (December true-up)</p>
          <DL items={[
            ["Gross annual", <Money key="g" amount={projection.grossAnnual} />], ["Biaya jabatan (5%, max 6 M)", <Money key="bj" amount={-projection.biayaJabatan} />], ["PTKP", <Money key="p" amount={-projection.ptkp} />],
            ["Taxable income (PKP)", <Money key="t" amount={projection.taxableIncome} />], ["Annual tax (art. 17)", <Money key="a" amount={projection.annualTax} />],
            ["Withheld Jan–Nov (TER)", <Money key="w" amount={-projection.withheldToDate} />], ["December withholding", <b key="d"><Money amount={projection.due} /></b>],
          ]} />
          <details className="text-xs text-ink-500"><summary className="cursor-pointer">Progressive steps</summary>
            <ul className="mt-1 list-disc pl-4">{projection.steps.map((s, i) => <li key={i}>{s.base.toLocaleString("en-US")} × {(s.rate * 100).toFixed(0)}% = {s.tax.toLocaleString("en-US")}</li>)}</ul>
          </details>
        </div>
      </Card>

      <div className="space-y-4 lg:col-span-2">
        <Card title={`Annual true-up ${year} from payroll runs`} actions={<Chips items={[year - 1, year].map((y) => ({ href: `/tax/${entityId}/pph21?year=${y}&gross=${gross}&ptkp=${encodeURIComponent(ptkp)}&npwp=${hasNpwp ? "yes" : "no"}`, label: String(y), active: y === year }))} />}>
          {!entity.tax.payroll ? <Notice tone="blue">This entity has no payroll flag. Enable it in Settings to run payroll and track PPh 21.</Notice> : trueUp.length === 0 ? (
            <EmptyState title={`No payroll run in ${year}`} hint="Create runs in the Payroll module; the true-up compares the annual progressive tax with the TER amounts withheld." action={<Link href={`/payroll/${entityId}`} className="btn-secondary">Open payroll</Link>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Employee</th><th>PTKP</th><th className="num">Months</th><th className="num">Gross YTD</th><th className="num">Biaya jabatan</th><th className="num">JHT+JP (emp.)</th><th className="num">PKP</th><th className="num">Annual tax</th><th className="num">Withheld (TER)</th><th className="num">Due Dec</th><th className="num">In Dec run</th></tr></thead>
                <tbody>
                  {trueUp.map((e) => (
                    <tr key={e.id}>
                      <td className="font-medium">{e.name}{!e.hasNpwp && <span className="ml-1 text-[10px] text-red-700">no NPWP</span>}</td>
                      <td className="text-xs">{e.ptkp}</td>
                      <td className="num">{e.months}</td>
                      <td className="num">{e.gross.toLocaleString("en-US")}</td>
                      <td className="num">{e.annual.biayaJabatan.toLocaleString("en-US")}</td>
                      <td className="num">{e.jhtJp.toLocaleString("en-US")}</td>
                      <td className="num">{e.annual.taxableIncome.toLocaleString("en-US")}</td>
                      <td className="num">{e.annual.annualTax.toLocaleString("en-US")}</td>
                      <td className="num">{e.withheldTer.toLocaleString("en-US")}</td>
                      <td className={`num font-semibold ${e.annual.due < 0 ? "text-red-700" : ""}`}>{e.annual.due.toLocaleString("en-US")}</td>
                      <td className="num">{e.decemberLine === undefined ? "—" : e.decemberLine.toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ink-500">Gross YTD = TER bases of the months run so far. A negative "Due Dec" means the TER withholding exceeded the annual tax: refund the difference to the employee in December. Biaya jabatan capped at {BIAYA_JABATAN_MAX_ANNUAL.toLocaleString("en-US")}/year.</p>
            </div>
          )}
        </Card>
        <Card title="TER tables (monthly effective rates)">
          <div className="grid gap-3 text-xs md:grid-cols-3">
            {(["A", "B", "C"] as const).map((c) => (
              <div key={c}>
                <p className="mb-1 font-semibold">Category {c} · {Object.entries(TER_CATEGORY).filter(([, v]) => v === c).map(([k]) => k).join(", ")}</p>
                <div className="max-h-64 overflow-y-auto rounded border border-slate-200">
                  <table className="table"><tbody>{TER_TABLES[c].map(([upper, rate], i) => <tr key={i}><td className="num !py-0.5">{upper === Infinity ? "above" : `≤ ${upper.toLocaleString("en-US")}`}</td><td className="num !py-0.5">{(rate * 100).toFixed(2)}%</td></tr>)}</tbody></table>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
