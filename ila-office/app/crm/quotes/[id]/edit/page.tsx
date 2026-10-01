import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { QUOTE_TERMS } from "@/lib/catalogue";
import { Page } from "@/components/ui";
import { activeServices, lookups } from "../../../_lib/server";
import { QuoteForm } from "../../QuoteForm";
import { updateQuote } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditQuote({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("crm:write");
  const { id } = await params;
  const quote = await db.get("quotes", id);
  if (!quote) notFound();
  if (quote.status === "accepted") redirect(`/crm/quotes/${id}`);
  const [l, services, deals] = await Promise.all([lookups(), activeServices(), db.list("deals", { orderBy: "createdAt", desc: true })]);
  return (
    <Page title={`Edit ${quote.number}`} breadcrumbs={[{ href: "/crm/quotes", label: "Quotes" }, { href: `/crm/quotes/${id}`, label: quote.number }, { label: "Edit" }]}>
      <QuoteForm quote={quote} defaults={{ validUntil: quote.validUntil, terms: QUOTE_TERMS }} services={services} deals={deals.map((d) => ({ id: d.id, title: d.title, companyId: d.companyId }))} l={l} action={updateQuote.bind(null, id)} />
    </Page>
  );
}
