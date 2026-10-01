import type { Quote, ServiceItem } from "@/lib/types";
import { Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { companyOptions, contactOptions, sortedCompanies, sortedContacts, type Lookups } from "../_lib/server";
import { QuoteLinesEditor, type EditorLine, type EditorService } from "./QuoteLinesEditor";

export interface QuoteDefaults { title?: string; companyId?: string; contactId?: string; dealId?: string; currency?: string; validUntil: string; terms: string; lines?: EditorLine[]; scopeNotes?: string; documentsNeeded?: string }

export function QuoteForm({ quote, defaults, services, deals, l, action }: { quote?: Quote; defaults: QuoteDefaults; services: ServiceItem[]; deals: Array<{ id: string; title: string; companyId?: string }>; l: Lookups; action: (fd: FormData) => Promise<void> }) {
  const q = quote;
  const editorServices: EditorService[] = services.map((s) => ({ id: s.id, code: s.code, name: s.name, category: s.category, unit: s.unit, description: s.description, priceIDR: s.priceIDR, priceUSD: s.priceUSD, priceEUR: s.priceEUR, includesNote: s.includesNote }));
  const lines: EditorLine[] = q?.lines.map((ln) => ({ id: ln.id, serviceId: ln.serviceId, description: ln.description, qty: ln.qty, unitPrice: ln.unitPrice, note: ln.note })) ?? defaults.lines ?? [];
  return (
    <form action={action} className="space-y-4">
      <div className="card grid gap-3 md:grid-cols-4">
        <Field label="Title" className="md:col-span-2"><input name="title" defaultValue={q?.title ?? defaults.title} required className="input" placeholder="Working KITAS - John Smith" /></Field>
        <Field label="Valid until" hint="ILA quotes are valid 7 days."><input name="validUntil" type="date" defaultValue={q?.validUntil ?? defaults.validUntil} required className="input" /></Field>
        <Field label="Deal"><Select name="dealId" defaultValue={q?.dealId ?? defaults.dealId ?? ""} options={[{ value: "", label: "— none —" }, ...deals.map((d) => ({ value: d.id, label: `${d.title}${d.companyId ? ` · ${l.company(d.companyId)}` : ""}` }))]} /></Field>
        <Field label="Company" className="md:col-span-2"><Select name="companyId" defaultValue={q?.companyId ?? defaults.companyId ?? ""} options={companyOptions(sortedCompanies(l))} /></Field>
        <Field label="Contact" className="md:col-span-2"><Select name="contactId" defaultValue={q?.contactId ?? defaults.contactId ?? ""} options={contactOptions(sortedContacts(l))} /></Field>
      </div>
      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-ink-700">Services</h2>
        <QuoteLinesEditor services={editorServices} initialLines={lines} initialCurrency={q?.currency ?? defaults.currency ?? "IDR"} initialDiscount={q?.discount ?? 0} />
      </div>
      <div className="card grid gap-3 md:grid-cols-2">
        <Field label="Scope notes" hint="What is included, timeline, assumptions. Printed on the quote."><textarea name="scopeNotes" rows={5} defaultValue={q?.scopeNotes ?? defaults.scopeNotes} className="input" /></Field>
        <Field label="Documents needed from the client" hint="Printed as a checklist for the client."><textarea name="documentsNeeded" rows={5} defaultValue={q?.documentsNeeded ?? defaults.documentsNeeded} className="input" placeholder={"Passport copy (valid 18+ months)\nPhoto 4x6 red background\n…"} /></Field>
        <Field label="Terms" className="md:col-span-2"><textarea name="terms" rows={5} defaultValue={q?.terms ?? defaults.terms} className="input text-xs" /></Field>
        <div className="md:col-span-2"><SubmitButton>{q ? "Save quote" : "Create quote"}</SubmitButton></div>
      </div>
    </form>
  );
}
