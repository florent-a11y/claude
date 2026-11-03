import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderBupotPdf } from "@/lib/tax/bupot-pdf";

export const runtime = "nodejs";

/** Downloads a bukti potong as a PDF in the Coretax layout (the same content as the printable slip page). */
export async function GET(_req: Request, ctx: { params: Promise<{ entityId: string; slipId: string }> }) {
  const { entityId, slipId } = await ctx.params;
  const user = await guard("read", entityId);
  if (user instanceof Response) return user;
  const [entity, slip] = await Promise.all([db.get("entities", entityId), db.get("withholding_slips", slipId)]);
  if (!entity || !slip || slip.entityId !== entityId) return new Response("Not found", { status: 404 });
  const bill = slip.billId ? await db.get("bills", slip.billId) : null;
  const billNumber = bill ? bill.vendorInvoiceNumber ?? bill.number : undefined;
  const pdf = await renderBupotPdf({ slip, entity, billNumber });
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${slip.number}.pdf"`, "cache-control": "private, no-store" },
  });
}
