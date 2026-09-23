import "server-only";
import type { Order } from "./schema";
import { money, PRODUCT_LABELS } from "./pricing";
import { site } from "./config";

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
    `Contact: ${order.contact.email} · ${order.contact.phone}${order.contact.whatsapp ? " (WhatsApp)" : ""}`,
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
    isAc ? `Arrival card: a team member checks your details and submits the card inside the 72-hour window before your arrival on ${order.travel.arrivalDate}. You will receive the QR code by email${order.contact.whatsapp ? " and WhatsApp" : ""}.` : "",
    isEv ? `e-VOA: we verify your passport scan and photo and lodge the application within ${order.contact.express ? 12 : 48} hours. Approval by the authorities usually follows the same day, at most 2 working days.` : "",
    `Questions? Reply to this email or write to ${site.supportEmail}.`,
    `${site.company} is a private assistance service and is not affiliated with any government website.`,
  ].filter(Boolean);
  const text = lines.join("\n\n");
  const html = `<div style="font-family:system-ui;font-size:15px;line-height:1.5">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>`;
  return send([order.contact.email], subject, html, text);
}
