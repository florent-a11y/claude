import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Order, OrderStatus, Reminder } from "./schema";

export interface NewsItem {
  id: string;
  source: "imigrasi" | "beacukai" | "other";
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
}

/**
 * Storage layer. Uses Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
 * otherwise a local JSON file (dev only; never use the file store in production).
 */
let supabase: SupabaseClient | null = null;
function sb(): SupabaseClient | null {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  supabase = createClient(url, key, { auth: { persistSession: false } });
  return supabase;
}

const DATA_DIR = path.join(process.cwd(), "data");
async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}
async function writeJson(file: string, value: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, file), JSON.stringify(value, null, 2));
}

// ---------- Orders ----------
type OrderRow = {
  id: string;
  created_at: string;
  status: OrderStatus;
  amount_cents: number;
  government_fee_cents: number;
  product: string;
  currency: string;
  airwallex_intent_id: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  ops_notes: string | null;
  email: string;
  phone: string;
  payload: Omit<Order, "id" | "createdAt" | "status" | "amountCents" | "governmentFeeCents" | "currency" | "airwallexIntentId" | "paidAt" | "deliveredAt" | "opsNotes">;
};

function toOrder(r: OrderRow): Order {
  return {
    ...r.payload,
    id: r.id,
    createdAt: r.created_at,
    status: r.status,
    amountCents: r.amount_cents,
    governmentFeeCents: r.government_fee_cents ?? 0,
    currency: r.currency,
    airwallexIntentId: r.airwallex_intent_id ?? undefined,
    paidAt: r.paid_at ?? undefined,
    deliveredAt: r.delivered_at ?? undefined,
    opsNotes: r.ops_notes ?? undefined,
  };
}
function toRow(o: Order): OrderRow {
  const { id, createdAt, status, amountCents, governmentFeeCents, currency, airwallexIntentId, paidAt, deliveredAt, opsNotes, ...payload } = o;
  return {
    id, created_at: createdAt, status, amount_cents: amountCents, government_fee_cents: governmentFeeCents, product: o.product, currency,
    airwallex_intent_id: airwallexIntentId ?? null, paid_at: paidAt ?? null,
    delivered_at: deliveredAt ?? null, ops_notes: opsNotes ?? null,
    email: o.contact.email, phone: o.contact.phone, payload,
  };
}

export async function saveOrder(order: Order): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client.from("orders").upsert(toRow(order));
    if (error) throw new Error(`orders upsert: ${error.message}`);
    return;
  }
  const all = await readJson<Order[]>("orders.json", []);
  const i = all.findIndex((o) => o.id === order.id);
  if (i >= 0) all[i] = order; else all.unshift(order);
  await writeJson("orders.json", all);
}

export async function getOrder(id: string): Promise<Order | null> {
  const client = sb();
  if (client) {
    const { data, error } = await client.from("orders").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toOrder(data as OrderRow) : null;
  }
  const all = await readJson<Order[]>("orders.json", []);
  return all.find((o) => o.id === id) ?? null;
}

export async function findOrderByIntent(intentId: string): Promise<Order | null> {
  const client = sb();
  if (client) {
    const { data } = await client.from("orders").select("*").eq("airwallex_intent_id", intentId).maybeSingle();
    return data ? toOrder(data as OrderRow) : null;
  }
  const all = await readJson<Order[]>("orders.json", []);
  return all.find((o) => o.airwallexIntentId === intentId) ?? null;
}

export async function listOrders(opts: { status?: OrderStatus; limit?: number } = {}): Promise<Order[]> {
  const client = sb();
  if (client) {
    let q = client.from("orders").select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 200);
    if (opts.status) q = q.eq("status", opts.status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data as OrderRow[]).map(toOrder);
  }
  const all = await readJson<Order[]>("orders.json", []);
  return all.filter((o) => !opts.status || o.status === opts.status).slice(0, opts.limit ?? 200);
}

