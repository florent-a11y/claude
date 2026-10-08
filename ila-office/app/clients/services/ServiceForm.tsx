import { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS, type ServiceItem } from "@/lib/types";
import { Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const CADENCES = [{ value: "none", label: "One-off" }, { value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }, { value: "annual", label: "Annual" }, { value: "biennial", label: "Every 2 years" }];
export const CADENCE_LABELS: Record<string, string> = Object.fromEntries(CADENCES.map((c) => [c.value, c.label]));
export const UNITS = ["each", "per year", "per month", "per quarter", "per person", "per agreement", "per class", "per hour"];

export function ServiceForm({ service, action }: { service?: ServiceItem; action: (fd: FormData) => Promise<void> }) {
  const s = service;
  return (
    <form action={action} className="grid max-w-4xl gap-4 md:grid-cols-[2fr_1fr]">
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Service</h2>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Field label="Code" hint={s ? "Codes are fixed once created." : "Upper-case letters, digits and dashes."}>
            {s ? <input value={s.code} readOnly className="input bg-slate-50 font-mono text-ink-500" /> : <input name="code" required className="input font-mono uppercase" placeholder="VISA-NEW" pattern="[A-Za-z0-9-]{2,30}" />}
          </Field>
          <Field label="Category"><Select name="category" defaultValue={s?.category ?? "visa"} options={SERVICE_CATEGORIES.map((c) => ({ value: c, label: SERVICE_CATEGORY_LABELS[c] }))} /></Field>
        </div>
        <Field label="Name" hint="As it appears on quotes and invoice lines."><input name="name" defaultValue={s?.name} required className="input" placeholder="Investor KITAS E28A (2 years)" /></Field>
        <Field label="Description"><textarea name="description" rows={3} defaultValue={s?.description} className="input" placeholder="What is included, prerequisites, turnaround…" /></Field>
        <Field label="Includes note" hint="Third-party cost embedded in the price, shown under the name."><input name="includesNote" defaultValue={s?.includesNote} className="input" placeholder="USD 1,200 DKP-TKA included" /></Field>
      </div>
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Pricing & billing</h2>
        <Field label="Unit"><input name="unit" defaultValue={s?.unit ?? "each"} list="units" className="input" /></Field>
        <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        <Field label="List price (IDR)"><input name="priceIDR" type="number" min={0} step={1} defaultValue={s?.priceIDR ?? 0} required className="input num" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quoted in USD"><input name="priceUSD" type="number" min={0} step="0.01" defaultValue={s?.priceUSD ?? ""} className="input num" /></Field>
          <Field label="Quoted in EUR"><input name="priceEUR" type="number" min={0} step="0.01" defaultValue={s?.priceEUR ?? ""} className="input num" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Billing"><Select name="cadence" defaultValue={s?.cadence ?? "none"} options={CADENCES} /></Field>
          <Field label="Renew after (months)"><input name="renewalMonths" type="number" min={0} max={120} defaultValue={s?.renewalMonths ?? ""} className="input num" placeholder="—" /></Field>
        </div>
        <Field label="Tax treatment"><Select name="taxTreatment" defaultValue={s?.taxTreatment ?? "out_of_scope"} options={[{ value: "out_of_scope", label: "Out of scope (no PPN)" }, { value: "ppn", label: "PPN" }]} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={s?.active ?? true} className="checkbox" /> Active (shown on the price list and in quotes)</label>
        <div className="pt-1"><SubmitButton>{s ? "Save service" : "Add service"}</SubmitButton></div>
      </div>
    </form>
  );
}
