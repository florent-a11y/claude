import { NextResponse } from "next/server";
import { getOrder } from "@/lib/store";
import { markPaid } from "@/lib/orders";
import { isPaidStatus, verifyCallbackToken } from "@/lib/pay/xendit";

export const runtime = "nodejs";

type InvoiceCallback = { id?: string; external_id?: string; status?: string; amount?: number; paid_amount?: number };

/** Xendit "invoice paid" callback. Set the URL in Xendit > Settings > Webhooks > Invoices paid. */
export async function POST(req: Request) {
  if (!verifyCallbackToken(req.headers.get("x-callback-token"))) return NextResponse.json({ error: "Bad callback token" }, { status: 401 });
  let event: InvoiceCallback;
  try { event = (await req.json()) as InvoiceCallback; } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  if (!event.id || !event.external_id || !isPaidStatus(event.status)) return NextResponse.json({ ok: true });

  const order = await getOrder(event.external_id);
  if (!order) return NextResponse.json({ ok: true, note: "no matching order" });
  // Only the invoice we created for this order, for the full amount, counts.
  if (order.xenditInvoiceId !== event.id || Number(event.amount) !== order.totalIdr) {
    console.error("[xendit] callback does not match order", order.id, event.id);
    return NextResponse.json({ ok: true, note: "mismatch" });
  }
  await markPaid(order, "xendit", "xendit", `xendit:${event.id}`); // idempotent: a repeated callback changes nothing
  return NextResponse.json({ ok: true });
}
