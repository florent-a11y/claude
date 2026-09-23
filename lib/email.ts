import "server-only";
import type { Order, Reminder } from "./schema";
import { money, PRODUCT_LABELS } from "./pricing";
import { site } from "./config";
import { formatWindowOpens } from "./window";

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

export interface Attachment { filename: string; content: Buffer; contentType: string }

/** Sends the QR code / e-VOA to the traveler. Attachments are the files ops uploaded in the console. */
export async function sendDeliveryEmail(order: Order, attachments: Attachment[], message: string) {
  const lead = order.travelers[0];
  const isAc = order.product !== "evoa";
  const isEv = order.product !== "arrival_card";
  const what = isAc && isEv ? "arrival card QR code and e-VOA" : isAc ? "arrival card QR code" : "e-VOA";
  const subject = `Your Indonesia ${what} – ${lead.familyName}, ${lead.givenNames} – arrival ${order.travel.arrivalDate}`;
  const lines = [
    `Dear ${lead.givenNames},`,
    `Your ${what} ${attachments.length > 1 ? "documents are" : "is"} attached to this email.`,
    isAc ? "At the airport: show the QR code (on your phone or printed) together with your passport at immigration, and again at customs. One QR code per traveler." : "",
    isEv ? "Print the e-VOA or keep it on your phone and present it at immigration with your passport and your return ticket. It is valid for 30 days and can be extended once in Indonesia." : "",
    "Please check that names, passport numbers and dates match your passports exactly and tell us immediately if anything is wrong.",
    message.trim(),
    `Have a good trip. Questions: reply to this email or write to ${site.supportEmail}.`,
    `${site.company} is a private assistance service and is not affiliated with any government website.`,
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
    `Contact: ${order.contact.email} · ${order.contact.phone}`,
    order.evoa ? `e-VOA entry ${order.evoa.intendedEntryDate}, purpose ${order.evoa.purpose}, documents uploaded: ${order.evoa.documents.length}` : "",
    "", `Open in ops console: ${url}`,
  ].filter((l) => l !== undefined);
  const text = lines.join("\n");
  const html = `<div style="font-family:system-ui;font-size:15px;line-height:1.5">${lines.map((l) => l ? `<p>${esc(l)}</p>` : "").join("")}<p><a href="${url}" style="background:#0f7a5f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open order</a></p></div>`;
  return send(to, subject, html, text);
}

export async function sendCustomerConfirmation(order: Order) {
  const lead = order.travelers[0];
  const isAc = order.product !== "evoa";
  const isEv = order.product !== "arrival_card";
  const subject = `We received your ${PRODUCT_LABELS[order.product].toLowerCase()} order ${order.id.slice(0, 8).toUpperCase()}`;
  const lines = [
    `Dear ${lead.givenNames},`,
    `Thank you. We have received your order and payment of ${money(order.amountCents, order.currency)} for ${order.travelers.length} traveler${order.travelers.length > 1 ? "s" : ""}.`,
    isAc ? `Arrival card: a team member checks your details and submits the card inside the 72-hour window before your arrival on ${order.travel.arrivalDate}. You will receive the QR code by email.` : "",
    isEv ? `e-VOA: we verify your passport scan and photo and lodge the application within ${order.contact.express ? 12 : 48} hours. Approval by the authorities usually follows the same day, at most 2 working days.` : "",
    `Questions? Reply to this email or write to ${site.supportEmail}.`,
    `${site.company} is a private assistance service and is not affiliated with any government website.`,
  ].filter(Boolean);
  const text = lines.join("\n\n");
  const html = `<div style="font-family:system-ui;font-size:15px;line-height:1.5">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>`;
  return send([order.contact.email], subject, html, text);
}

// ---------- Reminder list ----------
const NOT_GOV = `${site.company} is a private assistance service and is not affiliated with any government website.`;

function reminderLinks(r: Reminder) {
  const apply = `${site.url}/apply?arrival=${r.arrivalDate}&email=${encodeURIComponent(r.email)}&product=${r.productInterest}&ref=reminder`;
  const unsubscribe = `${site.url}/api/reminders/unsubscribe?token=${encodeURIComponent(r.token)}`;
  return { apply, unsubscribe };
}

function reminderHtml(lines: string[], button: { href: string; label: string }, unsubscribe: string) {
  return `<div style="font-family:system-ui;font-size:15px;line-height:1.5">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}` +
    `<p><a href="${button.href}" style="background:#e8632b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${esc(button.label)}</a></p>` +
    `<p style="font-size:12px;color:#5f6f69">No longer travelling? <a href="${unsubscribe}">Stop these emails</a>.</p></div>`;
}

/** Sent once the official 72-hour window for the reminder's arrival date is open. */
export async function sendReminderWindowOpen(r: Reminder) {
  const { apply, unsubscribe } = reminderLinks(r);
  const isAc = r.productInterest !== "evoa";
  const subject = `Indonesia arrival card: your submission window is open (arrival ${r.arrivalDate})`;
  const lines = [
    "Hello,",
    `You asked us to tell you when the arrival card can be submitted for your arrival in Indonesia on ${r.arrivalDate}. That moment has come: the official portal now accepts submissions for your date.`,
    isAc
      ? `If you would like us to prepare and check the card for ${r.travelers} traveler${r.travelers > 1 ? "s" : ""}, open the link below. Your arrival date and email are already filled in.`
      : "Open the link below to start your application. Your arrival date and email are already filled in.",
    "If you prefer to do it yourself, the guide on our website explains every field.",
    `Questions? Reply to this email or write to ${site.supportEmail}.`,
    NOT_GOV,
  ];
  const text = [...lines, `Start: ${apply}`, `Stop these emails: ${unsubscribe}`].join("\n\n");
  return send([r.email], subject, reminderHtml(lines, { href: apply, label: "Start my application" }, unsubscribe), text);
}

/** Short heads-up sent roughly a day before the window opens. */
export async function sendReminderHeadsUp(r: Reminder) {
  const { apply, unsubscribe } = reminderLinks(r);
  const opens = formatWindowOpens(r.arrivalDate, "Asia/Jakarta");
  const subject = `Tomorrow your Indonesia arrival card window opens (arrival ${r.arrivalDate})`;
  const lines = [
    "Hello,",
    `A quick note: the official portal will accept the arrival card for your arrival on ${r.arrivalDate} from ${opens} (Jakarta time). We will email you again at that moment.`,
    "Nothing to do for now. If you want, have your passport and accommodation details ready so it takes two minutes.",
    NOT_GOV,
  ];
  const text = [...lines, `Our page: ${apply}`, `Stop these emails: ${unsubscribe}`].join("\n\n");
  return send([r.email], subject, reminderHtml(lines, { href: apply, label: "See what we need" }, unsubscribe), text);
}
