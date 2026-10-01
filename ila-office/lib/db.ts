import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Table, TableMap } from "./types";

/**
 * Storage layer. Every table is a collection of JSON documents keyed by `id`.
 *
 * - With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: each table is a Postgres table `(id text pk, entity_id text,
 *   data jsonb, created_at, updated_at)` (see supabase/schema.sql). Equality filters use the jsonb containment
 *   operator so they run in the database; function filters run in memory.
 * - Otherwise: `data/<table>.json` on disk (development only). Writes are serialised through a per-table queue.
 *
 * Keep this API small so both backends stay equivalent. Modules never touch Supabase or the filesystem directly.
 */

type Row<T extends Table> = TableMap[T];

export interface ListOptions<T> {
  /** Equality filter on top-level fields, or a predicate. */
  where?: Partial<T> | ((row: T) => boolean);
  orderBy?: keyof T & string;
  desc?: boolean;
  limit?: number;
}

let supabase: SupabaseClient | null | undefined;
function sb(): SupabaseClient | null {
  if (supabase !== undefined) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return supabase;
}

export function storageBackend(): "supabase" | "file" {
  return sb() ? "supabase" : "file";
}

// ---------- File backend ----------

const DATA_DIR = process.env.ILA_DATA_DIR ?? path.join(process.cwd(), "data");
const cache = new Map<string, unknown[]>();
const queues = new Map<string, Promise<unknown>>();

async function readTable<T>(table: string): Promise<T[]> {
  if (cache.has(table)) return cache.get(table) as T[];
  try {
    const rows = JSON.parse(await fs.readFile(path.join(DATA_DIR, `${table}.json`), "utf8")) as T[];
    cache.set(table, rows);
    return rows;
  } catch {
    cache.set(table, []);
    return [];
  }
}

