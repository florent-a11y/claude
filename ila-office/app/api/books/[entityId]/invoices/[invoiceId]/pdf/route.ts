import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { defaultPaymentInstructions } from "@/app/books/[entityId]/sales/_data";

export const runtime = "nodejs";

/** Downloads the invoice as a PDF (the same file that "Send to client" attaches). */
export async function GET(_req: Request, ctx: { params: Promise<{ entityId: string; invoiceId: string }> }) {
  const user = await guard("read");
  if (user instanceof Response) return user;
  const { entityId, invoiceId } = await ctx.params;
  const [entity, invoice] = await Promise.all([db.get("entities", entityId), db.get("invoices", invoiceId)]);
  if (!entity || !invoice || invoice.entityId !== entityId) return new Response("Not found", { status: 404 });
  const pdf = await renderInvoicePdf(invoice, entity, { paymentInstructions: invoice.paymentInstructions ?? (await defaultPaymentInstructions(entityId)) });
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${invoice.number}.pdf"`, "cache-control": "private, no-store" },
  });
}
