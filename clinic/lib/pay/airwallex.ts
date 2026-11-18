import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Order } from "../schema";
import { site } from "../config";

/**
 * Airwallex hosted payment page for international cards. Prices are in rupiah; the card is charged in
 * AIRWALLEX_CURRENCY (default USD) at the fixed rate IDR_PER_USD that you set and keep up to date.
 */
const BASE = () => (process.env.AIRWALLEX_ENV === "prod" ? "https://api.airwallex.com" : "https://api-demo.airwallex.com");
const CHECKOUT = () => (process.env.AIRWALLEX_ENV === "prod" ? "https://checkout.airwallex.com" : "https://checkout-demo.airwallex.com");

function rate(): number {
  const r = Number(process.env.IDR_PER_USD);
  return Number.isFinite(r) && r > 1000 ? r : 0;
}
export function cardCurrency() {
  return (process.env.AIRWALLEX_CURRENCY ?? "USD").toUpperCase();
}
export function airwallexConfigured() {
  return Boolean(process.env.AIRWALLEX_CLIENT_ID && process.env.AIRWALLEX_API_KEY && rate());
}
/** Card amount in major units (e.g. 84.35), rounded up to the cent. 0 when no rate is set. */
export function cardAmount(totalIdr: number): number {
  const r = rate();
  return r ? Math.ceil((totalIdr / r) * 100) / 100 : 0;
}

let cachedToken: { token: string; exp: number } | null = null;
async function token(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const res = await fetch(`${BASE()}/api/v1/authentication/login`, {
    method: "POST",
    headers: { "x-client-id": process.env.AIRWALLEX_CLIENT_ID!, "x-api-key": process.env.AIRWALLEX_API_KEY!, "content-type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Airwallex auth failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { token: string; expires_at: string };
  cachedToken = { token: data.token, exp: new Date(data.expires_at).getTime() };
  return data.token;
}

export interface PaymentIntent { id: string; client_secret: string; amount: number; currency: string; status: string }

export async function createPaymentIntent(order: Order, returnUrl: string): Promise<PaymentIntent> {
  const amount = cardAmount(order.totalIdr);
  const res = await fetch(`${BASE()}/api/v1/pa/payment_intents/create`, {
    method: "POST",
    headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
    body: JSON.stringify({
      request_id: `${order.id}-${Date.now()}`,
      merchant_order_id: order.id,
      amount,
      currency: cardCurrency(),
      descriptor: site.name.toUpperCase().slice(0, 32),
      return_url: returnUrl,
      metadata: { order_id: order.id, total_idr: order.totalIdr },
      customer: { email: order.contact.email },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Airwallex create intent failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as PaymentIntent;
}

/** Hosted Payment Page URL: card data never touches our servers. */
export function hostedCheckoutUrl(intent: PaymentIntent, urls: { success: string; failure: string }) {
  const p = new URLSearchParams({
    intent_id: intent.id, client_secret: intent.client_secret, currency: intent.currency, mode: "payment",
    successUrl: urls.success, failUrl: urls.failure, country_code: "ID",
  });
  return `${CHECKOUT()}/#/standalone/checkout?${p.toString()}`;
}

export async function retrievePaymentIntent(id: string): Promise<PaymentIntent> {
  const res = await fetch(`${BASE()}/api/v1/pa/payment_intents/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${await token()}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Airwallex retrieve intent failed: ${res.status}`);
  return (await res.json()) as PaymentIntent;
}

/** Replay window: a webhook whose x-timestamp is further than this from now is rejected even with a valid signature. */
export const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

/** signature = HMAC_SHA256(secret, timestamp + rawBody), constant-time compare, timestamp within 5 minutes. */
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
