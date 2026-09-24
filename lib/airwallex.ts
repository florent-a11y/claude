import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = () => (process.env.AIRWALLEX_ENV === "prod" ? "https://api.airwallex.com" : "https://api-demo.airwallex.com");
const CHECKOUT = () => (process.env.AIRWALLEX_ENV === "prod" ? "https://checkout.airwallex.com" : "https://checkout-demo.airwallex.com");

export function airwallexConfigured() {
  return Boolean(process.env.AIRWALLEX_CLIENT_ID && process.env.AIRWALLEX_API_KEY);
}

let cachedToken: { token: string; exp: number } | null = null;
async function token(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const res = await fetch(`${BASE()}/api/v1/authentication/login`, {
    method: "POST",
    headers: {
      "x-client-id": process.env.AIRWALLEX_CLIENT_ID!,
      "x-api-key": process.env.AIRWALLEX_API_KEY!,
      "content-type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Airwallex auth failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { token: string; expires_at: string };
  cachedToken = { token: data.token, exp: new Date(data.expires_at).getTime() };
  return data.token;
}

export interface PaymentIntent {
  id: string;
  client_secret: string;
  amount: number;
  currency: string;
  status: string;
}

/** Creates a PaymentIntent. Amount is in major units for Airwallex (e.g. 24.90). */
export async function createPaymentIntent(args: {
  orderId: string;
  amountCents: number;
  currency: string;
  email: string;
  descriptor?: string;
  returnUrl: string;
}): Promise<PaymentIntent> {
  const res = await fetch(`${BASE()}/api/v1/pa/payment_intents/create`, {
    method: "POST",
    headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
    body: JSON.stringify({
      request_id: `${args.orderId}-${Date.now()}`,
      merchant_order_id: args.orderId,
      amount: Number((args.amountCents / 100).toFixed(2)),
      currency: args.currency,
      descriptor: (args.descriptor ?? "ARRIVALCARD ASSIST").slice(0, 32),
      return_url: args.returnUrl,
      metadata: { order_id: args.orderId },
      order: { products: [{ name: "Indonesia arrival card assistance", quantity: 1, unit_price: Number((args.amountCents / 100).toFixed(2)), type: "service" }] },
      customer: { email: args.email },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Airwallex create intent failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as PaymentIntent;
}

/** Hosted Payment Page URL: card data never touches our servers. */
export function hostedCheckoutUrl(intent: PaymentIntent, opts: { successUrl: string; failUrl: string; countryCode?: string }) {
  const p = new URLSearchParams({
    intent_id: intent.id,
    client_secret: intent.client_secret,
    currency: intent.currency,
    mode: "payment",
    successUrl: opts.successUrl,
    failUrl: opts.failUrl,
    country_code: opts.countryCode ?? "HK",
  });
  return `${CHECKOUT()}/#/standalone/checkout?${p.toString()}`;
}

export async function retrievePaymentIntent(id: string): Promise<PaymentIntent> {
  const res = await fetch(`${BASE()}/api/v1/pa/payment_intents/${id}`, {
    headers: { authorization: `Bearer ${await token()}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Airwallex retrieve intent failed: ${res.status}`);
  return (await res.json()) as PaymentIntent;
}

/** Replay window: a webhook whose x-timestamp is further than this from now is rejected even with a valid signature. */
export const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Verify webhook: signature = HMAC_SHA256(secret, timestamp + rawBody), constant-time compare, and the
 * timestamp (epoch seconds or milliseconds) must be within 5 minutes of now (replay protection).
 */
export function verifyWebhook(rawBody: string, timestamp: string | null, signature: string | null, now = Date.now()): boolean {
  const secret = process.env.AIRWALLEX_WEBHOOK_SECRET;
  if (!secret || !timestamp || !signature) return false;
  if (!/^\d{10,13}$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  const tsMs = timestamp.length <= 10 ? ts * 1000 : ts;
  if (Math.abs(now - tsMs) > WEBHOOK_MAX_AGE_MS) return false;
  const expected = createHmac("sha256", secret).update(timestamp + rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
