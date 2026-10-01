import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { inferCategoryFromLines } from "@/lib/crm";
import { Page, Notice } from "@/components/ui";
import { activeServices, lookups } from "../../_lib/server";
import { ProjectForm, type ProjectDefaults } from "../ProjectForm";
import { createProject } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New project" };

type SP = { quoteId?: string; dealId?: string; companyId?: string; contactId?: string; renewalId?: string };

export default async function NewProject({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("crm:write");
  const sp = await searchParams;
  const [l, services, deals, quotes] = await Promise.all([lookups(), activeServices(), db.list("deals", { where: (d) => d.stage !== "closed_lost", orderBy: "createdAt", desc: true }), db.list("quotes", { orderBy: "createdAt", desc: true })]);
  const defaults: ProjectDefaults = { companyId: sp.companyId, contactId: sp.contactId, dealId: sp.dealId, quoteId: sp.quoteId, renewalId: sp.renewalId };
  const notices: string[] = [];
  if (sp.quoteId) {
    const q = quotes.find((x) => x.id === sp.quoteId);
    if (q) {
      const svcMap = new Map(services.map((s) => [s.id, s]));
      const firstLine = q.lines.find((ln) => ln.serviceId && svcMap.get(ln.serviceId)?.category !== "disbursement");
      defaults.title = q.title; defaults.companyId ??= q.companyId; defaults.contactId ??= q.contactId; defaults.dealId ??= q.dealId;
      defaults.feeAmount = q.total; defaults.feeCurrency = q.currency; defaults.category = inferCategoryFromLines(q.lines, svcMap); defaults.serviceId = firstLine?.serviceId;
      defaults.notes = q.scopeNotes;
      notices.push(`Pre-filled from quote ${q.number} (${q.currency} ${q.total}).`);
    }
  }
  if (sp.dealId && !sp.quoteId) {
    const d = deals.find((x) => x.id === sp.dealId);
    if (d) { defaults.title ??= d.title; defaults.companyId ??= d.companyId; defaults.contactId ??= d.contactId; defaults.feeAmount ??= d.amount; defaults.feeCurrency ??= d.currency; defaults.category ??= d.category; }
  }
  if (sp.renewalId) {
    const r = await db.get("renewals", sp.renewalId);
    if (r) {
      defaults.title ??= `Renewal - ${r.label}`; defaults.companyId ??= r.companyId; defaults.contactId ??= r.contactId; defaults.serviceId ??= r.serviceId;
      const svc = r.serviceId ? services.find((s) => s.id === r.serviceId) : undefined;
      defaults.category ??= svc?.category ?? (r.kind === "kitas" || r.kind === "visa" ? "visa" : r.kind === "licence" ? "licensing" : "corporate");
      if (r.contactId) { const c = l.contacts.get(r.contactId); if (c) defaults.subject = { name: `${c.firstName} ${c.lastName}`.trim(), passportNumber: c.passportNumber, nationality: c.nationality, dateOfBirth: c.dateOfBirth }; }
      notices.push(`Renewal project for "${r.label}" (expires ${r.expiresAt}); the renewal is marked quoted now and renewed when this project is done.`);
    }
  }
  return (
    <Page title="New project" breadcrumbs={[{ href: "/crm/projects", label: "Projects" }, { label: "New" }]}>
      {notices.length > 0 && <div className="mb-3 space-y-2">{notices.map((n, i) => <Notice key={i} tone="blue">{n}</Notice>)}</div>}
      <ProjectForm defaults={defaults} services={services} l={l} action={createProject} deals={deals.map((d) => ({ id: d.id, title: d.title }))} quotes={quotes.map((q) => ({ id: q.id, number: q.number, title: q.title }))} />
    </Page>
  );
}
