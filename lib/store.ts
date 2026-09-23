import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Order, OrderStatus } from "./schema";

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
  currency: string;
  airwallex_intent_id: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  ops_notes: string | null;
  email: string;
  phone: string;
  payload: Omit<Order, "id" | "createdAt" | "status" | "amountCents" | "currency" | "airwallexIntentId" | "paidAt" | "deliveredAt" | "opsNotes">;
};

function toOrder(r: OrderRow): Order {
  return {
    ...r.payload,
    id: r.id,
    createdAt: r.created_at,
    status: r.status,
    amountCents: r.amount_cents,
    currency: r.currency,
    airwallexIntentId: r.airwallex_intent_id ?? undefined,
    paidAt: r.paid_at ?? undefined,
    deliveredAt: r.delivered_at ?? undefined,
    opsNotes: r.ops_notes ?? undefined,
  };
}
function toRow(o: Order): OrderRow {
  const { id, createdAt, status, amountCents, currency, airwallexIntentId, paidAt, deliveredAt, opsNotes, ...payload } = o;
  return {
    id, created_at: createdAt, status, amount_cents: amountCents, currency,
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
