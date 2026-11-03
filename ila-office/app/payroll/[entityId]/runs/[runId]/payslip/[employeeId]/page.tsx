import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, periodLabel } from "@/lib/dates";
import { fmtIDR } from "@/lib/money";
import { employeeTotal, employerTotal, pphBorne, pphDeducted } from "@/lib/payroll";
import { PrintButton } from "@/components/client";
import { Cols } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PayslipPage({ params }: { params: Promise<{ entityId: string; runId: string; employeeId: string }> }) {
  await requireUser();
  const { entityId, runId, employeeId } = await params;
  const [entity, run, employee] = await Promise.all([db.get("entities", entityId), db.get("payroll_runs", runId), db.get("employees", employeeId)]);
  if (!entity || !run || run.entityId !== entityId) notFound();
  const line = run.lines.find((l) => l.employeeId === employeeId);
  if (!line) notFound();
  // Statement rows: bilingual label in the flexible column, amount right-aligned on one line; totals go in <tfoot>.
  const row = (id: string, en: string, value: number | string, opts: { bold?: boolean; neg?: boolean } = {}) => (
    <tr className={opts.bold ? "border-t border-slate-300 font-semibold" : ""}><td className="py-1 pr-4"><span>{id}</span><span className="ml-1 text-xs text-ink-500">/ {en}</span></td><td className="num py-1">{typeof value === "number" ? (opts.neg && value ? `(${fmtIDR(value)})` : fmtIDR(value)) : value}</td></tr>
  );
  return (
    <div className="pb-8">
      <div className="mb-3 flex items-center justify-between no-print"><Link href={`/payroll/${entityId}/runs/${runId}`} className="btn-ghost">‹ Run {periodLabel(run.period)}</Link><PrintButton label="Print payslip" /></div>
      <article className="mx-auto max-w-[210mm] rounded-xl border border-slate-200 bg-white p-10 text-sm print:border-0 print:p-0">
        <header className="mb-6 flex items-start justify-between border-b-2 border-ink-900 pb-4">
          <div><h1 className="text-xl font-bold">SLIP GAJI <span className="text-ink-500">/ PAYSLIP</span></h1><p className="text-ink-500">Periode / Period: <b className="text-ink-900">{periodLabel(run.period)}</b> · Tanggal bayar / Pay date: {fmtDate(run.payDate)}</p></div>
          <div className="text-right"><p className="font-bold">{entity.legalName}</p><p className="text-xs text-ink-500">{[entity.address, entity.city].filter(Boolean).join(", ")}</p><p className="text-xs text-ink-500">NPWP {entity.npwp ?? "—"}</p></div>
        </header>
        <section className="mb-6 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <p><span className="text-ink-500">Nama / Name:</span> <b>{line.employeeName}</b></p><p><span className="text-ink-500">Jabatan / Position:</span> {employee?.position ?? "—"}</p>
          <p><span className="text-ink-500">NIK / NPWP:</span> {employee?.nik ?? "—"} / {employee?.npwp ?? "tidak ber-NPWP (no NPWP)"}</p><p><span className="text-ink-500">Status PTKP:</span> {line.ptkpStatus}</p>
          <p><span className="text-ink-500">Bank:</span> {employee?.bankName ?? "—"} {employee?.bankAccountNumber ?? ""}</p><p><span className="text-ink-500">Tanggal masuk / Join date:</span> {fmtDate(employee?.joinDate)}</p>
        </section>
        <div className="grid grid-cols-2 gap-8">
          <table className="w-full table-fixed"><Cols widths={[undefined, 120]} /><thead><tr><th colSpan={2} className="border-b border-slate-300 py-1 text-left text-xs font-semibold uppercase tracking-wide text-ink-700">Penghasilan / Earnings</th></tr></thead>
            <tbody>
              {row("Gaji pokok", "Basic salary", line.basicSalary)}
              {row("Tunjangan", "Allowances", line.allowances)}
              {(line.bpjsAllowance ?? 0) > 0 && row("Tunjangan BPJS", "BPJS allowance", line.bpjsAllowance ?? 0)}
              {(line.taxAllowance ?? 0) > 0 && row("Tunjangan PPh 21", "Tax allowance", line.taxAllowance ?? 0)}
              {row("Lembur", "Overtime", line.overtime)}
              {row("Bonus / THR", "Bonus", line.bonus)}
            </tbody>
            <tfoot>{row("Total penghasilan bruto", "Gross earnings", line.gross, { bold: true })}</tfoot></table>
          <table className="w-full table-fixed"><Cols widths={[undefined, 120]} /><thead><tr><th colSpan={2} className="border-b border-slate-300 py-1 text-left text-xs font-semibold uppercase tracking-wide text-ink-700">Potongan / Deductions</th></tr></thead>
            <tbody>
              {row("BPJS Kesehatan (1%)", "Health insurance", line.employee.bpjsKesehatan, { neg: true })}
              {row("BPJS JHT (2%)", "Old-age savings", line.employee.jht, { neg: true })}
              {row("BPJS JP (1%)", "Pension", line.employee.jp, { neg: true })}
              {row(`PPh 21 (${line.pph21.method === "ter" ? `TER ${line.pph21.terCategory} ${((line.pph21.rate ?? 0) * 100).toFixed(2)}%` : "perhitungan tahunan"})${pphBorne(line) !== 0 ? " · ditanggung perusahaan" : ""}`, line.pph21.method === "ter" ? "Income tax" : "Annual true-up", pphDeducted(line), { neg: true })}
              {row("Potongan lain", "Other deductions", line.otherDeductions, { neg: true })}
            </tbody>
            <tfoot>{row("Total potongan", "Total deductions", employeeTotal(line) + pphDeducted(line) + line.otherDeductions, { bold: true, neg: true })}</tfoot></table>
        </div>
        <div className="mt-6 flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3 text-lg font-bold"><span>GAJI BERSIH / NET PAY</span><span className="tabular-nums">{fmtIDR(line.netPay)}</span></div>
        <section className="mt-6">
          <table className="w-full table-fixed text-xs"><Cols widths={[undefined, 150]} /><thead><tr><th colSpan={2} className="border-b border-slate-300 py-1 text-left font-semibold uppercase tracking-wide text-ink-700">Iuran pemberi kerja (informasi) / Employer contributions (information only)</th></tr></thead>
            <tbody>
              {row("BPJS Kesehatan (4%)", "Health insurance", line.employer.bpjsKesehatan)}
              {row("BPJS JHT (3,7%)", "Old-age savings", line.employer.jht)}
              {row("BPJS JP (2%)", "Pension", line.employer.jp)}
              {row("BPJS JKK", "Work accident", line.employer.jkk)}
              {row("BPJS JKM (0,3%)", "Death benefit", line.employer.jkm)}
              {pphBorne(line) !== 0 && row("PPh 21 ditanggung perusahaan", "Income tax borne by employer", pphBorne(line))}
            </tbody>
            <tfoot>{row("Total iuran pemberi kerja", "Total employer contributions", employerTotal(line) + pphBorne(line), { bold: true })}</tfoot></table>
        </section>
        {line.notes && <p className="mt-4 text-xs text-ink-500">Catatan / Notes: {line.notes}</p>}
        <footer className="mt-10 grid grid-cols-2 gap-8 text-center text-xs">
          <div><p className="mb-12">Diterima oleh / Received by</p><p className="border-t border-ink-900 pt-1">{line.employeeName}</p></div>
          <div><p className="mb-12">Pemberi kerja / Employer</p><p className="border-t border-ink-900 pt-1">{entity.legalName}</p></div>
        </footer>
        <p className="mt-6 text-[10px] text-ink-500">PPh 21 dihitung dengan tarif efektif rata-rata (PP 58/2023) untuk Januari–November dan tarif Pasal 17 UU PPh untuk Desember. Dokumen ini dibuat secara otomatis oleh ILA Office. / PPh 21 uses the monthly effective rate (PP 58/2023) January–November and the art. 17 progressive rates in December.{line.taxMethod === "nett" ? " PPh 21 ditanggung oleh pemberi kerja. / PPh 21 is borne by the employer." : line.taxMethod === "grossup" ? " PPh 21 dihitung dengan metode gross-up: tunjangan PPh 21 termasuk penghasilan kena pajak. / Gross-up method: the tax allowance is part of taxable income." : ""}</p>
      </article>
    </div>
  );
}
