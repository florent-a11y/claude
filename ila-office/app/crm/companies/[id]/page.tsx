import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, todayISO } from "@/lib/dates";
import { fullName } from "@/lib/util";
import { ENTITY_TYPE_LABELS } from "@/lib/types";
import { Page, Card, DL, Badge, Field, Select, Money, statusTone } from "@/components/ui";
import { SubmitButton, ConfirmForm } from "@/components/client";
import { activeServices, activitiesFor, lookups } from "../../_lib/server";
import { Timeline } from "../../_components/Timeline";
import { TaskPanel } from "../../_components/TaskPanel";
import { DealsTable, ProjectsTable, QuotesTable, RenewalsTable } from "../../_components/tables";
import { addSubscription, endSubscription, removeSubscription } from "../actions";

export const dynamic = "force-dynamic";

export default async function CompanyDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const company = await db.get("companies", id);
  if (!company) notFound();
  const [l, services, deals, projects, quotes, renewals, tasks, entity] = await Promise.all([
    lookups(), activeServices(),
    db.list("deals", { where: { companyId: id }, orderBy: "createdAt", desc: true }),
    db.list("projects", { where: { companyId: id }, orderBy: "createdAt", desc: true }),
    db.list("quotes", { where: { companyId: id }, orderBy: "createdAt", desc: true }),
    db.list("renewals", { where: { companyId: id } }),
    db.list("tasks", { where: (t) => t.related?.type === "company" && t.related.id === id }),
    company.entityId ? db.get("entities", company.entityId) : Promise.resolve(null),
  ]);
  const contacts = [...l.contacts.values()].filter((c) => c.companyIds.includes(id) || c.id === company.primaryContactId);
  const dealIds = new Set(deals.map((d) => d.id));
  const projectIds = new Set(projects.map((p) => p.id));
  const activities = await activitiesFor((a) => a.companyId === id || (!!a.dealId && dealIds.has(a.dealId)) || (!!a.projectId && projectIds.has(a.projectId)));
  const write = can(me, "crm:write");
  const path = `/crm/companies/${id}`;
  const recurring = company.subscriptions.filter((s) => !s.endedAt);
  const subscriptionServices = services.filter((s) => s.cadence !== "none");
  return (
    <Page title={company.name} subtitle={<span>{company.type === "prospect" ? "Prospect" : ENTITY_TYPE_LABELS[company.type]} · {company.region ?? company.country}{company.npwp ? ` · NPWP ${company.npwp}` : ""}</span>}
      breadcrumbs={[{ href: "/crm/companies", label: "Companies" }, { label: company.name }]}
      actions={<>
        {company.entityId && <Link href={`/books/${company.entityId}`} className="btn-secondary">Books</Link>}
        {company.entityId && <Link href={`/tax/${company.entityId}`} className="btn-secondary">Tax</Link>}
        {write && <Link href={`/crm/deals/new?companyId=${id}${company.primaryContactId ? `&contactId=${company.primaryContactId}` : ""}`} className="btn-secondary">New deal</Link>}
        {write && <Link href={`/crm/quotes/new?companyId=${id}${company.primaryContactId ? `&contactId=${company.primaryContactId}` : ""}`} className="btn-secondary">New quote</Link>}
        {write && <Link href={`/crm/projects/new?companyId=${id}${company.primaryContactId ? `&contactId=${company.primaryContactId}` : ""}`} className="btn-secondary">New project</Link>}
        {write && <Link href={`/crm/companies/${id}/edit`} className="btn-primary">Edit</Link>}
      </>}>
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-4">
          <Card title="Details">
            <DL items={[
              ["Status", <Badge key="s" tone={statusTone(company.status)}>{company.status}</Badge>],
              ["Primary contact", company.primaryContactId ? <Link className="text-brand-600 underline" href={`/crm/contacts/${company.primaryContactId}`}>{l.contact(company.primaryContactId)}</Link> : "—"],
              ["Owner", l.user(company.ownerUserId)],
              ["NIB", company.nib ?? "—"], ["Deed", company.aktaNumber ?? "—"],
              ["Address", company.address ?? "—"],
              ["Books", entity ? <span><Link className="text-brand-600 underline" href={`/books/${entity.id}`}>{entity.name}</Link> · <Link className="text-brand-600 underline" href={`/tax/${entity.id}`}>tax calendar</Link></span> : <span className="text-ink-500">not managed by ILA{can(me, "admin") && <> · <Link className="underline" href="/settings/entities/new">create entity</Link></>}</span>],
              ["Drive", company.driveFolderUrl ? <a className="text-brand-600 underline" href={company.driveFolderUrl} target="_blank" rel="noreferrer">Open folder</a> : "—"],
              ["HubSpot / QBO", [company.hubspotId, company.qboCustomerId].filter(Boolean).join(" / ") || "—"],
              ["Tags", company.tags.length ? <span className="space-x-1">{company.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : "—"],
              ["Created", fmtDate(company.createdAt.slice(0, 10))],
            ]} />
            {company.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm">{company.notes}</p>}
          </Card>
          <Card title={`Contacts (${contacts.length})`} actions={write && <Link href={`/crm/contacts/new?companyId=${id}`} className="text-xs text-brand-600 underline">New contact</Link>}>
            {contacts.length === 0 ? <p className="text-sm text-ink-500">No contacts linked.</p> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {contacts.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 py-1.5"><span><Link href={`/crm/contacts/${c.id}`} className="font-medium hover:underline">{fullName(c)}</Link>{c.id === company.primaryContactId && <Badge tone="brand" className="ml-2">primary</Badge>}</span><span className="text-xs text-ink-500">{c.email ?? c.phone ?? ""}</span></li>)}
              </ul>
            )}
          </Card>
          <Card title={`Renewals (${renewals.length})`}><RenewalsTable renewals={renewals} l={l} showClient={false} /></Card>
          <TaskPanel tasks={tasks} related={{ type: "company", id }} backPath={path} l={l} meId={me.id} />
        </div>
        <div className="space-y-4">
          <Card title={`Subscriptions (${recurring.length} active)`}>
            {company.subscriptions.length === 0 ? <p className="text-sm text-ink-500">No recurring engagement.</p> : (
              <div className="overflow-x-auto"><table className="table">
                <thead><tr><th>Service</th><th className="num">Amount</th><th>Cadence</th><th>Started</th><th>Ended</th>{write && <th></th>}</tr></thead>
                <tbody>{company.subscriptions.map((s, i) => (
                  <tr key={i} className={s.endedAt ? "text-ink-500" : ""}>
                    <td>{s.label}</td>
                    <td className="num"><Money amount={s.amount} currency={s.currency} /></td>
                    <td className="text-xs">{s.cadence}</td>
                    <td className="text-xs">{fmtDate(s.startedAt)}</td>
                    <td className="text-xs">{s.endedAt ? fmtDate(s.endedAt) : <Badge tone="green">active</Badge>}</td>
                    {write && <td className="whitespace-nowrap text-xs">
                      {!s.endedAt && <form action={endSubscription.bind(null, id, i)} className="inline-flex items-center gap-1"><input type="date" name="endedAt" defaultValue={todayISO()} className="input !w-36 !py-0.5 text-xs" /><button className="text-brand-600 underline">End</button></form>}
                      {s.endedAt && <ConfirmForm action={removeSubscription.bind(null, id, i)} message="Remove this subscription row?"><button className="text-red-600 underline">Remove</button></ConfirmForm>}
                    </td>}
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            {write && (
              <details className="mt-3"><summary className="cursor-pointer text-sm text-brand-600 underline">Add subscription</summary>
                <form action={addSubscription.bind(null, id)} className="mt-2 grid gap-2 md:grid-cols-3">
                  <Field label="Catalogue service (optional)" className="md:col-span-3"><Select name="serviceId" defaultValue="" options={[{ value: "", label: "— free text —" }, ...subscriptionServices.map((s) => ({ value: s.id, label: `${s.name} (${s.unit})` }))]} /></Field>
                  <Field label="Label" className="md:col-span-3"><input name="label" required className="input" placeholder="Monthly tax compliance" /></Field>
                  <Field label="Amount"><input name="amount" type="number" min={0} step="any" required className="input" /></Field>
                  <Field label="Currency"><Select name="currency" defaultValue="IDR" options={["IDR", "USD", "EUR", "HKD"]} /></Field>
                  <Field label="Cadence"><Select name="cadence" defaultValue="monthly" options={["monthly", "quarterly", "annual"]} /></Field>
                  <Field label="Started"><input name="startedAt" type="date" defaultValue={todayISO()} className="input" /></Field>
                  <div className="flex items-end"><SubmitButton className="btn-secondary">Add</SubmitButton></div>
                </form>
              </details>
            )}
          </Card>
          <Card title={`Deals (${deals.length})`}><DealsTable deals={deals} l={l} showCompany={false} /></Card>
          <Card title={`Quotes (${quotes.length})`}><QuotesTable quotes={quotes} l={l} showCompany={false} /></Card>
          <Card title={`Projects (${projects.length})`}><ProjectsTable projects={projects} l={l} showCompany={false} /></Card>
          <Timeline activities={activities} refs={{ companyId: id, contactId: company.primaryContactId }} backPath={path} canWrite={write} />
        </div>
      </div>
    </Page>
  );
}
