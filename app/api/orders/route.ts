import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { orderInputSchema, type Order } from "@/lib/schema";
import { quote } from "@/lib/pricing";
import { saveOrder } from "@/lib/store";
import { airwallexConfigured, createPaymentIntent, hostedCheckoutUrl } from "@/lib/airwallex";
import { site } from "@/lib/config";
import { onOrderPaid } from "@/lib/notify";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = orderInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }
  const input = parsed.data;
  const q = quote(input.travelers.length, input.contact.express, input.product);
  const order: Order = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "pending_payment",
    amountCents: q.total,
    governmentFeeCents: q.governmentFee,
    currency: q.currency,
  };

  if (!airwallexConfigured()) {
    // Dev mode: no payment provider yet. Persist the order and go straight to the success page.
    order.status = "paid";
    order.paidAt = new Date().toISOString();
    order.activity = [{ at: order.paidAt, by: "system", action: "paid (dev mode)" }];
    await saveOrder(order);
    await onOrderPaid(order);
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

  const redirectUrl = hostedCheckoutUrl(intent, {
    successUrl: `${site.url}/apply/success?order=${order.id}`,
    failUrl: `${site.url}/apply?failed=1&order=${order.id}`,
    countryCode: input.travelers[0].nationality,
  });
  return NextResponse.json({ orderId: order.id, redirectUrl });
}
