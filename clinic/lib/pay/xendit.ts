import "server-only";
import type { Order } from "../schema";
import { site } from "../config";

/**
 * Xendit hosted invoice (payment link): QRIS, virtual-account bank transfer, e-wallets and cards in rupiah.
 * Card and wallet data never touch this server. Docs: https://developers.xendit.co/api-reference/#create-invoice
 * Test with a development key (xnd_development_…) before going live.
 */
const API = "https://api.xendit.co";

export function xenditConfigured() {
  return Boolean(process.env.XENDIT_SECRET_KEY);
}

function auth() {
  return `Basic ${Buffer.from(`${process.env.XENDIT_SECRET_KEY}:`).toString("base64")}`;
}

export interface XenditInvoice { id: string; external_id: string; status: string; invoice_url: string; expiry_date: string; amount: number }

export async function createInvoice(order: Order, urls: { success: string; failure: string }): Promise<XenditInvoice> {
  const res = await fetch(`${API}/v2/invoices`, {
    method: "POST",
    headers: { authorization: auth(), "content-type": "application/json" },
    body: JSON.stringify({
      external_id: order.id,
      amount: order.totalIdr,
      currency: "IDR",
      description: `${site.name} order ${order.id}`,
      payer_email: order.contact.email,
      customer: { given_names: order.contact.name, email: order.contact.email, mobile_number: order.contact.phone.replace(/[^\d+]/g, "") },
      invoice_duration: 24 * 60 * 60,
      success_redirect_url: urls.success,
      failure_redirect_url: urls.failure,
      locale: "en",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Xendit create invoice failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as XenditInvoice;
}

export async function getInvoice(id: string): Promise<XenditInvoice> {
  const res = await fetch(`${API}/v2/invoices/${encodeURIComponent(id)}`, { headers: { authorization: auth() }, cache: "no-store" });
  if (!res.ok) throw new Error(`Xendit get invoice failed: ${res.status}`);
  return (await res.json()) as XenditInvoice;
}

export function isPaidStatus(status: string | undefined) {
  return status === "PAID" || status === "SETTLED";
}

/** Xendit signs callbacks with the static "callback verification token" of the account, sent as x-callback-token. */
export function verifyCallbackToken(header: string | null): boolean {
  const expected = process.env.XENDIT_CALLBACK_TOKEN;
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ (b[i % b.length] ?? 0);
  return diff === 0;
}
