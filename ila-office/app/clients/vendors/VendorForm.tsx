import { REGIONS, VENDOR_CATEGORIES, type Vendor } from "@/lib/types";
import { Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const VENDOR_CATEGORY_LABELS: Record<Vendor["category"], string> = {
  notary: "Notary", kanim: "Kanim / immigration agent", bkpm: "BKPM agent", oss: "OSS agent", pbg: "PBG (building permit)", pupr: "PUPR (zoning)", sktt: "SKTT (civil registry)",
  sim: "SIM (driving licence)", dora: "DORA", agent: "Visa agent", bank: "Bank", government: "Government office", other: "Other",
};

export function VendorForm({ vendor, action }: { vendor?: Vendor; action: (fd: FormData) => Promise<void> }) {
  const v = vendor;
  return (
    <form action={action} className="card grid max-w-3xl gap-3 md:grid-cols-2">
      <Field label="Name"><input name="name" defaultValue={v?.name} required className="input" placeholder="Notary Agung" /></Field>
      <Field label="Category"><Select name="category" defaultValue={v?.category ?? "agent"} options={VENDOR_CATEGORIES.map((c) => ({ value: c, label: VENDOR_CATEGORY_LABELS[c] }))} /></Field>
      <Field label="Region"><Select name="region" defaultValue={v?.region ?? "Bali"} options={["", ...REGIONS].map((r) => ({ value: r, label: r || "— any —" }))} /></Field>
      <Field label="Phone / WhatsApp"><input name="phone" defaultValue={v?.phone} className="input" /></Field>
      <Field label="Email"><input name="email" type="email" defaultValue={v?.email} className="input" /></Field>
      <Field label="NPWP"><input name="npwp" defaultValue={v?.npwp} className="input" /></Field>
      <Field label="Bank account" className="md:col-span-2"><input name="bankAccount" defaultValue={v?.bankAccount} className="input" placeholder="BCA 1234567890 a.n. …" /></Field>
      <Field label="Notes" className="md:col-span-2"><textarea name="notes" rows={3} defaultValue={v?.notes} className="input" placeholder="Fees, turnaround, who to call…" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={v?.active ?? true} className="checkbox" /> Active</label>
      <div className="md:col-span-2"><SubmitButton>{v ? "Save vendor" : "Create vendor"}</SubmitButton></div>
    </form>
  );
}
