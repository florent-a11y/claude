import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { effectiveQuoteStatus, quoteTotals } from "@/lib/crm";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/dates";
import { Page, Card, DL, Badge, Money, Notice, statusTone } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { activitiesFor, lookups } from "../../_lib/server";
import { Timeline } from "../../_components/Timeline";
import { acceptQuote, declineQuote, deleteQuote, duplicateQuote, markQuoteSent, reopenQuote } from "../actions";

export const dynamic = "force-dynamic";

export default async function QuoteDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ accepted?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const quote = await db.get("quotes", id);
  if (!quote) notFound();
  const [l, projects, activities] = await Promise.all([lookups(), db.list("projects", { where: { quoteId: id } }), activitiesFor((a) => a.quoteId === id)]);
  const write = can(me, "crm:write");
  const status = effectiveQuoteStatus(quote, todayISO());
  const totals = quoteTotals(quote.lines, quote.currency, quote.discount);
  const path = `/crm/quotes/${id}`;
  const project = projects[0];
  const projectQs = `quoteId=${id}`;
  return (
    <Page title={`${quote.number} · ${quote.title}`} subtitle={<span><Badge tone={statusTone(status)}>{status}</Badge> · <Money amount={quote.total} currency={quote.currency} /> · valid until {fmtDate(quote.validUntil)}</span>}
      breadcrumbs={[{ href: "/crm/quotes", label: "Quotes" }, { label: quote.number }]}
      actions={<>
        <Link href={`${path}/print`} className="btn-secondary">Print / PDF</Link>
        {write && status !== "accepted" && <Link href={`${path}/edit`} className="btn-secondary">Edit</Link>}
        {write && <form action={duplicateQuote.bind(null, id)}><SubmitButton className="btn-secondary" pendingText="Copying…">Duplicate</SubmitButton></form>}
        {write && (status === "draft" || status === "expired") && <form action={markQuoteSent.bind(null, id)}><SubmitButton pendingText="Marking…">{status === "expired" ? "Re-send (mark sent)" : "Mark sent"}</SubmitButton></form>}
        {write && (status === "sent" || status === "expired") && <ConfirmForm action={acceptQuote.bind(null, id)} message="Mark this quote as accepted by the client? The deal moves to Review."><button className="btn-primary">Accept</button></ConfirmForm>}
        {write && status === "accepted" && !project && <Link href={`/crm/projects/new?${projectQs}`} className="btn-primary">Create project from quote</Link>}
      </>}>
      {sp.accepted && !project && <div className="mb-3"><Notice tone="green">Quote accepted. <Link className="underline" href={`/crm/projects/new?${projectQs}`}>Create the project</Link> to start the checklist and the cost of sales sheet, then issue the invoice (due 3 working days).</Notice></div>}
      {status === "expired" && <div className="mb-3"><Notice tone="amber">This quote expired on {fmtDate(quote.validUntil)}. Duplicate it to re-issue with fresh validity, or re-send it as is.</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-4">
          <Card title="Client">
            <DL items={[
              ["Company", quote.companyId ? <Link className="text-brand-600 underline" href={`/crm/companies/${quote.companyId}`}>{l.company(quote.companyId)}</Link> : "—"],
              ["Contact", quote.contactId ? <Link className="text-brand-600 underline" href={`/crm/contacts/${quote.contactId}`}>{l.contact(quote.contactId)}</Link> : "—"],
              ["Deal", quote.dealId ? <Link className="text-brand-600 underline" href={`/crm/deals/${quote.dealId}`}>open deal</Link> : "—"],
              ["Project", project ? <Link className="text-brand-600 underline" href={`/crm/projects/${project.id}`}>{project.number}</Link> : "—"],
              ["Prepared by", l.user(quote.preparedByUserId)], ["Created", fmtDateTime(quote.createdAt)],
              ["Sent", quote.sentAt ? fmtDateTime(quote.sentAt) : "—"], ["Accepted", quote.acceptedAt ? fmtDateTime(quote.acceptedAt) : "—"],
            ]} />
          </Card>
          {write && (status === "sent" || status === "expired") && (
            <Card title="Decline">
              <form action={declineQuote.bind(null, id)} className="flex gap-2"><input name="reason" className="input" placeholder="Reason (optional)" /><SubmitButton className="btn-danger" pendingText="…">Decline</SubmitButton></form>
            </Card>
          )}
          {write && (status === "declined" || status === "sent") && <form action={reopenQuote.bind(null, id)}><button className="text-xs text-brand-600 underline">Back to draft</button></form>}
          {write && status === "draft" && <ConfirmForm action={deleteQuote.bind(null, id)} message="Delete this draft quote?"><button className="text-xs text-red-600 underline">Delete draft</button></ConfirmForm>}
        </div>
        <div className="space-y-4">
          <Card title="Lines">
            <div className="overflow-x-auto"><table className="table">
              <thead><tr><th>#</th><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
              <tbody>{quote.lines.map((ln, i) => <tr key={ln.id}><td className="text-xs text-ink-500">{i + 1}</td><td>{ln.description}{ln.note && <span className="block text-xs text-ink-500">{ln.note}</span>}</td><td className="num">{ln.qty}</td><td className="num"><Money amount={ln.unitPrice} currency={quote.currency} /></td><td className="num"><Money amount={ln.amount} currency={quote.currency} /></td></tr>)}</tbody>
              <tfoot className="text-sm">
                <tr><td colSpan={4} className="pt-2 text-right text-ink-500">Subtotal</td><td className="num pt-2"><Money amount={totals.subtotal} currency={quote.currency} /></td></tr>
                {totals.discount > 0 && <tr><td colSpan={4} className="text-right text-ink-500">Discount</td><td className="num text-red-700">− <Money amount={totals.discount} currency={quote.currency} /></td></tr>}
                <tr className="font-semibold"><td colSpan={4} className="text-right">Total</td><td className="num"><Money amount={quote.total} currency={quote.currency} /></td></tr>
              </tfoot>
            </table></div>
          </Card>
          {(quote.scopeNotes || quote.documentsNeeded) && (
            <div className="grid gap-4 md:grid-cols-2">
              {quote.scopeNotes && <Card title="Scope notes"><p className="whitespace-pre-wrap text-sm">{quote.scopeNotes}</p></Card>}
              {quote.documentsNeeded && <Card title="Documents needed"><p className="whitespace-pre-wrap text-sm">{quote.documentsNeeded}</p></Card>}
            </div>
          )}
          <Card title="Terms"><p className="whitespace-pre-wrap text-xs text-ink-700">{quote.terms}</p></Card>
          <Timeline activities={activities} refs={{ quoteId: id, dealId: quote.dealId, companyId: quote.companyId, contactId: quote.contactId }} backPath={path} canWrite={write} />
        </div>
      </div>
    </Page>
  );
}