async function writeTable<T>(table: string, rows: T[]) {
  cache.set(table, rows);
  await fs.mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${table}.json`);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2));
  await fs.rename(tmp, file);
}

/** Runs `fn` after every previously queued write for the same table. */
function serialise<R>(table: string, fn: () => Promise<R>): Promise<R> {
  const prev = queues.get(table) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  queues.set(table, next);
  return next;
}

// ---------- Helpers ----------

function matches<T>(row: T, where?: Partial<T> | ((row: T) => boolean)): boolean {
  if (!where) return true;
  if (typeof where === "function") return where(row);
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    if ((row as Record<string, unknown>)[k] !== v) return false;
  }
  return true;
}

function sortRows<T>(rows: T[], orderBy?: keyof T & string, desc?: boolean): T[] {
  if (!orderBy) return rows;
  const dir = desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[orderBy] as unknown;
    const y = b[orderBy] as unknown;
    if (x === y) return 0;
    if (x === undefined || x === null) return 1;
    if (y === undefined || y === null) return -1;
    return (x < y ? -1 : 1) * dir;
  });
}

function entityIdOf(row: unknown): string | null {
  const v = (row as { entityId?: unknown }).entityId;
  return typeof v === "string" ? v : null;
}

// ---------- Public API ----------

export const db = {
  newId(): string {
    return randomUUID();
  },

  async list<T extends Table>(table: T, opts: ListOptions<Row<T>> = {}): Promise<Row<T>[]> {
    const client = sb();
    if (client) {
      let q = client.from(table).select("data");
      if (opts.where && typeof opts.where !== "function") {
        const eq: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(opts.where)) if (v !== undefined) eq[k] = v;
        if (Object.keys(eq).length) q = q.contains("data", eq);
      }
      // Fetch in pages: PostgREST caps a single response at 1000 rows by default.
      const rows: Row<T>[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await q.range(from, from + page - 1);
        if (error) throw new Error(`${table} list: ${error.message}`);
        rows.push(...(data ?? []).map((r) => r.data as Row<T>));
        if (!data || data.length < page) break;
      }
      let out = typeof opts.where === "function" ? rows.filter((r) => matches(r, opts.where)) : rows;
      out = sortRows(out, opts.orderBy, opts.desc);
      return opts.limit ? out.slice(0, opts.limit) : out;
    }
    const rows = await readTable<Row<T>>(table);
    let out = rows.filter((r) => matches(r, opts.where));
    out = sortRows(out, opts.orderBy, opts.desc);
    return opts.limit ? out.slice(0, opts.limit) : out;
  },

  async get<T extends Table>(table: T, id: string): Promise<Row<T> | null> {
    const client = sb();
    if (client) {
      const { data, error } = await client.from(table).select("data").eq("id", id).maybeSingle();
      if (error) throw new Error(`${table} get: ${error.message}`);
      return (data?.data as Row<T>) ?? null;
    }
    const rows = await readTable<Row<T>>(table);
    return rows.find((r) => (r as { id: string }).id === id) ?? null;
  },

  async getMany<T extends Table>(table: T, ids: string[]): Promise<Map<string, Row<T>>> {
    const unique = [...new Set(ids.filter(Boolean))];
    const out = new Map<string, Row<T>>();
    if (unique.length === 0) return out;
    const client = sb();
    if (client) {
      for (let i = 0; i < unique.length; i += 500) {
        const { data, error } = await client.from(table).select("data").in("id", unique.slice(i, i + 500));
        if (error) throw new Error(`${table} getMany: ${error.message}`);
        for (const r of data ?? []) out.set((r.data as { id: string }).id, r.data as Row<T>);
      }
      return out;
    }
    const rows = await readTable<Row<T>>(table);
    const want = new Set(unique);
    for (const r of rows) if (want.has((r as { id: string }).id)) out.set((r as { id: string }).id, r);
    return out;
  },

  async insert<T extends Table>(table: T, row: Row<T>): Promise<Row<T>> {
    const id = (row as { id: string }).id;
    if (!id) throw new Error(`${table} insert: id is required`);
    const client = sb();
    if (client) {
      const { error } = await client.from(table).insert({ id, entity_id: entityIdOf(row), data: row });
      if (error) throw new Error(`${table} insert: ${error.message}`);
      return row;
    }
    return serialise(table, async () => {
      const rows = await readTable<Row<T>>(table);
      if (rows.some((r) => (r as { id: string }).id === id)) throw new Error(`${table} insert: duplicate id ${id}`);
      await writeTable(table, [...rows, row]);
      return row;
    });
  },

  async insertMany<T extends Table>(table: T, rows: Row<T>[]): Promise<number> {
    if (rows.length === 0) return 0;
    const client = sb();
    if (client) {
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((row) => ({ id: (row as { id: string }).id, entity_id: entityIdOf(row), data: row }));
        const { error } = await client.from(table).insert(chunk);
        if (error) throw new Error(`${table} insertMany: ${error.message}`);
      }
      return rows.length;
    }
    return serialise(table, async () => {
      const existing = await readTable<Row<T>>(table);
      const ids = new Set(existing.map((r) => (r as { id: string }).id));
      for (const r of rows) {
        const id = (r as { id: string }).id;
        if (ids.has(id)) throw new Error(`${table} insertMany: duplicate id ${id}`);
        ids.add(id);
      }
      await writeTable(table, [...existing, ...rows]);
      return rows.length;
    });
  },

  /** Insert or replace by id. */
  async upsert<T extends Table>(table: T, row: Row<T>): Promise<Row<T>> {
    const id = (row as { id: string }).id;
    const client = sb();
    if (client) {
      const { error } = await client.from(table).upsert({ id, entity_id: entityIdOf(row), data: row, updated_at: new Date().toISOString() });
      if (error) throw new Error(`${table} upsert: ${error.message}`);
      return row;
    }
    return serialise(table, async () => {
      const rows = await readTable<Row<T>>(table);
      const i = rows.findIndex((r) => (r as { id: string }).id === id);
      if (i >= 0) rows[i] = row; else rows.push(row);
      await writeTable(table, rows);
      return row;
    });
  },

  /** Shallow-merge `patch` into the stored row. Returns null when the row does not exist. */
  async update<T extends Table>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T> | null> {
    const client = sb();
    if (client) {
      const current = await this.get(table, id);
      if (!current) return null;
      const next = { ...current, ...patch, id } as Row<T>;
      const { error } = await client.from(table).update({ entity_id: entityIdOf(next), data: next, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(`${table} update: ${error.message}`);
      return next;
    }
    return serialise(table, async () => {
      const rows = await readTable<Row<T>>(table);
      const i = rows.findIndex((r) => (r as { id: string }).id === id);
      if (i < 0) return null;
      const next = { ...rows[i], ...patch, id } as Row<T>;
      rows[i] = next;
      await writeTable(table, rows);
      return next;
    });
  },

  async remove<T extends Table>(table: T, id: string): Promise<void> {
    const client = sb();
    if (client) {
      const { error } = await client.from(table).delete().eq("id", id);
      if (error) throw new Error(`${table} remove: ${error.message}`);
      return;
    }
    await serialise(table, async () => {
      const rows = await readTable<Row<T>>(table);
      await writeTable(table, rows.filter((r) => (r as { id: string }).id !== id));
    });
  },

  async count<T extends Table>(table: T, where?: Partial<Row<T>>): Promise<number> {
    return (await this.list(table, { where })).length;
  },

  /**
   * Sequential document numbers per scope and year, e.g. nextNumber(entityId, "INV") → "INV-2026-0001".
   * Scope is usually an entity id; use "global" for CRM documents (quotes, projects).
   */
  async nextNumber(scope: string, prefix: string, date = new Date()): Promise<string> {
    const year = date.getFullYear();
    const id = `${scope}:${prefix}:${year}`;
    const client = sb();
    if (client) {
      // Optimistic increment: read, write with the expected previous value, retry on conflict.
      for (let attempt = 0; attempt < 10; attempt++) {
        const current = await this.get("counters", id);
        const value = (current?.value ?? 0) + 1;
        if (!current) {
          const { error } = await client.from("counters").insert({ id, data: { id, value } });
          if (!error) return `${prefix}-${year}-${String(value).padStart(4, "0")}`;
          continue;
        }
        const { data, error } = await client.from("counters").update({ data: { id, value } }).eq("id", id).eq("data->>value", String(current.value)).select("id");
        if (error) throw new Error(`counters: ${error.message}`);
        if (data && data.length > 0) return `${prefix}-${year}-${String(value).padStart(4, "0")}`;
      }
      throw new Error("counters: could not allocate a number");
    }
    return serialise("counters", async () => {
      const rows = await readTable<{ id: string; value: number }>("counters");
      const i = rows.findIndex((r) => r.id === id);
      const value = (i >= 0 ? rows[i].value : 0) + 1;
      if (i >= 0) rows[i] = { id, value }; else rows.push({ id, value });
      await writeTable("counters", rows);
      return `${prefix}-${year}-${String(value).padStart(4, "0")}`;
    });
  },

  /** Test/seed helper: drop the in-memory cache so the next read hits disk. */
  resetCache() {
    cache.clear();
  },
};

export type Db = typeof db;
