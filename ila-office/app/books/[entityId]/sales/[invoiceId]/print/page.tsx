import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoiceOutstanding } from "@/lib/ledger";
import { fmtDate } from "@/lib/dates";
import { fmtMoney, fmtIDR } from "@/lib/money";
import { PrintButton } from "@/components/client";
import { base, requireEntity } from "../../../shared";

export const dynamic = "force-dynamic";

/** Client-facing invoice document: entity letterhead, bill-to block, lines, totals and payment instructions. */
export default async function PrintInvoice({ params }: { params: Promise<{ entityId: string; invoiceId: string }> }) {
  await requireUser();
  const { entityId, invoiceId } = await params;
  const entity = await requireEntity(entityId);
  const invoice = await db.get("invoices", invoiceId);
  if (!invoice || invoice.entityId !== entityId) notFound();
  const banks = await db.list("bank_accounts", { where: { entityId, active: true } });
  const ccy = invoice.currency;
  const m = (x: number) => (ccy === "IDR" ? fmtIDR(x) : fmtMoney(x, ccy));
  const b = base(entityId);
  return (
    <div className="mx-auto max-w-3xl pb-10">
      <div className="no-print mb-4 flex items-center justify-between"><Link href={`${b}/sales/${invoice.id}`} className="text-xs text-brand-600 underline">← Back to invoice</Link><PrintButton /></div>
      <div className="card !p-10 print:!p-0">
        <div className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xl font-bold text-brand-700">{entity.legalName}</p>
            {entity.address && <p className="text-xs text-ink-500 whitespace-pre-line">{entity.address}{entity.city ? `, ${entity.city}` : ""}</p>}
            {entity.npwp && <p className="text-xs text-ink-500">NPWP {entity.npwp}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-wide">INVOICE</p>
            <p className="text-sm font-semibold">{invoice.number}</p>
            {invoice.status === "void" && <p className="text-sm font-bold text-red-600">VOID</p>}
            {invoice.status === "draft" && <p className="text-xs text-ink-500">DRAFT</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6 py-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Bill to</p>
            <p className="font-semibold">{invoice.customer.name}</p>
            {invoice.customer.address && <p className="text-ink-700 whitespace-pre-line">{invoice.customer.address}</p>}
            {invoice.customer.npwp && <p className="text-ink-700">NPWP {invoice.customer.npwp}</p>}
            {invoice.customer.email && <p className="text-ink-700">{invoice.customer.email}</p>}
          </div>
          <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 self-start justify-self-end">
            <span className="text-ink-500">Invoice date</span><span>{fmtDate(invoice.date)}</span>
            <span className="text-ink-500">Due date</span><span className="font-semibold">{fmtDate(invoice.dueDate)}</span>
            <span className="text-ink-500">Currency</span><span>{ccy}{ccy !== "IDR" ? ` (rate ${invoice.fxRate})` : ""}</span>
            {invoice.fakturNumber && <><span className="text-ink-500">e-Faktur</span><span>{invoice.fakturNumber}</span></>}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-ink-500"><th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit price</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody>
            {invoice.lines.map((l) => <tr key={l.id} className="border-b border-slate-100"><td className="py-2 pr-3">{l.description}</td><td className="py-2 text-right tabular-nums">{l.qty}</td><td className="py-2 text-right tabular-nums">{m(l.unitPrice)}</td><td className="py-2 text-right tabular-nums">{m(l.amount)}</td></tr>)}
          </tbody>
        </table>
        <div className="ml-auto mt-4 w-72 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-ink-500">Subtotal</span><span className="tabular-nums">{m(invoice.subtotal)}</span></div>
          {invoice.discount > 0 && <div className="flex justify-between"><span className="text-ink-500">Discount</span><span className="tabular-nums">−{m(invoice.discount)}</span></div>}
          {invoice.ppnAmount > 0 ? <div className="flex justify-between"><span className="text-ink-500">PPN {Math.round(entity.tax.ppnRate * 100)}%</span><span className="tabular-nums">{m(invoice.ppnAmount)}</span></div> : <div className="flex justify-between text-xs"><span className="text-ink-500">PPN</span><span>{entity.tax.pkp ? "—" : "Not applicable (non-PKP)"}</span></div>}
          <div className="flex justify-between border-t-2 border-slate-300 pt-2 text-base font-bold"><span>Total due</span><span className="tabular-nums">{m(invoice.total)}</span></div>
          {invoice.amountPaid > 0 && <><div className="flex justify-between"><span className="text-ink-500">Paid</span><span className="tabular-nums">{m(invoice.amountPaid)}</span></div><div className="flex justify-between font-semibold"><span>Balance</span><span className="tabular-nums">{m(invoiceOutstanding(invoice))}</span></div></>}
        </div>
        <div className="mt-8 grid gap-6 border-t border-slate-200 pt-6 text-sm md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Payment instructions</p>
            <p className="mt-1 whitespace-pre-line text-ink-700">{invoice.paymentInstructions ?? (banks.length ? ["Bank transfer to:", ...banks.map((x) => `${x.bankName ?? x.name} ${x.accountNumber ?? ""} (${x.currency}) — ${entity.legalName}`)].join("\n") : "Bank transfer; details on request.")}</p>
            <p className="mt-2 text-xs text-ink-500">Please quote {invoice.number} as the transfer reference. Bank charges are borne by the payer.</p>
          </div>
          {invoice.notes && <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Notes</p><p className="mt-1 whitespace-pre-line text-ink-700">{invoice.notes}</p></div>}
        </div>
      </div>
    </div>
  );
}
