import { ENTITY_TYPES, ENTITY_TYPE_LABELS, REGIONS, TAX_REGIME_LABELS, type Company, type Entity } from "@/lib/types";
import { Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export function EntityForm({ entity, companies, action }: { entity?: Entity; companies: Company[]; action: (fd: FormData) => Promise<void> }) {
  const e = entity;
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Identity</h2>
        <Field label="Short name"><input name="name" defaultValue={e?.name} required className="input" placeholder="PT Example Bali" /></Field>
        <Field label="Legal name"><input name="legalName" defaultValue={e?.legalName} className="input" placeholder="PT EXAMPLE BALI INVESTAMA" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Select name="type" defaultValue={e?.type ?? "pt_pma"} options={ENTITY_TYPES.map((t) => ({ value: t, label: ENTITY_TYPE_LABELS[t] }))} /></Field>
          <Field label="Country (ISO-2)"><input name="country" defaultValue={e?.country ?? "ID"} maxLength={2} className="input" /></Field>
          <Field label="Region"><Select name="region" defaultValue={e?.region ?? "Bali"} options={[...REGIONS]} /></Field>
          <Field label="City"><input name="city" defaultValue={e?.city} className="input" /></Field>
          <Field label="NPWP"><input name="npwp" defaultValue={e?.npwp} className="input" placeholder="00.000.000.0-000.000" /></Field>
          <Field label="NIB"><input name="nib" defaultValue={e?.nib} className="input" /></Field>
        </div>
        <Field label="Deed (akta) number"><input name="aktaNumber" defaultValue={e?.aktaNumber} className="input" /></Field>
        <Field label="Address"><textarea name="address" defaultValue={e?.address} rows={2} className="input" /></Field>
        <Field label="Drive folder URL" hint="Client workdrive where reports are stored."><input name="driveFolderUrl" defaultValue={e?.driveFolderUrl} className="input" type="url" /></Field>
        <Field label="CRM company" hint="Links these books to the client record."><Select name="crmCompanyId" defaultValue={e?.crmCompanyId ?? ""} options={[{ value: "", label: "— none —" }, ...companies.map((c) => ({ value: c.id, label: c.name }))]} /></Field>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="isOwn" defaultChecked={e?.isOwn} className="checkbox" /> ILA's own books</label>
          <Field label="Status"><Select name="status" defaultValue={e?.status ?? "active"} options={["active", "dormant", "closed"]} /></Field>
        </div>
      </div>
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Books & tax profile</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Base currency"><input name="baseCurrency" defaultValue={e?.baseCurrency ?? "IDR"} maxLength={3} className="input" /></Field>
          <Field label="Fiscal year starts (month)"><input name="fiscalYearStartMonth" type="number" min={1} max={12} defaultValue={e?.fiscalYearStartMonth ?? 1} className="input" /></Field>
        </div>
        <Field label="Corporate tax regime"><Select name="regime" defaultValue={e?.tax.regime ?? "normal_22"} options={Object.entries(TAX_REGIME_LABELS).map(([value, label]) => ({ value, label }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="PPN rate %"><input name="ppnRate" type="number" step="0.1" defaultValue={((e?.tax.ppnRate ?? 0.11) * 100).toFixed(1)} className="input" /></Field>
          <Field label="PPh 25 monthly instalment (IDR)"><input name="pph25Monthly" type="number" defaultValue={e?.tax.pph25Monthly ?? 0} className="input" /></Field>
          <Field label="Regional tax rate % (PB1, spa…)"><input name="localTaxRate" type="number" step="0.1" defaultValue={((e?.tax.localTaxRate ?? 0) * 100).toFixed(1)} className="input" /></Field>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="pkp" defaultChecked={e?.tax.pkp} className="checkbox" /> PKP (VAT-registered): issues e-Faktur and files SPT Masa PPN</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="lkpm" defaultChecked={e?.tax.lkpm ?? true} className="checkbox" /> Files quarterly LKPM (BKPM/OSS)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="payroll" defaultChecked={e?.tax.payroll} className="checkbox" /> Has employees (PPh 21 and BPJS)</label>
        </div>
        <p className="text-xs text-ink-500">Creating an entity initialises its chart of accounts (PSAK-style, bilingual) and the compliance calendar follows this profile.</p>
        <SubmitButton>{e ? "Save entity" : "Create entity and books"}</SubmitButton>
      </div>
    </form>
  );
}
