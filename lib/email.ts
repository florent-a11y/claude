import "server-only";
import { createTranslator } from "next-intl";
import type { Order, Reminder } from "./schema";
import { money, PRODUCT_LABELS } from "./pricing";
import { site } from "./config";
import { formatWindowOpens } from "./window";
import { loadMessages, messageFallback } from "@/i18n/messages";
import { intlLocale, routing } from "@/i18n/routing";

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function send(to: string[], subject: string, html: string, text: string) {
  if (!emailConfigured() || to.length === 0) return { skipped: true };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return { skipped: false };
}

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)); }

// ---------- Customer email language ----------
/** Customer emails are written in the language the customer used on the site (order/reminder `locale`),
 *  from the "Email" namespace of messages/<locale>.json, with English filling any gap. Ops emails stay English. */
async function customerT(locale: string | undefined) {
  const l = locale && (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  const messages = await loadMessages(l);
  // Messages are loaded dynamically, so the catalog is untyped here; keys are validated at runtime with an English fallback.
  const tr = createTranslator({ locale: l, messages: messages as Parameters<typeof createTranslator>[0]["messages"], getMessageFallback: messageFallback, onError: () => {} }) as unknown as
    (key: string, values?: Record<string, string | number | Date>) => string;
  const t = (key: string, values?: Record<string, string | number | Date>) => tr(`Email.${key}`, values);
  const m = (cents: number, currency?: string) => money(cents, currency, intlLocale(l));
  return { t, m, locale: l };
}

export interface Attachment { filename: string; content: Buffer; contentType: string }

/** Sends the QR code / e-VOA to the traveler. Attachments are the files ops uploaded in the console. */
export async function sendDeliveryEmail(order: Order, attachments: Attachment[], message: string) {
  const { t } = await customerT(order.contact.locale);
  const lead = order.travelers[0];
  const isAc = order.product !== "evoa";
  const isEv = order.product !== "arrival_card";
  const what = isAc && isEv ? t("delivery.whatBoth") : isAc ? t("delivery.whatArrivalCard") : t("delivery.whatEvoa");
  const subject = t("delivery.subject", { what, familyName: lead.familyName, givenNames: lead.givenNames, date: order.travel.arrivalDate });
  const lines = [
    t("greeting", { name: lead.givenNames }),
    t("delivery.attached", { what, count: attachments.length }),
    isAc ? t("delivery.arrivalCard") : "",
    isEv ? t("delivery.evoa") : "",
    t("delivery.check"),
    message.trim(),
    t("delivery.questions", { email: site.supportEmail }),
    t("notAffiliated", { company: site.company }),
  ].filter(Boolean);
  const text = lines.join("\n\n");
  const html = `<div style="font-family:system-ui;font-size:15px;line-height:1.5">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>`;
  if (!emailConfigured()) return { skipped: true };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [order.contact.email], subject, html, text,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64"), content_type: a.contentType })) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return { skipped: false };
}

/** Ops alert: always English. */
export async function notifyOpsNewOrder(order: Order) {
  const to = (process.env.OPS_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const lead = order.travelers[0];
  const url = `${site.url}/admin/orders/${order.id}`;
  const subject = `[${order.contact.express ? "EXPRESS " : ""}NEW] ${PRODUCT_LABELS[order.product]} · ${lead.familyName}, ${lead.givenNames} · arrival ${order.travel.arrivalDate} · ${order.travelers.length} pax`;
  const lines = [
    `Order ${order.id.slice(0, 8).toUpperCase()} · ${money(order.amountCents, order.currency)} paid`,
    `Product: ${PRODUCT_LABELS[order.product]}${order.contact.express ? " (EXPRESS)" : ""}`,
    `Arrival: ${order.travel.arrivalDate} at ${order.travel.portOfEntry}, flight ${order.travel.flightNumber || "n/a"}`,
    `Travelers: ${order.travelers.map((t) => `${t.familyName} ${t.givenNames} (${t.nationality})`).join("; ")}`,
    `Contact: ${order.contact.email} · ${order.contact.phone} · language ${order.contact.locale ?? "en"}`,
    order.evoa ? `e-VOA entry ${order.evoa.intendedEntryDate}, purpose ${order.evoa.purpose}, documents uploaded: ${order.evoa.documents.length}` : "",
    "", `Open in ops console: ${url}`,
  ].filter((l) => l !== undefined);
  const text = lines.join("\n");
  const html = `<div style="font-family:system-ui;font-size:15px;line-height:1.5">${lines.map((l) => l ? `<p>${esc(l)}</p>` : "").join("")}<p><a href="${url}" style="background:#0f7a5f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open order</a></p></div>`;
  return send(to, subject, html, text);
}

export async function sendCustomerConfirmation(order: Order) {
  const { t, m } = await customerT(order.contact.locale);
  const lead = order.travelers[0];
  const isAc = order.product !== "evoa";
  const isEv = order.product !== "arrival_card";
  const subject = t("confirmation.subject", { product: t(`products.${order.product}`), id: order.id.slice(0, 8).toUpperCase() });
  const lines = [
    t("greeting", { name: lead.givenNames }),
    t("confirmation.received", { amount: m(order.amountCents, order.currency), count: order.travelers.length }),
    isAc ? t("confirmation.arrivalCard", { date: order.travel.arrivalDate }) : "",
    isEv ? t("confirmation.evoa", { hours: order.contact.express ? 12 : 48 }) : "",
    t("questions", { email: site.supportEmail }),
    t("notAffiliated", { company: site.company }),
  ].filter(Boolean);
  const text = lines.join("\n\n");
  const html = `<div style="font-family:system-ui;font-size:15px;line-height:1.5">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>`;
  return send([order.contact.email], subject, html, text);
}

// ---------- Reminder list ----------
function reminderLinks(r: Reminder) {
  const prefix = r.locale && r.locale !== routing.defaultLocale && (routing.locales as readonly string[]).includes(r.locale) ? `/${r.locale}` : "";
  const apply = `${site.url}${prefix}/apply?arrival=${r.arrivalDate}&email=${encodeURIComponent(r.email)}&product=${r.productInterest}&ref=reminder`;
  const unsubscribe = `${site.url}/api/reminders/unsubscribe?token=${encodeURIComponent(r.token)}`;
  return { apply, unsubscribe };
}

// ---------- Review request ----------
/** Review links, only those configured (TRUSTPILOT_REVIEW_URL, GOOGLE_REVIEW_URL). */
export function reviewLinks() {
  const links: Array<{ href: string; key: "trustpilot" | "google" }> = [];
  const tp = (process.env.TRUSTPILOT_REVIEW_URL ?? "").trim();
  const g = (process.env.GOOGLE_REVIEW_URL ?? "").trim();
  if (tp) links.push({ href: tp, key: "trustpilot" });
  if (g) links.push({ href: g, key: "google" });
  return links;
}

/** Sent once, 2 days after arrival, to delivered orders. Skipped when no review link is configured. */
export async function sendReviewRequest(order: Order) {
  const configured = reviewLinks();
  if (configured.length === 0) return { skipped: true };
  const { t } = await customerT(order.contact.locale);
  const links = configured.map((l) => ({ href: l.href, label: t(`review.${l.key}`) }));
  const lead = order.travelers[0];
  const isAc = order.product !== "evoa";
  const isEv = order.product !== "arrival_card";
  const what = isAc && isEv ? t("review.whatBoth") : isAc ? t("review.whatArrivalCard") : t("review.whatEvoa");
  const subject = t("review.subject");
  const before = [
    t("greeting", { name: lead.givenNames }),
    t("review.thanks", { what, date: order.travel.arrivalDate }),
    t("review.wrong"),
    t("review.ask"),
  ];
  const after = [
    t("questions", { email: site.supportEmail }),
    t("notAffiliated", { company: site.company }),
  ];
  const text = [...before, ...links.map((l) => `${l.label}: ${l.href}`), ...after].join("\n\n");
  const html = `<div style="font-family:system-ui;font-size:15px;line-height:1.5">${before.map((l) => `<p>${esc(l)}</p>`).join("")}` +
    `<p>${links.map((l) => `<a href="${esc(l.href)}" style="display:inline-block;margin:0 8px 8px 0;background:#0f7a5f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${esc(l.label)}</a>`).join("")}</p>` +
    `${after.map((l) => `<p>${esc(l)}</p>`).join("")}</div>`;
  return send([order.contact.email], subject, html, text);
}

function reminderHtml(lines: string[], button: { href: string; label: string }, unsubscribe: string, footer: { text: string; link: string }) {
  return `<div style="font-family:system-ui;font-size:15px;line-height:1.5">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}` +
    `<p><a href="${button.href}" style="background:#e8632b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${esc(button.label)}</a></p>` +
    `<p style="font-size:12px;color:#5f6f69">${esc(footer.text)} <a href="${unsubscribe}">${esc(footer.link)}</a>.</p></div>`;
}

/** Sent once the official 72-hour window for the reminder's arrival date is open. */
export async function sendReminderWindowOpen(r: Reminder) {
  const { t } = await customerT(r.locale);
  const { apply, unsubscribe } = reminderLinks(r);
  const isAc = r.productInterest !== "evoa";
  const subject = t("windowOpen.subject", { date: r.arrivalDate });
  const lines = [
    t("hello"),
    t("windowOpen.open", { date: r.arrivalDate }),
    isAc ? t("windowOpen.assist", { count: r.travelers }) : t("windowOpen.start"),
    t("windowOpen.diy"),
    t("questions", { email: site.supportEmail }),
    t("notAffiliated", { company: site.company }),
  ];
  const text = [...lines, `${t("windowOpen.startLabel")}: ${apply}`, `${t("stopEmails")}: ${unsubscribe}`].join("\n\n");
  return send([r.email], subject, reminderHtml(lines, { href: apply, label: t("windowOpen.cta") }, unsubscribe, { text: t("noLongerTravelling"), link: t("stopEmails") }), text);
}

/** Short heads-up sent roughly a day before the window opens. */
export async function sendReminderHeadsUp(r: Reminder) {
  const { t, locale } = await customerT(r.locale);
  const { apply, unsubscribe } = reminderLinks(r);
  const opens = formatWindowOpens(r.arrivalDate, "Asia/Jakarta", intlLocale(locale));
  const subject = t("headsUp.subject", { date: r.arrivalDate });
  const lines = [
    t("hello"),
    t("headsUp.note", { date: r.arrivalDate, opens }),
    t("headsUp.nothing"),
    t("notAffiliated", { company: site.company }),
  ];
  const text = [...lines, `${t("headsUp.pageLabel")}: ${apply}`, `${t("stopEmails")}: ${unsubscribe}`].join("\n\n");
  return send([r.email], subject, reminderHtml(lines, { href: apply, label: t("headsUp.cta") }, unsubscribe, { text: t("noLongerTravelling"), link: t("stopEmails") }), text);
}
