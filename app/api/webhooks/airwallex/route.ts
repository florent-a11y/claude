import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/airwallex";
import { findOrderByIntent, updateOrder } from "@/lib/store";
import { onOrderPaid, onOrderUpdated } from "@/lib/notify";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-timestamp"), req.headers.get("x-signature"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  const event = JSON.parse(raw) as { name: string; data?: { object?: { id?: string; merchant_order_id?: string } } };
  const intentId = event.data?.object?.id;
  if (!intentId) return NextResponse.json({ ok: true });

  const order = await findOrderByIntent(intentId);
  if (!order) return NextResponse.json({ ok: true, note: "no matching order" });

  const now = new Date().toISOString();
  if (event.name === "payment_intent.succeeded" && order.status === "pending_payment") {
    const paid = await updateOrder(order.id, { status: "paid", paidAt: now, activity: [...(order.activity ?? []), { at: now, by: "airwallex", action: "payment succeeded" }] });
    if (paid) await onOrderPaid(paid);
  } else if (event.name === "payment_intent.cancelled") {
    const o = await updateOrder(order.id, { status: "cancelled", activity: [...(order.activity ?? []), { at: now, by: "airwallex", action: "payment cancelled" }] });
    if (o) await onOrderUpdated(o);
  } else if (event.name.startsWith("refund.") && event.name.endsWith("succeeded")) {
    const o = await updateOrder(order.id, { status: "refunded", activity: [...(order.activity ?? []), { at: now, by: "airwallex", action: "refund succeeded" }] });
    if (o) await onOrderUpdated(o);
  }
  return NextResponse.json({ ok: true });
}
