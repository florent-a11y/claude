import "server-only";
import { createTranslator } from "next-intl";
import type { Order } from "./schema";
import { site } from "./config";
import { idr } from "./money";
import { orderUrl } from "./links";
import { loadMessages, messageFallback } from "@/i18n/messages";
import { routing } from "@/i18n/routing";

/** Transactional email through Resend. Optional: without RESEND_API_KEY and EMAIL_FROM nothing is sent. */
export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function send(to: string[], subject: string, html: string, text: string) {
  if (!emailConfigured() || to.length === 0) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html, text, ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

async function translator(locale: string) {
  const l = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  const messages = await loadMessages(l);
  const tr = createTranslator({ locale: l, messages: messages as Parameters<typeof createTranslator>[0]["messages"], getMessageFallback: messageFallback, onError: () => {} }) as unknown as
    (key: string, values?: Record<string, string | number>) => string;
  return { t: (key: string, values?: Record<string, string | number>) => tr(`Email.${key}`, values), locale: l };
}

export type CustomerEmail = "received" | "approved" | "declined" | "confirmed" | "onTheWay";

/** The message for a customer at a given moment, in their language: used for the email and for the WhatsApp button in the console. */
export async function customerMessage(order: Order, kind: CustomerEmail): Promise<{ subject: string; paragraphs: string[]; url: string; viewOrder: string; signoff: string }> {
  const { t, locale } = await translator(order.contact.locale);
  const v = { brand: site.name, id: order.id, name: order.contact.name.split(" ")[0], amount: idr(order.totalIdr, locale) };
  let body: string;
  if (kind === "received") body = order.status === "awaiting_review" ? t("received.review", v) : order.paymentMethod === "cod" ? t("received.cod", v) : t("received.pay", v);
  else if (kind === "approved") body = order.review?.decision === "partly_approved" ? t("approved.partly", v) : t("approved.text", v);
  else body = t(`${kind}.text`, v);
  const note = (kind === "approved" || kind === "declined") && order.review?.note ? t("doctorNote", { note: order.review.note }) : "";
  return { subject: t(`${kind}.subject`, v), paragraphs: [t("greeting", v), body, note].filter(Boolean), url: orderUrl(order), viewOrder: t("viewOrder"), signoff: t("signoff", v) };
}

/** Email to the customer in the language they used on the site. Never throws: an email problem must not break an order. */
export async function emailCustomer(order: Order, kind: CustomerEmail): Promise<void> {
  try {
    if (!emailConfigured()) return;
    const m = await customerMessage(order, kind);
    const html = `<div style="font-family:Georgia,serif;color:#1f2a24;max-width:520px;margin:auto;padding:24px">
<p style="font-size:22px;letter-spacing:.04em;margin:0 0 20px">${esc(site.name)}</p>
${m.paragraphs.map((p) => `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">${esc(p)}</p>`).join("\n")}
<p style="margin:28px 0"><a href="${esc(m.url)}" style="font-family:Arial,sans-serif;background:#27433a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:15px">${esc(m.viewOrder)}</a></p>
<p style="font-family:Arial,sans-serif;font-size:14px;color:#5d6b63">${esc(m.signoff)}</p></div>`;
    const text = [...m.paragraphs, `${m.viewOrder}: ${m.url}`, m.signoff].join("\n\n");
    await send([order.contact.email], m.subject, html, text);
  } catch (e) {
    console.error("[email] customer", kind, order.id, e);
  }
}

/** Plain English alert to the team (OPS_EMAIL, comma-separated). Never throws. */
export async function emailOps(subject: string, lines: string[]): Promise<void> {
  try {
    const to = (process.env.OPS_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!emailConfigured() || to.length === 0) return;
    const text = lines.join("\n");
    await send(to, `[${site.name}] ${subject}`, `<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${esc(text)}</pre>`, text);
  } catch (e) {
    console.error("[email] ops", subject, e);
  }
}
