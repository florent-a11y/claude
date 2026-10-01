import type { Project, ServiceItem } from "@/lib/types";
import { Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { companyOptions, contactOptions, sortedCompanies, sortedContacts, userOptions, type Lookups } from "../_lib/server";
import { ServicePicker } from "./ServicePicker";

export type ProjectDefaults = Partial<Pick<Project, "title" | "category" | "serviceId" | "companyId" | "contactId" | "dealId" | "quoteId" | "feeAmount" | "feeCurrency" | "subject" | "notes">> & { renewalId?: string };

export function ProjectForm({ project, defaults = {}, services, l, action, deals, quotes }: { project?: Project; defaults?: ProjectDefaults; services: ServiceItem[]; l: Lookups; action: (fd: FormData) => Promise<void>; deals: Array<{ id: string; title: string }>; quotes: Array<{ id: string; number: string; title: string }> }) {
  const p = project;
  const subject = p?.subject ?? defaults.subject;
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {defaults.renewalId && <input type="hidden" name="renewalId" value={defaults.renewalId} />}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Matter</h2>
        <Field label="Title"><input name="title" defaultValue={p?.title ?? defaults.title} required className="input" placeholder="Working KITAS - John Smith" /></Field>
        <ServicePicker services={services.map((s) => ({ id: s.id, name: s.name, category: s.category, code: s.code }))} defaultServiceId={p?.serviceId ?? defaults.serviceId ?? ""} defaultCategory={p?.category ?? defaults.category ?? "visa"} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company"><Select name="companyId" defaultValue={p?.companyId ?? defaults.companyId ?? ""} options={companyOptions(sortedCompanies(l))} /></Field>
          <Field label="Contact"><Select name="contactId" defaultValue={p?.contactId ?? defaults.contactId ?? ""} options={contactOptions(sortedContacts(l))} /></Field>
          <Field label="Deal"><Select name="dealId" defaultValue={p?.dealId ?? defaults.dealId ?? ""} options={[{ value: "", label: "— none —" }, ...deals.map((d) => ({ value: d.id, label: d.title }))]} /></Field>
          <Field label="Quote"><Select name="quoteId" defaultValue={p?.quoteId ?? defaults.quoteId ?? ""} options={[{ value: "", label: "— none —" }, ...quotes.map((q) => ({ value: q.id, label: `${q.number} ${q.title}` }))]} /></Field>
          <Field label="Project owner" hint="Approves cost of sales."><Select name="ownerUserId" defaultValue={p?.ownerUserId ?? ""} options={userOptions(l.activeUsers, "— me —")} /></Field>
          <Field label="Assignee"><Select name="assigneeUserId" defaultValue={p?.assigneeUserId ?? ""} options={userOptions(l.activeUsers)} /></Field>
        </div>
        <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Subject person (visa holder, director…)</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input name="subjectName" defaultValue={subject?.name} className="input" /></Field>
          <Field label="Passport number"><input name="subjectPassport" defaultValue={subject?.passportNumber} className="input" /></Field>
          <Field label="Nationality (ISO-2)"><input name="subjectNationality" defaultValue={subject?.nationality} maxLength={2} className="input" /></Field>
          <Field label="Date of birth"><input name="subjectDob" type="date" defaultValue={subject?.dateOfBirth} className="input" /></Field>
        </div>
      </div>
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Fee, dates and files</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fee amount"><input name="feeAmount" type="number" min={0} step="any" defaultValue={p?.feeAmount ?? defaults.feeAmount ?? 0} className="input" /></Field>
          <Field label="Currency"><Select name="feeCurrency" defaultValue={p?.feeCurrency ?? defaults.feeCurrency ?? "IDR"} options={["IDR", "USD", "EUR", "HKD"]} /></Field>
          <Field label="Invoice reference" hint="QBO doc number or internal invoice."><input name="invoiceRef" defaultValue={p?.invoiceRef} className="input" /></Field>
          <Field label="Started"><input name="startedAt" type="date" defaultValue={p?.startedAt} className="input" /></Field>
          <Field label="Due date"><input name="dueDate" type="date" defaultValue={p?.dueDate} className="input" /></Field>
          <Field label="Deliverable expires" hint="KITAS / licence validity; feeds renewals. Inferred from the service when left empty."><input name="expiresAt" type="date" defaultValue={p?.expiresAt} className="input" /></Field>
        </div>
        <Field label="Client Drive folder URL"><input name="driveFolderUrl" type="url" defaultValue={p?.driveFolderUrl} className="input" /></Field>
        <Field label="Notes"><textarea name="notes" rows={4} defaultValue={p?.notes ?? defaults.notes} className="input" /></Field>
        <SubmitButton>{p ? "Save project" : "Create project"}</SubmitButton>
        {!p && <p className="text-xs text-ink-500">The checklist is created from the template of the chosen service / category.</p>}
      </div>
    </form>
  );
}
