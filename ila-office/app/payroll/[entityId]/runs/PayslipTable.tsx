import Link from "next/link";
import type { PayslipLine, PayrollRun } from "@/lib/types";
import type { LineOverride } from "@/lib/payroll";
import { employeeTotal, employerTotal } from "@/lib/payroll";
import { CardTable, Cols } from "@/components/ui";
import { MoneyInput } from "@/components/MoneyInput";

/** Server-safe payslip table used by the preview, the draft editor and the run detail.
 *  Renders edge to edge inside the enclosing Card, with the remittance summary as a line under the table. */
export function PayslipTable({ lines, totals, editable = false, overrides = {}, entityId, runId }: { lines: PayslipLine[]; totals: PayrollRun["totals"]; editable?: boolean; overrides?: Record<string, LineOverride>; entityId: string; runId?: string }) {
  const f = (n: number) => n.toLocaleString("en-US");
  const pphNote = (l: PayslipLine) => (l.pph21.method === "ter" ? `${l.pph21.terCategory} ${((l.pph21.rate ?? 0) * 100).toFixed(2)}%` : "annual");
  // Read-only tables drop the optional columns that are zero on every line so a run fits the page without scrolling; the editor keeps its inputs.
  const showOvertime = editable || lines.some((l) => l.overtime !== 0);
  const showBonus = editable || lines.some((l) => l.bonus !== 0);
  const showOther = lines.some((l) => l.otherDeductions !== 0);
  const otherTotal = lines.reduce((s, l) => s + l.otherDeductions, 0);
  const optional = editable ? 120 : 100;
  const widths: Array<number | undefined> = [undefined, 100, 100, ...(showOvertime ? [optional] : []), ...(showBonus ? [optional] : []), 110, 128, 128, 110, ...(showOther ? [100] : []), 112, ...(runId ? [70] : [])];
  const minWidth = widths.reduce<number>((s, w) => s + (w ?? 180), 0);
  const leading = 3 + (showOvertime ? 1 : 0) + (showBonus ? 1 : 0); // columns before Gross, spanned by the totals label
  return (
    <>
      <CardTable bottom={false}>
        <table className="table table-data" style={{ minWidth }}>
          <Cols widths={widths} />
          <thead>
            <tr><th>Employee</th><th className="num">Basic</th><th className="num">Allow.</th>{showOvertime && <th className="num">Overtime</th>}{showBonus && <th className="num">Bonus</th>}<th className="num">Gross</th><th className="num">BPJS employer</th><th className="num">BPJS employee</th><th className="num">PPh 21</th>{showOther && <th className="num">Other ded.</th>}<th className="num">Net pay</th>{runId && <th></th>}</tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.employeeId}>
                <td>
                  <span className="cell-primary" title={l.employeeName}>{l.employeeName}</span>
                  {editable ? (
                    <span className="mt-1 flex items-center gap-2">
                      <span className="shrink-0 text-xs text-ink-500">{l.ptkpStatus}</span>
                      <input name={`notes_${l.employeeId}`} defaultValue={overrides[l.employeeId]?.notes ?? ""} placeholder="note" className="input min-w-0 !w-full !px-2 !py-1 !text-xs" />
                    </span>
                  ) : (
                    <span className="cell-sub" title={l.notes ? `${l.ptkpStatus} · ${l.notes}` : l.ptkpStatus}>{l.ptkpStatus}{l.notes && <> · {l.notes}</>}</span>
                  )}
                </td>
                <td className="num">{f(l.basicSalary)}</td>
                <td className="num">{f(l.allowances)}</td>
                {showOvertime && <td className="num">{editable ? <MoneyInput name={`ot_${l.employeeId}`} defaultValue={l.overtime || ""} currency="IDR" className="input !w-24 !px-2 !py-1" aria-label={`Overtime ${l.employeeName}`} /> : f(l.overtime)}</td>}
                {showBonus && <td className="num">{editable ? <MoneyInput name={`bonus_${l.employeeId}`} defaultValue={l.bonus || ""} currency="IDR" className="input !w-24 !px-2 !py-1" aria-label={`Bonus ${l.employeeName}`} /> : f(l.bonus)}</td>}
                <td className="num font-semibold">{f(l.gross)}</td>
                <td className="num" title={`Kesehatan ${f(l.employer.bpjsKesehatan)} · JHT ${f(l.employer.jht)} · JP ${f(l.employer.jp)} · JKK ${f(l.employer.jkk)} · JKM ${f(l.employer.jkm)}`}>{f(employerTotal(l))}</td>
                <td className="num" title={`Kesehatan ${f(l.employee.bpjsKesehatan)} · JHT ${f(l.employee.jht)} · JP ${f(l.employee.jp)}`}>{f(employeeTotal(l))}</td>
                <td className={`num ${l.pph21.amount < 0 ? "text-red-700" : ""}`} title={l.pph21.method === "ter" ? `TER ${l.pph21.terCategory} ${((l.pph21.rate ?? 0) * 100).toFixed(2)}% on ${f(l.pph21.base)}` : `Annual true-up on taxable income ${f(l.pph21.base)}`}>
                  {f(l.pph21.amount)}
                  <span className="cell-sub">{pphNote(l)}</span>
                </td>
                {showOther && <td className="num">{f(l.otherDeductions)}</td>}
                <td className="num font-semibold">{f(l.netPay)}</td>
                {runId && <td className="text-right text-xs"><Link href={`/payroll/${entityId}/runs/${runId}/payslip/${l.employeeId}`} className="text-brand-600 hover:underline">payslip</Link></td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={leading}>Totals · {lines.length} employees</td><td className="num">{f(totals.gross)}</td><td className="num">{f(totals.employerBpjs)}</td><td className="num">{f(totals.employeeBpjs)}</td><td className="num">{f(totals.pph21)}</td>{showOther && <td className="num">{f(otherTotal)}</td>}<td className="num">{f(totals.netPay)}</td>{runId && <td />}</tr>
          </tfoot>
        </table>
      </CardTable>
      <p className="text-xs text-ink-500">Cost to company (gross + employer BPJS): <b className="text-ink-900">{f(totals.costToCompany)}</b> · BPJS to remit (employer + employee): {f(totals.employerBpjs + totals.employeeBpjs)} · PPh 21 to remit: {f(totals.pph21)}</p>
    </>
  );
}
