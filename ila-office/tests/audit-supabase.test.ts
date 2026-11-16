import { test, before } from "node:test";
import assert from "node:assert/strict";

/**
 * Audit trail on the Supabase backend, without a database: `fetch` is replaced before the client is created, so the
 * test sees the PostgREST requests lib/db.ts and lib/audit.ts would send (the host is a placeholder; nothing leaves
 * the process). Checks the order "business write, then log", that unlogged tables cost nothing, and that the list is
 * filtered, ordered and windowed by the database.
 */

process.env.SUPABASE_URL = "http://supabase.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

type Call = { method: string; table: string; query: URLSearchParams; body?: { id?: string; data?: Record<string, unknown> } & Record<string, unknown> };
const calls: Call[] = [];
const stored = new Map<string, unknown>();
let rowsPerPage = 0;
let failPostNumber = 0; // the n-th POST to `vat_transactions` is refused by the database
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const method = init?.method ?? "GET";
  const table = url.pathname.replace("/rest/v1/", "");
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  calls.push({ method, table, query: url.searchParams, body });
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
  if (method === "GET" && table === "audit_log") return json(Array.from({ length: Math.min(rowsPerPage, Number(url.searchParams.get("limit"))) }, (_, i) => ({ data: { id: `e-${url.searchParams.get("offset")}-${i}` } })));
  if (method === "GET") { const id = url.searchParams.get("id")?.replace("eq.", "") ?? ""; return json(stored.has(id) ? { data: stored.get(id) } : null); }
  if (method === "POST" && table === "vat_transactions" && --failPostNumber === 0) return new Response(JSON.stringify({ message: "duplicate key value" }), { status: 409, headers: { "content-type": "application/json" } });
  if (method === "POST" && body?.id && table !== "audit_log") stored.set(body.id, body.data);
  if (method === "DELETE") stored.clear();
  return new Response(null, { status: 201 });
}) as typeof fetch;

let A: typeof import("../lib/audit");
let D: typeof import("../lib/db");
before(async () => {
  A = await import("../lib/audit");
  D = await import("../lib/db");
});
const trace = () => calls.splice(0).map((c) => `${c.method} ${c.table}`);

test("supabase: every write is followed by one log insert; unlogged tables are left alone", async () => {
  const { db } = D;
  assert.equal(D.storageBackend(), "supabase");
  const vendor = { id: "v-1", name: "Notaris Contoh", category: "notary" as const, active: true, createdAt: "2026-01-05T02:00:00.000Z" };
  await db.insert("vendors", vendor);
  const created = calls[1].body!;
  assert.equal(created.entity_id, null);
  assert.deepEqual({ ...created.data, id: "", at: "" }, { id: "", at: "", userName: "System", table: "vendors", docId: "v-1", action: "create", label: "Notaris Contoh", summary: "category notary" });
  assert.deepEqual(trace(), ["POST vendors", "POST audit_log"]);

  await db.update("vendors", "v-1", { region: "Bali" });
  assert.deepEqual(calls[2].body!.data!.changes, [{ field: "region", to: "Bali" }]);
  assert.deepEqual(trace(), ["GET vendors", "PATCH vendors", "POST audit_log"]);
  await db.update("vendors", "v-1", { name: "Notaris Contoh" });
  assert.deepEqual(trace(), ["GET vendors", "PATCH vendors"], "nothing changed: no log");

  await db.upsert("vendors", { ...vendor, active: false });
  assert.equal(calls[2].body!.data!.action, "update");
  assert.deepEqual(trace(), ["GET vendors", "POST vendors", "POST audit_log"], "the previous row is read to tell what changed");
  await db.remove("vendors", "v-1");
  assert.equal(calls[2].body!.data!.action, "delete");
  assert.equal(calls[2].body!.data!.label, "Notaris Contoh", "the row is read before it is deleted");
  assert.deepEqual(trace(), ["GET vendors", "DELETE vendors", "POST audit_log"]);
  await db.remove("vendors", "v-1");
  assert.deepEqual(trace(), ["GET vendors", "DELETE vendors"], "nothing was there: no log");

  await db.upsert("fx_rates", { id: "bi:USD:2026-01-05", source: "bi", currency: "USD", date: "2026-01-05", rateDate: "2026-01-05", buy: 16_200, sell: 16_300, mid: 16_250, units: 1, fetchedAt: "2026-01-05T05:00:00.000Z" });
  await db.upsert("settings", { id: "k", value: 1, updatedAt: "2026-01-05T05:00:00.000Z" });
  assert.deepEqual(trace(), ["POST fx_rates", "POST settings"], "no extra read, no log");

  const entity = "ent-1";
  await db.insertMany("accounts", Array.from({ length: 21 }, (_, i) => ({ id: `a-${i}`, entityId: entity, code: `6-${1000 + i}`, name: `Expense ${i}`, type: "expense" as const, subtype: "opex" as const, normalBalance: "debit" as const, isSystem: false, active: true })));
  const bulk = (calls[1].body as unknown as Array<NonNullable<Call["body"]>>)[0]; // insertMany posts a list
  assert.equal(bulk.entity_id, entity, "the log row carries the entity for the per-entity list");
  assert.deepEqual([bulk.data!.action, bulk.data!.label, bulk.data!.count, bulk.data!.docId], ["import", "21 accounts", 21, ""]);
  assert.deepEqual(trace(), ["POST accounts", "POST audit_log"]);
});

