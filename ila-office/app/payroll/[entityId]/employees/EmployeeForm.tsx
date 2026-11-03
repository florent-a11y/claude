import { PAYROLL_TAX_METHODS, PAYROLL_TAX_METHOD_LABELS, PTKP_STATUSES, type Employee } from "@/lib/types";
import { PTKP_TABLE, BPJS_JKK_RATES } from "@/lib/tax/constants";
import { Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { MoneyInput } from "@/components/MoneyInput";

export function EmployeeForm({ employee: e, action }: { employee?: Employee; action: (fd: FormData) => Promise<void> }) {
  const allowances = [0, 1, 2, 3].map((i) => e?.allowances[i]);
  const deductions = [0, 1, 2].map((i) => e?.deductions[i]);
  return (
    <form action={action} className="grid gap-4 lg:grid-cols-3">
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Identity</h2>
        <Field label="Full name"><input name="name" defaultValue={e?.name} required className="input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Position"><input name="position" defaultValue={e?.position} className="input" /></Field>
          <Field label="Email"><input name="email" type="email" defaultValue={e?.email} className="input" /></Field>
          <Field label="NIK (KTP)"><input name="nik" defaultValue={e?.nik} className="input" /></Field>
          <Field label="NPWP" hint="Empty → PPh 21 at 120%."><input name="npwp" defaultValue={e?.npwp} className="input" placeholder="00.000.000.0-000.000" /></Field>
          <Field label="PTKP status"><Select name="ptkpStatus" defaultValue={e?.ptkpStatus ?? "TK/0"} options={PTKP_STATUSES.map((s) => ({ value: s, label: `${s} · ${PTKP_TABLE[s].toLocaleString("en-US")}` }))} /></Field>
          <Field label="Passport (foreigners)"><input name="passportNumber" defaultValue={e?.passportNumber} className="input" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isForeign" defaultChecked={e?.isForeign} className="checkbox" /> Foreign employee (TKA; counts as foreign headcount in LKPM)</label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Join date"><input name="joinDate" type="date" defaultValue={e?.joinDate} required className="input" /></Field>
          <Field label="End date" hint="Termination month triggers the annual PPh 21 true-up."><input name="endDate" type="date" defaultValue={e?.endDate} className="input" /></Field>
          <Field label="Contract"><Select name="contractType" defaultValue={e?.contractType ?? "pkwtt"} options={[{ value: "pkwtt", label: "PKWTT (permanent)" }, { value: "pkwt", label: "PKWT (fixed term)" }, { value: "freelance", label: "Freelance" }]} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={e?.active ?? true} className="checkbox" /> Active</label>
        </div>
      </div>
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Pay</h2>
        <Field label="Basic salary (IDR / month)"><MoneyInput name="basicSalary" defaultValue={e?.basicSalary} currency="IDR" required placeholder="" /></Field>
        <Field label="PPh 21 method" hint="Gross: deducted from pay. Nett: company pays the tax on top (non-deductible expense). Gross-up: company adds a taxable tax allowance so net pay stays as agreed."><Select name="taxMethod" defaultValue={e?.taxMethod ?? "gross"} options={PAYROLL_TAX_METHODS.map((m) => ({ value: m, label: PAYROLL_TAX_METHOD_LABELS[m] }))} /></Field>
        <p className="label">Employee BPJS share paid by the company</p><p className="-mt-1 mb-1 text-xs text-ink-500">Added as a taxable allowance; the deduction still appears, so take-home pay is unchanged.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <label className="flex items-center gap-1"><input type="checkbox" name="cover_kesehatan" defaultChecked={e?.bpjsAllowance?.kesehatan} className="checkbox" /> Kesehatan 1%</label>
          <label className="flex items-center gap-1"><input type="checkbox" name="cover_jht" defaultChecked={e?.bpjsAllowance?.jht} className="checkbox" /> JHT 2%</label>
          <label className="flex items-center gap-1"><input type="checkbox" name="cover_jp" defaultChecked={e?.bpjsAllowance?.jp} className="checkbox" /> JP 1%</label>
        </div>
        <p className="label">Fixed allowances</p><p className="-mt-1 mb-2 text-xs text-ink-500">Part of the BPJS wage; tick taxable for PPh 21.</p>
        {allowances.map((a, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <input name={`allowance_name_${i + 1}`} defaultValue={a?.name} placeholder={["Transport", "Meal", "Housing", "Other"][i]} className="input" />
            <MoneyInput name={`allowance_amount_${i + 1}`} defaultValue={a?.amount} currency="IDR" aria-label={`Allowance ${i + 1} amount`} />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name={`allowance_taxable_${i + 1}`} defaultChecked={a ? a.taxable : true} className="checkbox" /> taxable</label>
          </div>
        ))}
        <p className="label">Fixed deductions (loan repayments, advances)</p>
        {deductions.map((d, i) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <input name={`deduction_name_${i + 1}`} defaultValue={d?.name} placeholder="Loan" className="input" />
            <MoneyInput name={`deduction_amount_${i + 1}`} defaultValue={d?.amount} currency="IDR" aria-label={`Deduction ${i + 1} amount`} />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bank"><input name="bankName" defaultValue={e?.bankName} className="input" /></Field>
          <Field label="Account number"><input name="bankAccountNumber" defaultValue={e?.bankAccountNumber} className="input" /></Field>
        </div>
      </div>
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">BPJS</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="BPJS Kesehatan no."><input name="bpjsKesehatanNumber" defaultValue={e?.bpjsKesehatanNumber} className="input" /></Field>
          <Field label="BPJS Ketenagakerjaan no."><input name="bpjsKetenagakerjaanNumber" defaultValue={e?.bpjsKetenagakerjaanNumber} className="input" /></Field>
        </div>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="bpjs_kesehatan" defaultChecked={e?.bpjs.kesehatan ?? true} className="checkbox" /> Kesehatan 5% (4% employer + 1% employee, wage capped at 12 M)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="bpjs_jht" defaultChecked={e?.bpjs.jht ?? true} className="checkbox" /> JHT 5.7% (3.7% + 2%)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="bpjs_jp" defaultChecked={e?.bpjs.jp ?? true} className="checkbox" /> JP 3% (2% + 1%, wage capped)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="bpjs_jkk" defaultChecked={e?.bpjs.jkk ?? true} className="checkbox" /> JKK (employer, by risk class)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="bpjs_jkm" defaultChecked={e?.bpjs.jkm ?? true} className="checkbox" /> JKM 0.3% (employer)</label>
        </div>
        <Field label="BPJS wage base (IDR / month, optional)" hint="Fixed wage reported to BPJS when the actual salary fluctuates. Empty = basic salary + fixed allowances."><MoneyInput name="bpjsWageBase" defaultValue={e?.bpjsWageBase} currency="IDR" placeholder="" /></Field>
        <Field label="JKK risk class"><Select name="jkkRiskClass" defaultValue={String(e?.bpjs.jkkRiskClass ?? 1)} options={([1, 2, 3, 4, 5] as const).map((c) => ({ value: String(c), label: `Class ${c} · ${(BPJS_JKK_RATES[c] * 100).toFixed(2)}%` }))} /></Field>
        <p className="text-xs text-ink-500">Foreign employees on a KITAS of 6+ months must join BPJS Kesehatan and Ketenagakerjaan (JKK, JKM, JHT); JP is optional for them.</p>
        <SubmitButton>{e ? "Save employee" : "Add employee"}</SubmitButton>
      </div>
    </form>
  );
}
