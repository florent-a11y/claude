import "server-only";
import { createSign } from "node:crypto";
import type { Order } from "./schema";
import { money, PRODUCT_LABELS } from "./pricing";
import { STATUS_LABELS } from "./schema";

/**
 * Optional one-way sync of orders into a Google Sheet (tab "Orders"). Uses a service account
 * with the Sheets API; no googleapis dependency. Share the sheet with the service account email.
 */
export function sheetsConfigured() {
  return Boolean(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

const HEADERS = ["Order ID", "Created", "Status", "Assignee", "Product", "Express", "Lead traveler", "Pax", "Nationality", "Arrival date", "Port", "Flight", "Email", "Phone", "Amount", "Paid at", "Delivered at", "Ops notes", "Console link"];

let cached: { token: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  if (!res.ok) throw new Error(`Google token: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}${path}`, {
    ...init, headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${await res.text()}`);
  return res.json();
}

function row(o: Order, siteUrl: string) {
  const t = o.travelers[0];
  return [o.id, o.createdAt, STATUS_LABELS[o.status], o.assignee ?? "", PRODUCT_LABELS[o.product], o.contact.express ? "yes" : "", `${t.familyName}, ${t.givenNames}`, o.travelers.length, t.nationality, o.travel.arrivalDate, o.travel.portOfEntry, o.travel.flightNumber ?? "", o.contact.email, o.contact.phone, money(o.amountCents, o.currency), o.paidAt ?? "", o.deliveredAt ?? "", o.opsNotes ?? "", `${siteUrl}/admin/orders/${o.id}`];
}

/** Insert or update the order's row (matched on column A). Creates the header row if missing. */
export async function syncOrderToSheet(order: Order, siteUrl: string): Promise<void> {
  if (!sheetsConfigured()) return;
  const tab = "Orders";
  const colA = (await api(`/values/${encodeURIComponent(tab + "!A:A")}`).catch(async (e: Error) => {
    if (!/Unable to parse range|not found/i.test(e.message)) throw e;
    await api(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }) });
    return { values: [] };
  })) as { values?: string[][] };
  const ids = (colA.values ?? []).map((r) => r[0]);
  if (ids.length === 0 || ids[0] !== HEADERS[0]) {
    await api(`/values/${encodeURIComponent(tab + "!A1")}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [HEADERS] }) });
    ids.unshift(HEADERS[0]);
  }
  const values = [row(order, siteUrl)];
  const idx = ids.indexOf(order.id);
  if (idx >= 0) {
    await api(`/values/${encodeURIComponent(`${tab}!A${idx + 1}`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values }) });
  } else {
    await api(`/values/${encodeURIComponent(tab + "!A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values }) });
  }
}
