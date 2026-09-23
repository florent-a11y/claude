import "server-only";
import { createHash } from "node:crypto";
import type { Order } from "./schema";
import { PRODUCT_LABELS } from "./pricing";
import { site } from "./config";
import { updateOrder } from "./store";
import { purchaseEventId } from "./analytics-client";

const TIMEOUT_MS = 8000;
type Outcome = "sent" | "skipped" | "failed";

const sha256 = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");
const norm = (v: string | undefined) => (v ?? "").trim().toLowerCase();
/** Meta wants digits only, with country code and no leading "+" or "00". */
function phoneDigits(v: string | undefined) {
  const d = (v ?? "").replace(/\D/g, "").replace(/^00+/, "");
  return d.length >= 6 ? d : "";
}
/** GA4 Measurement Protocol needs a client_id; when the browser cookie was not captured, derive a stable one from the order id. */
function fallbackClientId(orderId: string) {
  const h = sha256(`ga-client:${orderId}`);
  return `${parseInt(h.slice(0, 8), 16)}.${parseInt(h.slice(8, 16), 16)}`;
}

/**
 * Server-side purchase conversions (GA4 Measurement Protocol + Meta Conversions API), fired once an order is paid.
 * Never throws. Idempotent: skips when `trackingSentAt` is set, and sets it after the attempts whether they succeeded
 * or not, so a webhook retry or a redeploy cannot turn a transient outage into a flood of duplicate conversions.
 * Failures are logged; a missed conversion is cheaper than double-counted revenue in the ad accounts.
 */
export async function sendPurchaseEvents(order: Order): Promise<void> {
  try {
    if (order.trackingSentAt) return;
    const [ga4, meta] = await Promise.allSettled([sendGa4Purchase(order), sendMetaPurchase(order)]);
    const outcome = (r: PromiseSettledResult<Outcome>, name: string): Outcome => {
      if (r.status === "fulfilled") return r.value;
      console.error(`[tracking] ${name} purchase failed for order ${order.id}:`, (r.reason as Error)?.message ?? r.reason);
      return "failed";
    };
    const summary = { ga4: outcome(ga4, "GA4"), meta: outcome(meta, "Meta CAPI") };
    console.log(`[tracking] purchase events for order ${order.id}:`, JSON.stringify(summary));
    await updateOrder(order.id, { trackingSentAt: new Date().toISOString() });
  } catch (e) {
    console.error("[tracking] sendPurchaseEvents failed", (e as Error).message);
  }
}

async function post(url: string, body: unknown, label: string): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    // Never echo the URL: it carries the API secret / access token.
    const text = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`${label} responded ${res.status} ${text}`);
  }
}

/** GA4 Measurement Protocol: https://developers.google.com/analytics/devguides/collection/protocol/ga4 */
async function sendGa4Purchase(order: Order): Promise<Outcome> {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const apiSecret = process.env.GA_API_SECRET;
  if (!measurementId || !apiSecret) return "skipped";
  const a = order.attribution ?? {};
  const value = order.amountCents / 100;
  const travelers = order.travelers.length;
  const params: Record<string, unknown> = {
    transaction_id: order.id,
    value,
    currency: order.currency,
    items: [{ item_id: order.product, item_name: PRODUCT_LABELS[order.product], quantity: travelers, price: Math.round((value / travelers) * 100) / 100 }],
    // Without engagement time the event is not attributed to a session in standard reports.
    engagement_time_msec: 100,
  };
  // Campaign parameters (same names gtag uses) so the conversion keeps its source in GA4 / Google Ads.
  if (a.utmSource) params.source = a.utmSource;
  if (a.utmMedium) params.medium = a.utmMedium;
  if (a.utmCampaign) params.campaign = a.utmCampaign;
  if (a.gclid) params.gclid = a.gclid;
  const body = {
    client_id: a.gaClientId || fallbackClientId(order.id),
    timestamp_micros: Date.parse(order.paidAt ?? order.createdAt) * 1000,
    non_personalized_ads: false,
    events: [{ name: "purchase", params }],
  };
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  await post(url, body, "GA4 Measurement Protocol");
  return "sent";
}

/** Meta Conversions API: https://developers.facebook.com/docs/marketing-api/conversions-api */
async function sendMetaPurchase(order: Order): Promise<Outcome> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !token) return "skipped";
  const a = order.attribution ?? {};
  const lead = order.travelers[0];
  const value = order.amountCents / 100;

  const user_data: Record<string, unknown> = {
    em: [sha256(norm(order.contact.email))],
    fn: [sha256(norm(lead?.givenNames))],
    ln: [sha256(norm(lead?.familyName))],
    country: [sha256(norm(lead?.nationality))],
  };
  const ph = phoneDigits(order.contact.phone);
  if (ph) user_data.ph = [sha256(ph)];
  if (a.ip) user_data.client_ip_address = a.ip;
  if (a.userAgent) user_data.client_user_agent = a.userAgent;
  if (a.fbp) user_data.fbp = a.fbp;
  const fbc = a.fbc ?? (a.fbclid ? `fb.1.${Date.parse(order.createdAt)}.${a.fbclid}` : undefined);
  if (fbc) user_data.fbc = fbc;

  const event = {
    event_name: "Purchase",
    event_time: Math.floor(Date.parse(order.paidAt ?? order.createdAt) / 1000),
    event_id: purchaseEventId(order.id),
    action_source: "website",
    event_source_url: `${site.url}/apply/success`,
    user_data,
    custom_data: {
      currency: order.currency,
      value,
      content_type: "product",
      content_ids: [order.product],
      content_name: PRODUCT_LABELS[order.product],
      num_items: order.travelers.length,
      order_id: order.id,
    },
  };
  const testCode = process.env.META_CAPI_TEST_EVENT_CODE;
  const body = { data: [event], ...(testCode ? { test_event_code: testCode } : {}) };
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`;
  await post(url, body, "Meta Conversions API");
  return "sent";
}
