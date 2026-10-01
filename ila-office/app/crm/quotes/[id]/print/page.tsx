import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { COMPANY } from "@/lib/catalogue";
import { quoteTotals, effectiveQuoteStatus } from "@/lib/crm";
import { fmtDate, todayISO } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { fullName } from "@/lib/util";
import { PrintButton } from "@/components/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await db.get("quotes", id);
  return { title: q ? `${q.number} ${q.title}` : "Quote" };
}

/** Client-facing quotation, laid out for A4 PDF export (sidebar and app chrome are hidden by `.no-print`). */
export default async function PrintQuote({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const quote = await db.get("quotes", id);
  if (!quote) notFound();
  const [company, contact, preparedBy] = await Promise.all([
    quote.companyId ? db.get("companies", quote.companyId) : null,
    quote.contactId ? db.get("contacts", quote.contactId) : null,
    quote.preparedByUserId ? db.get("users", quote.preparedByUserId) : null,
  ]);
  const totals = quoteTotals(quote.lines, quote.currency, quote.discount);
  const status = effectiveQuoteStatus(quote, todayISO());
  const money = (n: number) => fmtMoney(n, quote.currency);
  const docs = (quote.documentsNeeded ?? "").split(/\r?\n/).map((s) => s.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  const issued = (quote.sentAt ?? quote.createdAt).slice(0, 10);
  return (
    <div className="bg-slate-100 print:bg-white">
      <style>{`@page { size: A4; margin: 14mm 14mm 16mm; } @media print { .sheet { box-shadow: none !important; margin: 0 !important; width: auto !important; min-height: 0 !important; padding: 0 !important; } }`}</style>
      <div className="no-print mx-auto flex max-w-[210mm] items-center justify-between px-4 py-3 text-sm">
        <Link href={`/crm/quotes/${id}`} className="text-brand-600 underline">← Back to quote</Link>
        <div className="flex items-center gap-2">{status === "draft" && <span className="pill bg-amber-100 text-amber-900">draft — mark sent after sending</span>}<PrintButton /></div>
      </div>
      <div className="sheet mx-auto mb-8 min-h-[297mm] w-[210mm] bg-white p-[14mm] text-[11px] leading-snug text-ink-900 shadow-lg print:text-[11px]">
        <header className="flex items-start justify-between border-b-2 border-brand-700 pb-4">
          <div>
            <p className="text-xl font-bold tracking-tight text-brand-700">{COMPANY.name}</p>
            <p className="text-[10px] uppercase tracking-widest text-accent-600">{COMPANY.tagline}</p>
            <p className="mt-1 italic text-ink-500">{COMPANY.motto}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold uppercase tracking-wide text-brand-700">Quotation</p>
            <p className="mt-1 font-semibold">{quote.number}</p>
            <p>Date: {fmtDate(issued)}</p>
            <p>Valid until: <span className="font-semibold">{fmtDate(quote.validUntil)}</span></p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-ink-500">Prepared for</p>
            {company && <p className="mt-1 text-sm font-semibold">{company.name}</p>}
            {contact && <p className={company ? "" : "mt-1 text-sm font-semibold"}>{fullName(contact)}</p>}
            {company?.address && <p className="whitespace-pre-wrap text-ink-700">{company.address}</p>}
            {company?.npwp && <p>NPWP {company.npwp}</p>}
            {contact?.email && <p>{contact.email}</p>}
            {contact?.phone && <p>{contact.phone}</p>}
            {!company && !contact && <p className="mt-1 text-ink-500">—</p>}
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-ink-500">Prepared by</p>
            <p className="mt-1 text-sm font-semibold">{preparedBy?.name ?? COMPANY.name}</p>
            <p>{preparedBy?.email ?? COMPANY.email}</p>
            <p>{COMPANY.phone} · {COMPANY.website}</p>
            <p className="mt-2 text-[9px] font-semibold uppercase tracking-widest text-ink-500">Subject</p>
            <p className="font-medium">{quote.title}</p>
          </div>
        </section>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="bg-brand-700 text-left text-[10px] uppercase tracking-wide text-white">
              <th className="px-2 py-1.5 w-7">#</th><th className="px-2 py-1.5">Description</th><th className="px-2 py-1.5 text-right w-12">Qty</th><th className="px-2 py-1.5 text-right w-32">Unit price</th><th className="px-2 py-1.5 text-right w-32">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((ln, i) => (
              <tr key={ln.id} className="border-b border-slate-200 align-top">
                <td className="px-2 py-1.5 text-ink-500">{i + 1}</td>
                <td className="px-2 py-1.5">{ln.description}{ln.note && <span className="block text-[10px] text-ink-500">{ln.note}</span>}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{ln.qty}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(ln.unitPrice)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(ln.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4} className="px-2 pt-2 text-right text-ink-500">Subtotal</td><td className="px-2 pt-2 text-right tabular-nums">{money(totals.subtotal)}</td></tr>
            {totals.discount > 0 && <tr><td colSpan={4} className="px-2 text-right text-ink-500">Discount</td><td className="px-2 text-right tabular-nums">− {money(totals.discount)}</td></tr>}
            <tr className="text-sm font-bold text-brand-700"><td colSpan={4} className="px-2 pt-1 text-right">Total ({quote.currency})</td><td className="border-t-2 border-brand-700 px-2 pt-1 text-right tabular-nums">{money(quote.total)}</td></tr>
          </tfoot>
        </table>
        <p className="mt-1 text-[10px] text-ink-500">All services are paid in advance. Government fees (PNBP) are included where stated; invoices are due {COMPANY.invoiceDueWorkingDays} working days after issue.</p>

        {(quote.scopeNotes || docs.length > 0) && (
          <section className="mt-5 grid grid-cols-2 gap-6">
            {quote.scopeNotes && <div><p className="text-[9px] font-semibold uppercase tracking-widest text-ink-500">Scope</p><p className="mt-1 whitespace-pre-wrap">{quote.scopeNotes}</p></div>}
            {docs.length > 0 && <div><p className="text-[9px] font-semibold uppercase tracking-widest text-ink-500">Documents needed from you</p><ul className="mt-1 list-disc space-y-0.5 pl-4">{docs.map((d, i) => <li key={i}>{d}</li>)}</ul></div>}
          </section>
        )}

        <section className="mt-5">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-ink-500">Terms and conditions</p>
          <p className="mt-1 whitespace-pre-wrap text-[10px] text-ink-700">{quote.terms}</p>
        </section>

        <section className="mt-8 grid grid-cols-2 gap-6">
          <div><p className="text-[9px] font-semibold uppercase tracking-widest text-ink-500">Prepared by</p><div className="mt-10 border-t border-ink-500 pt-1"><p className="font-semibold">{preparedBy?.name ?? ""}</p><p className="text-ink-500">{COMPANY.name}</p></div></div>
          <div><p className="text-[9px] font-semibold uppercase tracking-widest text-ink-500">Accepted by the client</p><div className="mt-10 border-t border-ink-500 pt-1"><p className="font-semibold">{contact ? fullName(contact) : company?.name ?? ""}</p><p className="text-ink-500">Name, signature and date</p></div></div>
        </section>

        <footer className="mt-10 border-t border-slate-300 pt-3 text-[9px] text-ink-500">
          <div className="grid grid-cols-2 gap-6">
            <p><span className="font-semibold text-ink-700">Bali office</span><br />{COMPANY.baliOffice}</p>
            <p><span className="font-semibold text-ink-700">Jakarta office</span><br />{COMPANY.jakartaOffice}</p>
          </div>
          <p className="mt-2">{COMPANY.name} · {COMPANY.email} · {COMPANY.phone} · {COMPANY.website}</p>
        </footer>
      </div>
    </div>
  );
}