export async function updateOrder(id: string, patch: Partial<Order>): Promise<Order | null> {
  const current = await getOrder(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  await saveOrder(next);
  return next;
}

// ---------- Reminders (waitlist) ----------
type ReminderRow = {
  id: string;
  email: string;
  arrival_date: string;
  travelers: number;
  nationality: string | null;
  product_interest: string;
  locale: string;
  source: string | null;
  created_at: string;
  notified_at: string | null;
  notified_early_at: string | null;
  unsubscribed_at: string | null;
  converted_order_id: string | null;
  token: string;
};

function toReminder(r: ReminderRow): Reminder {
  return {
    id: r.id,
    email: r.email,
    arrivalDate: r.arrival_date,
    travelers: r.travelers,
    nationality: r.nationality ?? undefined,
    productInterest: r.product_interest as Reminder["productInterest"],
    locale: r.locale,
    source: r.source ?? undefined,
    createdAt: r.created_at,
    notifiedAt: r.notified_at ?? undefined,
    notifiedEarlyAt: r.notified_early_at ?? undefined,
    unsubscribedAt: r.unsubscribed_at ?? undefined,
    convertedOrderId: r.converted_order_id ?? undefined,
    token: r.token,
  };
}
function toReminderRow(r: Reminder): ReminderRow {
  return {
    id: r.id, email: r.email, arrival_date: r.arrivalDate, travelers: r.travelers, nationality: r.nationality ?? null,
    product_interest: r.productInterest, locale: r.locale, source: r.source ?? null, created_at: r.createdAt,
    notified_at: r.notifiedAt ?? null, notified_early_at: r.notifiedEarlyAt ?? null, unsubscribed_at: r.unsubscribedAt ?? null,
    converted_order_id: r.convertedOrderId ?? null, token: r.token,
  };
}

/** Insert or replace by id. Callers that want "same email + date" semantics use findReminder first. */
export async function saveReminder(reminder: Reminder): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client.from("reminders").upsert(toReminderRow(reminder));
    if (error) throw new Error(`reminders upsert: ${error.message}`);
    return;
  }
  const all = await readJson<Reminder[]>("reminders.json", []);
  const i = all.findIndex((r) => r.id === reminder.id);
  if (i >= 0) all[i] = reminder; else all.unshift(reminder);
  await writeJson("reminders.json", all);
}

export async function getReminder(id: string): Promise<Reminder | null> {
  const client = sb();
  if (client) {
    const { data, error } = await client.from("reminders").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toReminder(data as ReminderRow) : null;
  }
  const all = await readJson<Reminder[]>("reminders.json", []);
  return all.find((r) => r.id === id) ?? null;
}

export async function getReminderByToken(token: string): Promise<Reminder | null> {
  if (!token) return null;
  const client = sb();
  if (client) {
    const { data, error } = await client.from("reminders").select("*").eq("token", token).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toReminder(data as ReminderRow) : null;
  }
  const all = await readJson<Reminder[]>("reminders.json", []);
  return all.find((r) => r.token === token) ?? null;
}

/** Same person, same arrival date (email compared case-insensitively). */
export async function findReminder(email: string, arrivalDate: string): Promise<Reminder | null> {
  const e = email.trim().toLowerCase();
  const client = sb();
  if (client) {
    const { data, error } = await client.from("reminders").select("*").ilike("email", e).eq("arrival_date", arrivalDate).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toReminder(data as ReminderRow) : null;
  }
  const all = await readJson<Reminder[]>("reminders.json", []);
  return all.find((r) => r.email.toLowerCase() === e && r.arrivalDate === arrivalDate) ?? null;
}

/** `due` = not yet notified and not unsubscribed. Sorted by arrival date, soonest first. */
export async function listReminders(opts: { due?: boolean; limit?: number } = {}): Promise<Reminder[]> {
  const client = sb();
  if (client) {
    let q = client.from("reminders").select("*").order("arrival_date", { ascending: true }).limit(opts.limit ?? 500);
    if (opts.due) q = q.is("notified_at", null).is("unsubscribed_at", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data as ReminderRow[]).map(toReminder);
  }
  const all = await readJson<Reminder[]>("reminders.json", []);
  return all
    .filter((r) => !opts.due || (!r.notifiedAt && !r.unsubscribedAt))
    .sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, opts.limit ?? 500);
}

export async function updateReminder(id: string, patch: Partial<Reminder>): Promise<Reminder | null> {
  const current = await getReminder(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  await saveReminder(next);
  return next;
}

// ---------- News ----------
export async function listNews(limit = 30): Promise<NewsItem[]> {
  const client = sb();
  if (client) {
    const { data, error } = await client.from("news_items").select("*").order("published_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data as Array<Record<string, string>>).map((r) => ({
      id: r.id, source: r.source as NewsItem["source"], title: r.title, url: r.url, summary: r.summary, publishedAt: r.published_at,
    }));
  }
  const all = await readJson<NewsItem[]>("news.json", []);
  return all.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, limit);
}

export async function upsertNews(items: NewsItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const client = sb();
  if (client) {
    const rows = items.map((i) => ({ id: i.id, source: i.source, title: i.title, url: i.url, summary: i.summary, published_at: i.publishedAt }));
    const { error } = await client.from("news_items").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return rows.length;
  }
  const all = await readJson<NewsItem[]>("news.json", []);
  const byId = new Map(all.map((n) => [n.id, n]));
  for (const i of items) byId.set(i.id, i);
  await writeJson("news.json", [...byId.values()]);
  return items.length;
}
