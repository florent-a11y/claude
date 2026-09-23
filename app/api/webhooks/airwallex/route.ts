import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/airwallex";
import { findOrderByIntent, updateOrder } from "@/lib/store";

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

  if (event.name === "payment_intent.succeeded" && order.status === "pending_payment") {
    await updateOrder(order.id, { status: "paid", paidAt: new Date().toISOString() });
  } else if (event.name === "payment_intent.cancelled") {
    await updateOrder(order.id, { status: "cancelled" });
  } else if (event.name.startsWith("refund.") && event.name.endsWith("succeeded")) {
    await updateOrder(order.id, { status: "refunded" });
  }
  return NextResponse.json({ ok: true });
}
