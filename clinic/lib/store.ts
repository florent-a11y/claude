import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Lead, Order, OrderStatus } from "./schema";
import { dataDir } from "./data-dir";
import { blobDelete, blobListJson, blobReadJson, blobStoreEnabled, blobWriteJson } from "./blob-store";
import type { Post } from "./blog";

/**
 * Storage layer. Supabase (tables clinic_orders, clinic_leads; see supabase/schema.sql) when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are set; on a hosted test site, a private Vercel Blob store (lib/blob-store.ts);
 * on your own machine, JSON files under ./data. A live site without a database refuses to store anything
 * rather than lose orders quietly.
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

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(path.join(dataDir(), file), "utf8")) as T; } catch { return fallback; }
}
async function writeJson(file: string, value: unknown) {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(path.join(dataDir(), file), JSON.stringify(value, null, 2));
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
  if (blobStoreEnabled()) return blobWriteJson(`orders/${order.id}.json`, order);
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
  if (blobStoreEnabled()) return blobReadJson<Order>(`orders/${id}.json`);
  return (await readJson<Order[]>("orders.json", [])).find((o) => o.id === id) ?? null;
}

export async function findOrderByAirwallexIntent(intentId: string): Promise<Order | null> {
  const client = sb();
  if (client) {
    const { data } = await client.from("clinic_orders").select("payload").eq("payload->>airwallexIntentId", intentId).maybeSingle();
    return data ? (data.payload as Order) : null;
  }
  return (await localOrders()).find((o) => o.airwallexIntentId === intentId) ?? null;
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
  const all = await localOrders();
  return all.filter((o) => !opts.statuses?.length || opts.statuses.includes(o.status)).slice(0, limit);
}

/** Every order outside the database, newest first: from the test site's Blob store, or the local file. */
async function localOrders(): Promise<Order[]> {
  if (!blobStoreEnabled()) return readJson<Order[]>("orders.json", []);
  const all = await blobListJson<Order>("orders/", 500);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  if (blobStoreEnabled()) return blobWriteJson(`leads/${lead.id}.json`, lead);
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
  if (blobStoreEnabled()) return (await blobListJson<Lead>("leads/", limit)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (await readJson<Lead[]>("leads.json", [])).slice(0, limit);
}

export async function getLead(id: string): Promise<Lead | null> {
  return (await listLeads(1000)).find((l) => l.id === id) ?? null;
}

// ---------- Blog articles ----------
// Same three homes as orders: the database table clinic_posts, the test site's Blob store, or ./data/posts.json.

export async function savePost(post: Post): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client.from("clinic_posts").upsert({ id: post.id, locale: post.locale, slug: post.slug, status: post.status, published_at: post.publishedAt ?? null, updated_at: post.updatedAt, payload: post });
    if (error) throw new Error(`clinic_posts upsert: ${error.message}`);
    return;
  }
  if (blobStoreEnabled()) return blobWriteJson(`posts/${post.id}.json`, post);
  await queued(async () => {
    const all = await readJson<Post[]>("posts.json", []);
    const i = all.findIndex((p) => p.id === post.id);
    if (i >= 0) all[i] = post; else all.unshift(post);
    await writeJson("posts.json", all);
  });
}

/** Every article, drafts included, most recently edited first. */
export async function listPosts(): Promise<Post[]> {
  const client = sb();
  let all: Post[];
  if (client) {
    const { data, error } = await client.from("clinic_posts").select("payload").order("updated_at", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    all = (data as Array<{ payload: Post }>).map((r) => r.payload);
  } else if (blobStoreEnabled()) all = await blobListJson<Post>("posts/", 500);
  else all = await readJson<Post[]>("posts.json", []);
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPost(id: string): Promise<Post | null> {
  if (!/^[a-z0-9-]{6,60}$/.test(id)) return null;
  const client = sb();
  if (client) {
    const { data, error } = await client.from("clinic_posts").select("payload").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? (data.payload as Post) : null;
  }
  if (blobStoreEnabled()) return blobReadJson<Post>(`posts/${id}.json`);
  return (await readJson<Post[]>("posts.json", [])).find((p) => p.id === id) ?? null;
}

export async function deletePost(id: string): Promise<void> {
  if (!/^[a-z0-9-]{6,60}$/.test(id)) return;
  const client = sb();
  if (client) {
    const { error } = await client.from("clinic_posts").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  if (blobStoreEnabled()) return blobDelete(`posts/${id}.json`);
  await queued(async () => {
    const all = await readJson<Post[]>("posts.json", []);
    await writeJson("posts.json", all.filter((p) => p.id !== id));
  });
}
