import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { RENEWAL_REMINDER_DAYS } from "@/lib/crm";
import { addMonths, todayISO } from "@/lib/dates";
import { RENEWAL_KINDS, RENEWAL_KIND_LABELS } from "@/lib/types";
import { Page, Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { activeServices, companyOptions, contactOptions, lookups, sortedCompanies, sortedContacts, userOptions } from "../../_lib/server";
import { createRenewal } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New renewal" };

export default async function NewRenewal({ searchParams }: { searchParams: Promise<{ companyId?: string; contactId?: string; kind?: string }> }) {
  await requirePermission("crm:write");
  const sp = await searchParams;
  const [l, services, projects] = await Promise.all([lookups(), activeServices(), db.list("projects", { orderBy: "createdAt", desc: true, limit: 200 })]);
  const renewable = services.filter((s) => s.renewalMonths);
  return (
    <Page title="New renewal" breadcrumbs={[{ href: "/crm/renewals", label: "Renewals" }, { label: "New" }]}>
      <form action={createRenewal} className="card grid max-w-3xl gap-3 md:grid-cols-2">
        <Field label="Kind"><Select name="kind" defaultValue={sp.kind ?? "kitas"} options={RENEWAL_KINDS.map((k) => ({ value: k, label: RENEWAL_KIND_LABELS[k] }))} /></Field>
        <Field label="Label"><input name="label" required className="input" placeholder="Investor KITAS - Camille Durand" /></Field>
        <Field label="Company"><Select name="companyId" defaultValue={sp.companyId ?? ""} options={companyOptions(sortedCompanies(l))} /></Field>
        <Field label="Contact"><Select name="contactId" defaultValue={sp.contactId ?? ""} options={contactOptions(sortedContacts(l))} /></Field>
        <Field label="Expires on"><input name="expiresAt" type="date" required defaultValue={addMonths(todayISO(), 12)} className="input" /></Field>
        <Field label="Remind (days before)" hint={`Defaults: KITAS ${RENEWAL_REMINDER_DAYS.kitas}, licence ${RENEWAL_REMINDER_DAYS.licence}, LKPM ${RENEWAL_REMINDER_DAYS.lkpm}.`}><input name="reminderDays" type="number" min={0} max={365} defaultValue={60} className="input" /></Field>
        <Field label="Service to re-quote (optional)"><Select name="serviceId" defaultValue="" options={[{ value: "", label: "— none —" }, ...renewable.map((s) => ({ value: s.id, label: `${s.name} (${s.renewalMonths} m)` }))]} /></Field>
        <Field label="Original project (optional)"><Select name="projectId" defaultValue="" options={[{ value: "", label: "— none —" }, ...projects.map((p) => ({ value: p.id, label: `${p.number} ${p.title}` }))]} /></Field>
        <Field label="Owner"><Select name="ownerUserId" defaultValue="" options={userOptions(l.activeUsers, "— me —")} /></Field>
        <Field label="Notes" className="md:col-span-2"><textarea name="notes" rows={2} className="input" /></Field>
        <div className="md:col-span-2"><SubmitButton>Create renewal</SubmitButton></div>
      </form>
    </Page>
  );
}
