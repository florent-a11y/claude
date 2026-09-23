import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { orderInputSchema, type Order } from "@/lib/schema";
import { quote } from "@/lib/pricing";
import { findReminder, saveOrder, updateReminder } from "@/lib/store";
import { airwallexConfigured, createPaymentIntent, hostedCheckoutUrl } from "@/lib/airwallex";
import { site } from "@/lib/config";
import { onOrderPaid } from "@/lib/notify";
import { sendPurchaseEvents } from "@/lib/tracking";
import { hoursUntilArrival, isWindowGated, WINDOW_HOURS, windowState } from "@/lib/window";

export const runtime = "nodejs";

/** Server-side attribution fields (for Meta CAPI / GA4 matching); the client cannot spoof these. */
function requestAttribution(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 200);
  return { ...(ip ? { ip: ip.slice(0, 200) } : {}), ...(userAgent ? { userAgent } : {}) };
}

/** Best effort: mark the matching reminder (same email + arrival date) as converted. Never fails the order. */
async function linkReminder(order: Order) {
  try {
    const r = await findReminder(order.contact.email, order.travel.arrivalDate);
    if (r && r.convertedOrderId !== order.id) await updateReminder(r.id, { convertedOrderId: order.id });
  } catch (e) {
    console.error("[orders] reminder link failed", (e as Error).message);
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = orderInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }
  const input = parsed.data;

  // The official portal only accepts arrival cards inside the 72 hours before arrival. We do not take payment before then.
  if (isWindowGated(input.product)) {
    const hoursLeft = hoursUntilArrival(input.travel.arrivalDate);
    const state = windowState(hoursLeft);
    if (state === "too_early") {
      return NextResponse.json({
        error: `The official portal only accepts arrival card submissions within ${WINDOW_HOURS} hours before arrival. Your arrival is about ${Math.round(hoursLeft / 24)} days away, so we cannot take payment yet. Set a reminder and we will email you when the window opens.`,
        tooEarly: true, hoursLeft,
      }, { status: 422 });
    }
    if (state === "past") {
      return NextResponse.json({ error: "The arrival date is in the past. Please check the date.", hoursLeft }, { status: 422 });
    }
  }

  const q = quote(input.travelers.length, input.contact.express, input.product);
  const order: Order = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "pending_payment",
    amountCents: q.total,
    governmentFeeCents: q.governmentFee,
    currency: q.currency,
    attribution: { ...input.attribution, ...requestAttribution(req) },
  };

  if (!airwallexConfigured()) {
    // Dev mode: no payment provider yet. Persist the order and go straight to the success page.
    order.status = "paid";
    order.paidAt = new Date().toISOString();
    order.activity = [{ at: order.paidAt, by: "system", action: "paid (dev mode)" }];
    await saveOrder(order);
    await linkReminder(order);
    await onOrderPaid(order);
    await sendPurchaseEvents(order);
    return NextResponse.json({ orderId: order.id, redirectUrl: `${site.url}/apply/success?order=${order.id}&dev=1` });
  }

  const intent = await createPaymentIntent({
    orderId: order.id,
    amountCents: order.amountCents,
    currency: order.currency,
    email: order.contact.email,
    returnUrl: `${site.url}/apply/success?order=${order.id}`,
  });
  order.airwallexIntentId = intent.id;
  await saveOrder(order);
  await linkReminder(order);

  const redirectUrl = hostedCheckoutUrl(intent, {
    successUrl: `${site.url}/apply/success?order=${order.id}`,
    failUrl: `${site.url}/apply?failed=1&order=${order.id}`,
    countryCode: input.travelers[0].nationality,
  });
  return NextResponse.json({ orderId: order.id, redirectUrl });
}
