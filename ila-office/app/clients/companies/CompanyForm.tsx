import { ENTITY_TYPES, ENTITY_TYPE_LABELS, REGIONS, type Company, type Contact, type User } from "@/lib/types";
import { fullName } from "@/lib/util";
import { Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { userOptions } from "../_lib/server";

export function CompanyForm({ company, contacts, users, action, defaultContactId }: { company?: Company; contacts: Contact[]; users: User[]; action: (fd: FormData) => Promise<void>; defaultContactId?: string }) {
  const c = company;
  const typeOptions = [{ value: "prospect", label: "Prospect (not incorporated yet)" }, ...ENTITY_TYPES.map((t) => ({ value: t, label: ENTITY_TYPE_LABELS[t] }))];
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Company</h2>
        <Field label="Name"><input name="name" defaultValue={c?.name} required className="input" placeholder="PT Example Bali Investama" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Select name="type" defaultValue={c?.type ?? "prospect"} options={typeOptions} /></Field>
          <Field label="Status"><Select name="status" defaultValue={c?.status ?? "lead"} options={["lead", "active", "inactive"]} /></Field>
          <Field label="Country (ISO-2)"><input name="country" defaultValue={c?.country ?? "ID"} maxLength={2} className="input" /></Field>
          <Field label="Region"><Select name="region" defaultValue={c?.region ?? "Bali"} options={[...REGIONS]} /></Field>
          <Field label="NPWP"><input name="npwp" defaultValue={c?.npwp} className="input" /></Field>
          <Field label="NIB"><input name="nib" defaultValue={c?.nib} className="input" /></Field>
        </div>
        <Field label="Deed (akta) number"><input name="aktaNumber" defaultValue={c?.aktaNumber} className="input" /></Field>
        <Field label="Address"><textarea name="address" rows={2} defaultValue={c?.address} className="input" /></Field>
        <Field label="Notes"><textarea name="notes" rows={3} defaultValue={c?.notes} className="input" /></Field>
      </div>
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Relationship</h2>
        <Field label="Primary contact" hint="The contact is linked to this company automatically."><Select name="primaryContactId" defaultValue={c?.primaryContactId ?? defaultContactId ?? ""} options={[{ value: "", label: "— none —" }, ...contacts.map((k) => ({ value: k.id, label: fullName(k) || k.email || k.id }))]} /></Field>
        <Field label="Owner"><Select name="ownerUserId" defaultValue={c?.ownerUserId ?? ""} options={userOptions(users)} /></Field>
        <Field label="Tags (comma separated)"><input name="tags" defaultValue={c?.tags.join(", ")} className="input" /></Field>
        <Field label="Drive folder URL"><input name="driveFolderUrl" type="url" defaultValue={c?.driveFolderUrl} className="input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="HubSpot id"><input name="hubspotId" defaultValue={c?.hubspotId} className="input" /></Field>
          <Field label="QuickBooks customer id"><input name="qboCustomerId" defaultValue={c?.qboCustomerId} className="input" /></Field>
        </div>
        {c?.entityId && <p className="text-xs text-ink-500">Books entity linked: <code>{c.entityId}</code> (managed in Settings → Entities).</p>}
        <SubmitButton>{c ? "Save company" : "Create company"}</SubmitButton>
      </div>
    </form>
  );
}
