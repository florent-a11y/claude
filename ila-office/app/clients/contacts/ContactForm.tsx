import type { Company, Contact, User } from "@/lib/types";
import { Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { userOptions } from "../_lib/server";

const SOURCES = ["", "referral", "website", "instagram", "google", "partner", "event", "existing client", "other"];
export const LANGUAGES = [{ value: "en", label: "English" }, { value: "fr", label: "French" }, { value: "id", label: "Indonesian" }, { value: "es", label: "Spanish" }, { value: "ru", label: "Russian" }, { value: "de", label: "German" }, { value: "it", label: "Italian" }, { value: "zh", label: "Chinese" }, { value: "other", label: "Other" }];
export const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(LANGUAGES.map((l) => [l.value, l.label]));

export function ContactForm({ contact, companies, users, action, defaultCompanyId }: { contact?: Contact; companies: Company[]; users: User[]; action: (fd: FormData) => Promise<void>; defaultCompanyId?: string }) {
  const c = contact;
  const selected = new Set(c?.companyIds ?? (defaultCompanyId ? [defaultCompanyId] : []));
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Person</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><input name="firstName" defaultValue={c?.firstName} required className="input" /></Field>
          <Field label="Last name"><input name="lastName" defaultValue={c?.lastName} className="input" /></Field>
          <Field label="Email"><input name="email" type="email" defaultValue={c?.email} className="input" /></Field>
          <Field label="Phone"><input name="phone" defaultValue={c?.phone} className="input" placeholder="+62 8…" /></Field>
          <Field label="WhatsApp"><input name="whatsapp" defaultValue={c?.whatsapp} className="input" placeholder="same as phone if empty" /></Field>
          <Field label="Nationality (ISO-2)"><input name="nationality" defaultValue={c?.nationality} maxLength={2} className="input" placeholder="FR" /></Field>
          <Field label="Language"><Select name="language" defaultValue={c?.language ?? "en"} options={LANGUAGES} /></Field>
          <Field label="Date of birth"><input name="dateOfBirth" type="date" defaultValue={c?.dateOfBirth} className="input" /></Field>
          <Field label="Passport number"><input name="passportNumber" defaultValue={c?.passportNumber} className="input" /></Field>
          <Field label="Passport expiry"><input name="passportExpiry" type="date" defaultValue={c?.passportExpiry} className="input" /></Field>
        </div>
        <Field label="Notes"><textarea name="notes" rows={4} defaultValue={c?.notes} className="input" /></Field>
      </div>
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Relationship</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner"><Select name="ownerUserId" defaultValue={c?.ownerUserId ?? ""} options={userOptions(users)} /></Field>
          <Field label="Source"><Select name="source" defaultValue={c?.source ?? ""} options={SOURCES.map((s) => ({ value: s, label: s || "— unknown —" }))} /></Field>
        </div>
        <Field label="Tags (comma separated)"><input name="tags" defaultValue={c?.tags.join(", ")} className="input" placeholder="villa, investor, bali" /></Field>
        <div>
          <span className="label">Companies</span>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 text-sm">
            {companies.length === 0 && <p className="text-xs text-ink-500">No companies yet.</p>}
            {companies.map((co) => (
              <label key={co.id} className="flex items-center gap-2"><input type="checkbox" name="companyIds" value={co.id} defaultChecked={selected.has(co.id)} className="checkbox" /> {co.name} <span className="text-xs text-ink-500">{co.status}</span></label>
            ))}
          </div>
        </div>
        <Field label="Drive folder URL"><input name="driveFolderUrl" type="url" defaultValue={c?.driveFolderUrl} className="input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="HubSpot id"><input name="hubspotId" defaultValue={c?.hubspotId} className="input" /></Field>
          <Field label="QuickBooks customer id"><input name="qboCustomerId" defaultValue={c?.qboCustomerId} className="input" /></Field>
        </div>
        <SubmitButton>{c ? "Save contact" : "Create contact"}</SubmitButton>
      </div>
    </form>
  );
}
