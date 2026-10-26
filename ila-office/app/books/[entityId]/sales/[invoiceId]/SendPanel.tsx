import Link from "next/link";
import { Card, Field, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { emailConfigured, mailtoLink } from "@/lib/email";
import { invoiceEmailDraft } from "@/lib/invoice-email";
import { fmtDateTime } from "@/lib/dates";
import type { Entity, Invoice } from "@/lib/types";
import { sendInvoiceAction } from "../actions";

/**
 * "Send to client": emails the invoice PDF with ILA's standard wording. When no email service is configured
 * (local development), it offers the same message as a mailto: link plus the PDF download.
 */
export function SendPanel({ entity, invoice, to, greetingName, paymentInstructions, writable }: { entity: Entity; invoice: Invoice; to: string; greetingName: string; paymentInstructions: string; writable: boolean }) {
  const draft = invoiceEmailDraft(invoice, entity, { to, greetingName, paymentInstructions });
  const configured = emailConfigured();
  const pdfHref = `/api/books/${entity.id}/invoices/${invoice.id}/pdf`;
  if (invoice.status === "void") return null;
  return (
    <Card title={invoice.sentAt ? "Send again" : "Send to client"} actions={<a href={pdfHref} className="text-xs text-brand-600 underline" target="_blank" rel="noopener">Download PDF</a>}>
      {invoice.sentAt && <p className="mb-2 text-xs text-ink-500">Last sent {fmtDateTime(invoice.sentAt)}.</p>}
      {!configured && (
        <div className="mb-3">
          <Notice tone="amber">
            Email sending is not configured on this installation (set <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code>).
            Use <a className="underline" href={mailtoLink(draft.to, draft.subject, draft.text)}>Open in Mail</a> to get the message prefilled, and attach the <a className="underline" href={pdfHref} target="_blank" rel="noopener">PDF</a>.
          </Notice>
        </div>
      )}
      {writable && (
        <form action={sendInvoiceAction.bind(null, entity.id, invoice.id)} className="space-y-3">
          <Field label="To"><input name="to" type="email" defaultValue={draft.to} required className="input" placeholder="client@example.com" /></Field>
          <Field label="CC (optional, comma-separated)"><input name="cc" defaultValue="" className="input" /></Field>
          <Field label="Subject"><input name="subject" defaultValue={draft.subject} required className="input" /></Field>
          <Field label="Message"><textarea name="message" defaultValue={draft.text} rows={9} className="input font-mono text-xs" /></Field>
          {invoice.status === "draft" && <p className="text-xs text-ink-500">The invoice is still a draft. Sending posts it first (Dr AR / Cr revenue dated {invoice.date}).</p>}
          <SubmitButton pendingText="Sending…" className={configured ? "btn-primary" : "btn-secondary"}>{configured ? `Send email with ${draft.filename}` : "Mark as sent (no email service)"}</SubmitButton>
        </form>
      )}
      {!writable && <p className="text-xs text-ink-500">Sending needs the accountant or admin role. <Link href={pdfHref} className="text-brand-600 underline">Download the PDF</Link> instead.</p>}
    </Card>
  );
}
