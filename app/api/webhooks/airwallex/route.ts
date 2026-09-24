import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/airwallex";
import { findOrderByIntent, updateOrder } from "@/lib/store";
import { onOrderPaid, onOrderUpdated } from "@/lib/notify";
import { sendPurchaseEvents } from "@/lib/tracking";
import type { Activity } from "@/lib/schema";

export const runtime = "nodejs";

type AirwallexEvent = { id?: string; name?: string; data?: { object?: { id?: string; merchant_order_id?: string } } };

export async function POST(req: Request) {
  const timestamp = req.headers.get("x-timestamp");
  const signature = req.headers.get("x-signature");
  if (!timestamp || !signature) return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });

  const raw = await req.text();
  if (!verifyWebhook(raw, timestamp, signature)) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

  let event: AirwallexEvent;
  try { event = JSON.parse(raw) as AirwallexEvent; } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const name = typeof event.name === "string" ? event.name : "";
  const eventId = typeof event.id === "string" ? event.id.slice(0, 120) : undefined;
  const intentId = event.data?.object?.id;
  if (!intentId || !name) return NextResponse.json({ ok: true });

  const order = await findOrderByIntent(intentId);
  if (!order) return NextResponse.json({ ok: true, note: "no matching order" });

  // Idempotency: Airwallex retries until it gets a 2xx, so the same event can arrive more than once.
  const activity = order.activity ?? [];
  if (eventId && activity.some((a) => a.eventId === eventId)) return NextResponse.json({ ok: true, note: "already processed" });

  const now = new Date().toISOString();
  const entry = (action: string): Activity => ({ at: now, by: "airwallex", action, ...(eventId ? { eventId } : {}) });

  if (name === "payment_intent.succeeded" && order.status === "pending_payment") {
    const paid = await updateOrder(order.id, { status: "paid", paidAt: now, activity: [...activity, entry("payment succeeded")] });
    if (paid) {
      await onOrderPaid(paid);
      await sendPurchaseEvents(paid); // server-side GA4 + Meta purchase; fires even if the customer closed the browser
    }
  } else if (name === "payment_intent.cancelled" && order.status === "pending_payment") {
    const o = await updateOrder(order.id, { status: "cancelled", activity: [...activity, entry("payment cancelled")] });
    if (o) await onOrderUpdated(o);
  } else if (name.startsWith("refund.") && name.endsWith("succeeded") && order.status !== "refunded") {
    const o = await updateOrder(order.id, { status: "refunded", activity: [...activity, entry("refund succeeded")] });
    if (o) await onOrderUpdated(o);
  }
  return NextResponse.json({ ok: true });
}
