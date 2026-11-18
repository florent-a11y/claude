import { NextResponse } from "next/server";
import { findOrderByAirwallexIntent, getOrder } from "@/lib/store";
import { markPaid } from "@/lib/orders";
import { verifyWebhook } from "@/lib/pay/airwallex";

export const runtime = "nodejs";

type AirwallexEvent = { id?: string; name?: string; data?: { object?: { id?: string; merchant_order_id?: string } } };

/** Airwallex webhook: subscribe to payment_intent.succeeded. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-timestamp"), req.headers.get("x-signature"))) return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  let event: AirwallexEvent;
  try { event = JSON.parse(raw) as AirwallexEvent; } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const intentId = event.data?.object?.id;
  if (event.name !== "payment_intent.succeeded" || !intentId) return NextResponse.json({ ok: true });
  // The signed payload carries our order id; fall back to the intent id stored on the order.
  const merchantOrderId = event.data?.object?.merchant_order_id;
  const order = (merchantOrderId ? await getOrder(merchantOrderId) : null) ?? (await findOrderByAirwallexIntent(intentId));
  if (!order) return NextResponse.json({ ok: true, note: "no matching order" });
  await markPaid(order, "airwallex", "airwallex", event.id ? `airwallex:${event.id}` : undefined); // idempotent
  return NextResponse.json({ ok: true });
}