test("supabase: a bulk insert refused half-way still logs the rows that were stored", async () => {
  const row = (i: number) => ({ id: `vat-${i}`, entityId: "ent-1", direction: "output" as const, date: "2026-03-05", period: "2026-03", counterparty: { name: `PT Contoh ${i}` }, dpp: 1_000_000, ppn: 110_000, rate: 0.11, creditable: false, createdAt: "2026-03-05T02:00:00.000Z" });
  failPostNumber = 2; // chunks of 500: the first is stored, the second fails
  await assert.rejects(D.db.insertMany("vat_transactions", Array.from({ length: 600 }, (_, i) => row(i))), /vat_transactions insertMany: duplicate key value/);
  const log = calls.find((c) => c.table === "audit_log")!;
  const entry = (log.body as unknown as Array<NonNullable<Call["body"]>>)[0].data!;
  assert.deepEqual([entry.action, entry.label, entry.count], ["import", "500 PPN rows", 500]);
  assert.deepEqual(trace(), ["POST vat_transactions", "POST vat_transactions", "POST audit_log"]);
});

test("supabase: listAudit filters, orders and windows in the database", async () => {
  rowsPerPage = 0;
  await A.listAudit({ entityId: "ent-1", table: "invoices", docId: "inv-1", userId: "u-1", action: "post", from: "2026-03-02", to: "2026-03-03", q: "INV 50%", limit: 101, offset: 200 });
  const [c] = calls.splice(0);
  assert.equal(`${c.method} ${c.table}`, "GET audit_log");
  assert.equal(c.query.get("select"), "data");
  assert.equal(c.query.get("order"), "created_at.desc,id.desc");
  assert.equal(c.query.get("entity_id"), "eq.ent-1");
  assert.deepEqual(JSON.parse(c.query.get("data")!.replace(/^cs\./, "")), { table: "invoices", docId: "inv-1", userId: "u-1", action: "post" });
  assert.deepEqual(c.query.getAll("data->>at"), ["gte.2026-03-01T16:00:00.000Z", "lte.2026-03-03T15:59:59.999Z"], "WITA days as UTC instants");
  assert.equal(c.query.get("data->>label"), "ilike.%inv 50\\%%", "wildcards typed by the user are escaped");
  assert.deepEqual([c.query.get("offset"), c.query.get("limit")], ["200", "101"]);

  await A.listAudit({ userId: A.AUDIT_SYSTEM });
  const [s] = calls.splice(0);
  assert.equal(s.query.get("data->>userId"), "is.null");
  assert.equal(s.query.get("data"), null);
  assert.deepEqual([s.query.get("offset"), s.query.get("limit")], ["0", "200"], "200 entries unless asked otherwise");
});

test("supabase: a window larger than one response is read in pages of 1000 and stops at the limit", async () => {
  rowsPerPage = 1000;
  const rows = await A.listAudit({ limit: 2500 });
  assert.equal(rows.length, 2500);
  assert.deepEqual(calls.splice(0).map((c) => [c.query.get("offset"), c.query.get("limit")]), [["0", "1000"], ["1000", "1000"], ["2000", "500"]]);
  rowsPerPage = 300;
  assert.equal((await A.listAudit({ limit: 5001 })).length, 300);
  assert.equal(calls.splice(0).length, 1, "a short page ends the read");
});
