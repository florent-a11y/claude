import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Lead, Order, OrderStatus } from "./schema";

/**
 * Storage layer. Supabase (tables clinic_orders, clinic_leads; see supabase/schema.sql) when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are set, otherwise JSON files under ./data (development only: a serverless host
 * does not keep files between requests, and health answers must not sit in a plain file in production).
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
export function databaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const DATA_DIR = path.join(process.cwd(), "data");
async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf8")) as T; } catch { return fallback; }
}
async function writeJson(file: string, value: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, file), JSON.stringify(value, null, 2));
}

/**
 * The file store rewrites a whole file on every save, so two saves at the same moment could lose one of them.
 * Saves are therefore queued one after another (within this process, which is all the file store is meant for).
 */
let fileQueue: Promise<unknown> = Promise.resolve();
function queued<T>(work: () => Promise<T>): Promise<T> {
  const run = fileQueue.then(work, work);
  fileQueue = run.catch(() => undefined);
  return run;
}

type OrderRow = { id: string; created_at: string; status: OrderStatus; email: string; phone: string; total_idr: number; paid: boolean; payload: Order };
const toRow = (o: Order): OrderRow => ({ id: o.id, created_at: o.createdAt, status: o.status, email: o.contact.email, phone: o.contact.phone, total_idr: o.totalIdr, paid: o.paid, payload: o });

export async function saveOrder(order: Order): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client.from("clinic_orders").upsert(toRow(order));
    if (error) throw new Error(`clinic_orders upsert: ${error.message}`);
    return;
  }
  await queued(async () => {
    const all = await readJson<Order[]>("orders.json", []);
    const i = all.findIndex((o) => o.id === order.id);
    if (i >= 0) all[i] = order; else all.unshift(order);
    await writeJson("orders.json", all);
  });
}

export async function getOrder(id: string): Promise<Order | null> {
  if (!/^[A-Z0-9-]{4,24}$/.test(id)) return null;
  const client = sb();
  if (client) {
    const { data, error } = await client.from("clinic_orders").select("payload").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? (data.payload as Order) : null;
  }
  return (await readJson<Order[]>("orders.json", [])).find((o) => o.id === id) ?? null;
}

export async function findOrderByAirwallexIntent(intentId: string): Promise<Order | null> {
  const client = sb();
  if (client) {
    const { data } = await client.from("clinic_orders").select("payload").eq("payload->>airwallexIntentId", intentId).maybeSingle();
    return data ? (data.payload as Order) : null;
  }
  return (await readJson<Order[]>("orders.json", [])).find((o) => o.airwallexIntentId === intentId) ?? null;
}

export async function listOrders(opts: { statuses?: OrderStatus[]; limit?: number } = {}): Promise<Order[]> {
  const limit = opts.limit ?? 300;
  const client = sb();
  if (client) {
    let q = client.from("clinic_orders").select("payload").order("created_at", { ascending: false }).limit(limit);
    if (opts.statuses?.length) q = q.in("status", opts.statuses);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data as Array<{ payload: Order }>).map((r) => r.payload);
  }
  const all = await readJson<Order[]>("orders.json", []);
  return all.filter((o) => !opts.statuses?.length || opts.statuses.includes(o.status)).slice(0, limit);
}

export async function updateOrder(id: string, patch: Partial<Order>): Promise<Order | null> {
  const current = await getOrder(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  await saveOrder(next);
  return next;
}

export async function saveLead(lead: Lead): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client.from("clinic_leads").upsert({ id: lead.id, created_at: lead.createdAt, handled_at: lead.handledAt ?? null, payload: lead });
    if (error) throw new Error(`clinic_leads upsert: ${error.message}`);
    return;
  }
  await queued(async () => {
    const all = await readJson<Lead[]>("leads.json", []);
    const i = all.findIndex((l) => l.id === lead.id);
    if (i >= 0) all[i] = lead; else all.unshift(lead);
    await writeJson("leads.json", all);
  });
}

export async function listLeads(limit = 200): Promise<Lead[]> {
  const client = sb();
  if (client) {
    const { data, error } = await client.from("clinic_leads").select("payload").order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data as Array<{ payload: Lead }>).map((r) => r.payload);
  }
  return (await readJson<Lead[]>("leads.json", [])).slice(0, limit);
}

export async function getLead(id: string): Promise<Lead | null> {
  return (await listLeads(1000)).find((l) => l.id === id) ?? null;
}
