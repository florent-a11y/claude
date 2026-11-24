import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoiceDocument } from "@/lib/invoice-settings";
import { invoiceBanks, invoiceLogoUrl } from "@/lib/invoice-settings-services";
import { PrintButton } from "@/components/client";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { base, requireEntity } from "../../../shared";

export const dynamic = "force-dynamic";

/**
 * Client-facing invoice document, laid out by the entity's invoice settings (colours, logo, language, settlement
 * notes…). The PDF of lib/invoice-pdf.ts prints the same description.
 */
export default async function PrintInvoice({ params }: { params: Promise<{ entityId: string; invoiceId: string }> }) {
  const user = await requireUser();
  const { entityId, invoiceId } = await params;
  const entity = await requireEntity(entityId);
  const invoice = await db.get("invoices", invoiceId);
  if (!invoice || invoice.entityId !== entityId) notFound();
  const doc = invoiceDocument({ invoice, entity, banks: await invoiceBanks(entityId) });
  const b = base(entityId);
  return (
    <div className="mx-auto max-w-3xl pb-10">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`${b}/sales/${invoice.id}`} className="text-xs text-brand-600 underline">← Back to invoice</Link>
        <div className="flex items-center gap-3">
          {can(user, "books:write") && <Link href={`${b}/sales/settings`} className="text-xs text-brand-600 underline">Invoice settings</Link>}
          <a href={`/api/books/${entityId}/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener" className="btn-secondary">Download PDF</a>
          <PrintButton />
        </div>
      </div>
      <div className="card !p-10 print:!p-0"><InvoiceDocument doc={doc} logoSrc={invoiceLogoUrl(entity)} /></div>
    </div>
  );
}
