import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { QUOTE_TERMS } from "@/lib/catalogue";
import { defaultValidUntil, servicePrice } from "@/lib/crm";
import { todayISO } from "@/lib/dates";
import { RENEWAL_KIND_LABELS } from "@/lib/types";
import { Page, Notice } from "@/components/ui";
import { activeServices, lookups } from "../../_lib/server";
import { QuoteForm, type QuoteDefaults } from "../QuoteForm";
import { createQuote } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New quote" };

type SP = { companyId?: string; contactId?: string; dealId?: string; renewalId?: string; title?: string; currency?: string };

export default async function NewQuote({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("crm:write");
  const sp = await searchParams;
  const [l, services, deals] = await Promise.all([lookups(), activeServices(), db.list("deals", { where: (d) => d.stage !== "closed_lost", orderBy: "createdAt", desc: true })]);
  const defaults: QuoteDefaults = { title: sp.title, companyId: sp.companyId, contactId: sp.contactId, dealId: sp.dealId, currency: sp.currency, validUntil: defaultValidUntil(todayISO()), terms: QUOTE_TERMS };
  let notice: string | undefined;
  if (sp.dealId) {
    const deal = await db.get("deals", sp.dealId);
    if (deal) { defaults.title ??= deal.title; defaults.companyId ??= deal.companyId; defaults.contactId ??= deal.contactId; defaults.currency ??= deal.currency; }
  }
  if (sp.renewalId) {
    const r = await db.get("renewals", sp.renewalId);
    if (r) {
      defaults.title ??= `Renewal - ${r.label}`; defaults.companyId ??= r.companyId; defaults.contactId ??= r.contactId;
      const svc = r.serviceId ? services.find((s) => s.id === r.serviceId) : undefined;
      const cur = defaults.currency ?? "IDR";
      defaults.lines = svc ? [{ serviceId: svc.id, description: svc.name, qty: 1, unitPrice: servicePrice(svc, cur) }] : [{ description: `${RENEWAL_KIND_LABELS[r.kind]} renewal - ${r.label}`, qty: 1, unitPrice: 0 }];
      notice = `Pre-filled from renewal "${r.label}" (expires ${r.expiresAt}). Mark the renewal as quoted once sent.`;
    }
  }
  return (
    <Page title="New quote" breadcrumbs={[{ href: "/crm/quotes", label: "Quotes" }, { label: "New" }]}>
      {notice && <div className="mb-3"><Notice tone="blue">{notice}</Notice></div>}
      <QuoteForm defaults={defaults} services={services} deals={deals.map((d) => ({ id: d.id, title: d.title, companyId: d.companyId }))} l={l} action={createQuote} />
    </Page>
  );
}
