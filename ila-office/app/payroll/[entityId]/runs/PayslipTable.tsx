import Link from "next/link";
import type { PayslipLine, PayrollRun } from "@/lib/types";
import type { LineOverride } from "@/lib/payroll";
import { employeeTotal, employerTotal } from "@/lib/payroll";

/** Server-safe payslip table used by the preview, the draft editor and the run detail. */
export function PayslipTable({ lines, totals, editable = false, overrides = {}, entityId, runId }: { lines: PayslipLine[]; totals: PayrollRun["totals"]; editable?: boolean; overrides?: Record<string, LineOverride>; entityId: string; runId?: string }) {
  const f = (n: number) => n.toLocaleString("en-US");
  return (
    <div className="overflow-x-auto">
      <table className="table text-xs">
        <thead>
          <tr><th>Employee</th><th>PTKP</th><th className="num">Basic</th><th className="num">Allow.</th><th className="num">Overtime</th><th className="num">Bonus</th><th className="num">Gross</th><th className="num">BPJS employer</th><th className="num">BPJS employee</th><th className="num">PPh 21</th><th className="num">Other ded.</th><th className="num">Net pay</th>{runId && <th></th>}</tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.employeeId}>
              <td className="font-medium">{l.employeeName}{l.notes && <p className="font-normal text-ink-500">{l.notes}</p>}{editable && <input name={`notes_${l.employeeId}`} defaultValue={overrides[l.employeeId]?.notes ?? ""} placeholder="note" className="input mt-1 !px-2 !py-0.5 !text-[11px]" />}</td>
              <td>{l.ptkpStatus}</td>
              <td className="num">{f(l.basicSalary)}</td>
              <td className="num">{f(l.allowances)}</td>
              <td className="num">{editable ? <input name={`ot_${l.employeeId}`} type="number" min={0} defaultValue={l.overtime || ""} className="input !w-28 !px-2 !py-0.5 text-right" /> : f(l.overtime)}</td>
              <td className="num">{editable ? <input name={`bonus_${l.employeeId}`} type="number" min={0} defaultValue={l.bonus || ""} className="input !w-28 !px-2 !py-0.5 text-right" /> : f(l.bonus)}</td>
              <td className="num font-semibold">{f(l.gross)}</td>
              <td className="num" title={`Kesehatan ${f(l.employer.bpjsKesehatan)} · JHT ${f(l.employer.jht)} · JP ${f(l.employer.jp)} · JKK ${f(l.employer.jkk)} · JKM ${f(l.employer.jkm)}`}>{f(employerTotal(l))}</td>
              <td className="num" title={`Kesehatan ${f(l.employee.bpjsKesehatan)} · JHT ${f(l.employee.jht)} · JP ${f(l.employee.jp)}`}>{f(employeeTotal(l))}</td>
              <td className={`num ${l.pph21.amount < 0 ? "text-red-700" : ""}`} title={l.pph21.method === "ter" ? `TER ${l.pph21.terCategory} ${((l.pph21.rate ?? 0) * 100).toFixed(2)}% on ${f(l.pph21.base)}` : `Annual true-up on taxable income ${f(l.pph21.base)}`}>{f(l.pph21.amount)}<span className="ml-1 text-[10px] text-ink-500">{l.pph21.method === "ter" ? `${l.pph21.terCategory} ${((l.pph21.rate ?? 0) * 100).toFixed(2)}%` : "annual"}</span></td>
              <td className="num">{f(l.otherDeductions)}</td>
              <td className="num font-semibold">{f(l.netPay)}</td>
              {runId && <td><Link href={`/payroll/${entityId}/runs/${runId}/payslip/${l.employeeId}`} className="text-brand-600 underline">payslip</Link></td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold"><td colSpan={6}>Totals · {lines.length} employees</td><td className="num">{f(totals.gross)}</td><td className="num">{f(totals.employerBpjs)}</td><td className="num">{f(totals.employeeBpjs)}</td><td className="num">{f(totals.pph21)}</td><td className="num">{f(lines.reduce((s, l) => s + l.otherDeductions, 0))}</td><td className="num">{f(totals.netPay)}</td>{runId && <td />}</tr>
          <tr className="text-ink-500"><td colSpan={12}>Cost to company (gross + employer BPJS): <b className="text-ink-900">{f(totals.costToCompany)}</b> · BPJS to remit (employer + employee): {f(totals.employerBpjs + totals.employeeBpjs)} · PPh 21 to remit: {f(totals.pph21)}</td>{runId && <td />}</tr>
        </tfoot>
      </table>
    </div>
  );
}
