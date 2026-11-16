import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { db, supabaseClient } from "./db";
import { roundMoney } from "./money";
import { AUDIT_ACTIONS, TABLES, type AuditAction, type AuditEntry, type Table } from "./types";

/**
 * Audit trail: who created, edited, deleted, posted, voided, approved, paid, locked or imported each record, and when.
 *
 * lib/db.ts calls `recordAudit` / `recordAuditMany` after every successful write, so no feature has to remember to log.
 * - Not recorded: `audit_log` itself, `counters`, `settings`, `fx_rates` (machine state with no accounting meaning).
 * - Secrets never leave the row: a field whose name matches /password|secret|token|hash/i is never part of a diff
 *   (a password reset is logged as "password changed", without values).
 * - Noise (`updatedAt`, `createdAt`, `lastLoginAt`, the journal's own `revisions`) is ignored, and an update that
 *   changed nothing else is not logged.
 * - The actor is the `withAuditActor` scope when there is one (jobs: "Recurring job"), else the signed-in user
 *   resolved by lib/auth.ts, else "System" (seed, scripts, cron, sign-in).
 * - Logging never fails the business write: every error is caught and printed. The log is written after the write.
 *
 * No Next.js import here: lib/auth.ts registers the resolver, so scripts, tests and the file backend use this as is.
 */

type Row = Record<string, unknown>;
export type AuditChange = NonNullable<AuditEntry["changes"]>[number];
export interface AuditActor { id?: string; name: string; email?: string }
type ActorResolver = () => Promise<AuditActor | null>;

const UNLOGGED: ReadonlySet<string> = new Set(["audit_log", "counters", "settings", "fx_rates"]);
const SECRET = /password|secret|token|hash/i;
const NOISE: ReadonlySet<string> = new Set(["updatedAt", "createdAt", "lastLoginAt", "revisions"]);
const MAX_VALUE = 120;
/** `insertMany` of more rows than this is one "import" entry; up to this many, one entry per row. */
export const AUDIT_BULK_THRESHOLD = 20;
/** `listAudit({ userId })` value for entries written without a signed-in user (System and named jobs). */
export const AUDIT_SYSTEM = "system";

export function isAudited(table: string): boolean {
  return !UNLOGGED.has(table);
}
/** Tables that appear in the log, in registry order (filter lists). */
export const AUDITED_TABLES: readonly Table[] = TABLES.filter(isAudited);

// ---------- Actor ----------

// One store and one resolver per process, even when the bundler instantiates this module more than once.
type State = { scope: AsyncLocalStorage<AuditActor>; resolver?: ActorResolver };
const KEY = Symbol.for("ila.audit");
const globals = globalThis as unknown as Record<symbol, State | undefined>;
const state: State = (globals[KEY] ??= { scope: new AsyncLocalStorage<AuditActor>() });

/** Registered once by lib/auth.ts: the signed-in user of the current request, or null outside a request. */
export function setAuditActorResolver(fn: ActorResolver): void {
  state.resolver = fn;
}

/** Runs `fn` with every write attributed to `actor`, e.g. `withAuditActor({ name: "Recurring job" }, () => runDue(date))`. */
export function withAuditActor<R>(actor: AuditActor, fn: () => R): R {
  return state.scope.run(actor, fn);
}

async function currentActor(): Promise<AuditActor | null> {
  const scoped = state.scope.getStore();
  if (scoped) return scoped;
  try {
    return (await state.resolver?.()) ?? null;
  } catch {
    return null;
  }
}

// ---------- Pure helpers ----------

const NOUNS: Partial<Record<Table, readonly [string, string]>> = {
  users: ["user", "users"], entities: ["entity", "entities"], contacts: ["contact", "contacts"], companies: ["client company", "client companies"],
  services: ["price list item", "price list items"], vendors: ["vendor", "vendors"], activities: ["activity", "activities"],
  accounts: ["account", "accounts"], journal_entries: ["journal entry", "journal entries"], periods: ["period", "periods"],
  bank_accounts: ["bank account", "bank accounts"], bank_transactions: ["bank statement line", "bank statement lines"],
  invoices: ["invoice", "invoices"], bills: ["bill", "bills"], payments: ["payment", "payments"], fixed_assets: ["fixed asset", "fixed assets"],
  employees: ["employee", "employees"], payroll_runs: ["payroll run", "payroll runs"], withholding_slips: ["withholding slip", "withholding slips"],
  vat_transactions: ["PPN row", "PPN rows"], tax_obligations: ["tax obligation", "tax obligations"], import_batches: ["import", "imports"],
  recurring_templates: ["recurring transaction", "recurring transactions"],
};

/** The word shown on badges and in filters for each action. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: "created", update: "edited", delete: "deleted", post: "posted", void: "voided", approve: "approved", pay: "paid", lock: "locked", unlock: "unlocked", import: "imported",
};

/** "journal entry" / "journal entries" for `journal_entries`; an unknown table falls back to its name. */
export function auditTableName(table: string, plural = false): string {
  return NOUNS[table as Table]?.[plural ? 1 : 0] ?? table.replace(/_/g, " ");
}

const blank = (v: unknown): v is undefined | null | "" => v === undefined || v === null || v === "";
const scalar = (v: unknown): v is string | number | boolean => typeof v === "string" || typeof v === "number" || typeof v === "boolean";
const plain = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);
/** Nothing there: a missing value, an empty list or an empty object (a form that saves `tags: []` changed nothing). */
const empty = (v: unknown): boolean => blank(v) || (Array.isArray(v) ? v.length === 0 : plain(v) && Object.keys(v).length === 0);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const clip = (s: string, max = MAX_VALUE): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const same = (x: unknown, y: unknown): boolean => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
/** Stored value as text: amounts get thousands separators, everything is cut to `max` characters. */
function show(v: string | number | boolean, max = MAX_VALUE): string {
  return clip(typeof v === "number" && Math.abs(v) >= 10_000 ? v.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 6 }) : String(v), max);
}
const inner = (row: Row, key: string, field: string): string => (plain(row[key]) ? text((row[key] as Row)[field]) : "");
const dotted = (...parts: unknown[]): string => parts.map(text).filter(Boolean).join(" · ");
/** Sum of the debit column of journal lines, to the cent (undefined when `lines` is not a list). */
function debitTotal(lines: unknown): number | undefined {
  if (!Array.isArray(lines)) return undefined;
  // The ledger keeps cents: the sum is rounded once so binary noise (0.1 + 0.2) never reaches the log.
  return roundMoney(lines.reduce((sum: number, l) => sum + (plain(l) && typeof l.debit === "number" ? l.debit : 0), 0));
}
/** What a `payments` row is called in the app; `auditHref` relies on "Expense" and "Deposit" to find the page. */
function paymentNoun(r: Row): string {
  if (r.kind === "transfer") return "Transfer";
  if (r.invoiceId) return "Receipt";
  if (r.billId) return "Bill payment";
  return r.kind === "receipt" ? "Deposit" : "Expense";
}

/** Human reference of a record: document number, name, period… (never empty, at most ~120 characters). */
export function auditLabel(table: string, row: unknown): string {
  const r = plain(row) ? row : {};
  let label: string;
  switch (table) {
    case "invoices": label = dotted(r.number, inner(r, "customer", "name")); break;
    case "bills": label = dotted(r.number, inner(r, "vendor", "name")); break;
    case "withholding_slips": label = dotted(r.number, inner(r, "counterparty", "name")); break;
    case "payments": label = dotted(`${paymentNoun(r)} ${text(r.currency)} ${typeof r.amount === "number" ? r.amount.toLocaleString("en-US") : ""}`.replace(/\s+/g, " "), r.payee, r.date); break;
    case "users": label = dotted(r.name, r.email); break;
    case "contacts": label = `${text(r.firstName)} ${text(r.lastName)}`.trim(); break;
    case "services": case "accounts": label = `${text(r.code)} ${text(r.name)}`.trim(); break;
    case "periods": label = text(r.period); break;
    case "payroll_runs": label = r.period ? `Payroll ${text(r.period)}` : ""; break;
    case "bank_transactions": label = dotted(r.date, r.description); break;
    case "vat_transactions": label = dotted(r.fakturNumber || (r.direction === "input" ? "PPN input" : "PPN output"), inner(r, "counterparty", "name"), r.period); break;
    case "tax_obligations": label = dotted(r.label, r.period); break;
    case "import_batches": label = dotted(r.kind, r.fileName); break;
    case "activities": label = text(r.subject); break;
    default: label = "";
  }
  return clip(label || text(r.number) || text(r.name) || text(r.label) || text(r.id) || "(no reference)");
}

/**
 * The action a write amounts to. Creations and deletions are obvious; an update is named after the status-like
 * transition it makes: journal entries → posted / void (an entry stored as posted straight away is a "post"), invoices
 * and bills leaving draft ("post"), receiving a payment ("pay") or voided, payroll runs approved / paid, periods locked
 * or unlocked, withholding slips issued ("post"), expenses and deposits voided. Anything else is an "update".
 */
export function actionFor(table: string, before: unknown, after: unknown): AuditAction {
  if (!plain(after)) return "delete";
  const prev = plain(before) ? before : null;
  const was = prev?.status, now = after.status;
  const moved = now !== was;
  switch (table) {
    case "journal_entries":
      if (moved && now === "posted") return "post";
      if (moved && now === "void") return "void";
      break;
    case "invoices": case "bills":
      if (moved && now === "void") return "void";
      if (moved && (was === undefined || was === "draft") && now !== "draft") return "post";
      if (prev && typeof after.amountPaid === "number" && after.amountPaid > (typeof prev.amountPaid === "number" ? prev.amountPaid : 0)) return "pay";
      break;
    case "payroll_runs":
      if (moved && now === "approved") return "approve";
      if (moved && now === "paid") return "pay";
      break;
    case "withholding_slips":
      if (moved && now === "issued" && was !== "reported") return "post";
      break;
    case "payments":
      if (moved && now === "void") return "void";
      break;
    case "periods":
      if (Boolean(prev?.locked) !== Boolean(after.locked)) return after.locked ? "lock" : "unlock";
      break;
    case "import_batches":
      if (!prev) return "import";
      break;
  }
  return prev ? "update" : "create";
}

/**
 * Field-by-field difference between two versions of a row. Scalars carry their values (as text, cut to ~120
 * characters); a plain object one level down is compared field by field under a dotted name (`tax.pkp`,
 * `customer.name`); lists and deeper objects are named without values (`lines`). Secret and noise fields are never
 * returned. Journal entries get a derived `total` (sum of debits) so a change of amount is visible.
 */
export function diffRows(table: string, before: unknown, after: unknown): AuditChange[] {
  const b = plain(before) ? before : {}, a = plain(after) ? after : {};
  const out: AuditChange[] = [];
  const value = (field: string, x: unknown, y: unknown) => out.push({ field, ...(blank(x) ? {} : { from: show(x as string | number | boolean) }), ...(blank(y) ? {} : { to: show(y as string | number | boolean) }) });
  const visit = (field: string, x: unknown, y: unknown, depth: number) => {
    if (empty(x) && empty(y)) return;
    if ((blank(x) || scalar(x)) && (blank(y) || scalar(y))) { if (x !== y) value(field, x, y); return; }
    if (same(x, y)) return;
    if (depth === 0 && (blank(x) || plain(x)) && (blank(y) || plain(y))) {
      const xo = plain(x) ? x : {}, yo = plain(y) ? y : {};
      for (const k of Object.keys({ ...xo, ...yo })) if (!SECRET.test(k)) visit(`${field}.${k}`, xo[k], yo[k], 1);
      return;
    }
    out.push({ field });
  };
  for (const k of Object.keys({ ...b, ...a })) if (k !== "id" && !NOISE.has(k) && !SECRET.test(k)) visit(k, b[k], a[k], 0);
  if (table === "journal_entries") {
    const x = debitTotal(b.lines), y = debitTotal(a.lines);
    if (x !== y) value("total", x, y);
  }
  return out;
}

/** One line for a list of changes: status first, then the other values, then the names of lists that changed. */
export function auditSummary(changes: AuditChange[]): string | undefined {
  const valued = changes.filter((c) => c.from !== undefined || c.to !== undefined);
  const named = changes.filter((c) => c.from === undefined && c.to === undefined).map((c) => c.field);
  // Ids and timestamps stay in `changes`; the line shows them only when nothing else changed.
  const rank = (c: AuditChange) => (c.field === "status" ? 0 : /(Id|Ids|At|\.id)$/.test(c.field) ? 2 : 1);
  const sorted = [...valued].sort((x, y) => rank(x) - rank(y));
  const telling = sorted.filter((c) => rank(c) < 2);
  const shown = (telling.length > 0 || named.length > 0 ? telling : sorted).slice(0, 5);
  const parts = shown.map((c) => `${c.field} ${clip(c.from ?? "(none)", 60)} → ${clip(c.to ?? "(none)", 60)}`);
  if (named.length > 0) parts.push(`${named.slice(0, 4).join(", ")}${named.length > 4 ? "…" : ""} changed`);
  if (valued.length > shown.length) parts.push(`+${valued.length - shown.length} more`);
  return parts.length > 0 ? clip(parts.join(" · "), 240) : undefined;
}

const DESCRIBED = ["status", "date", "kind", "source", "type", "total", "amount", "currency", "memo", "period", "role", "category"];
/** One line about a record that was just created or deleted: its main scalar fields. */
function describeRow(table: string, row: Row): string | undefined {
  if (table === "import_batches") return ["rows", "inserted", "skipped"].filter((f) => typeof row[f] === "number").map((f) => `${f} ${show(row[f] as number)}`).join(" · ") || undefined;
  if (table === "periods") return row.locked ? "locked" : "open";
  const r: Row = table === "journal_entries" ? { ...row, total: debitTotal(row.lines) } : row;
  const parts: string[] = [];
  for (const f of DESCRIBED) {
    const v = r[f];
    if (scalar(v) && !blank(v) && parts.length < 5) parts.push(`${f} ${show(v, 60)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** A changed secret is reported by kind, never by name or value. */
function secretChange(before: Row, after: Row): string | undefined {
  const keys = Object.keys({ ...before, ...after }).filter((k) => SECRET.test(k) && !same(before[k], after[k]));
  if (keys.length === 0) return undefined;
  return keys.some((k) => /password/i.test(k)) ? "password changed" : "protected field changed";
}

/** The books a record belongs to: its `entityId`, or its own id for the entity record itself. */
function entityOf(table: string, row: Row): string | undefined {
  const v = table === "entities" ? row.id : row.entityId;
  return typeof v === "string" && v !== "" ? v : undefined;
}

type Draft = Pick<AuditEntry, "table" | "docId" | "action" | "label" | "entityId" | "summary" | "changes" | "count">;

/** The log entry for one write (`before` null: created, `after` null: deleted), or null when nothing worth logging changed. */
export function draftAudit(table: Table, before: unknown, after: unknown): Draft | null {
  const b = plain(before) ? before : null, a = plain(after) ? after : null;
  const row = a ?? b;
  if (!row) return null;
  const base: Draft = { table, docId: text(row.id), action: actionFor(table, b, a), label: auditLabel(table, row), entityId: entityOf(table, row) };
  if (!b || !a) return { ...base, summary: describeRow(table, row), ...(table === "import_batches" && typeof row.inserted === "number" ? { count: row.inserted } : {}) };
  const changes = diffRows(table, b, a);
  const secret = secretChange(b, a);
  if (changes.length === 0 && !secret) return null;
  return { ...base, summary: [auditSummary(changes), secret].filter(Boolean).join(" · ") || undefined, changes: changes.length > 0 ? changes : undefined };
}

// ---------- Writing ----------

async function stamp(drafts: Draft[]): Promise<AuditEntry[]> {
  const actor = await currentActor();
  const at = new Date().toISOString();
  return drafts.map((d) => ({ id: randomUUID(), at, userId: actor?.id, userName: actor?.name || "System", userEmail: actor?.email, ...d }));
}

function failed(table: string, e: unknown): void {
  console.error(`audit_log: could not record a change to ${table}: ${e instanceof Error ? e.message : String(e)}`);
}

/** Called by lib/db.ts after insert / update / upsert / remove with the stored row before and after (null = absent). */
export async function recordAudit(table: Table, before: unknown, after: unknown): Promise<void> {
  if (!isAudited(table)) return;
  try {
    const draft = draftAudit(table, before, after);
    if (draft) await db.insert("audit_log", (await stamp([draft]))[0]);
  } catch (e) {
    failed(table, e);
  }
}

/** Called by lib/db.ts after insertMany: one "import" entry for a large batch, one entry per row for a small one. */
export async function recordAuditMany(table: Table, rows: unknown[]): Promise<void> {
  if (!isAudited(table) || rows.length === 0) return;
  try {
    let drafts: Draft[];
    if (rows.length > AUDIT_BULK_THRESHOLD) {
      const entities = new Set(rows.map((r) => (plain(r) ? entityOf(table, r) : undefined)));
      const sample = rows.slice(0, 3).map((r) => auditLabel(table, r)).join(", ");
      drafts = [{ table, docId: "", action: "import", label: `${rows.length} ${auditTableName(table, true)}`, entityId: entities.size === 1 ? [...entities][0] : undefined, summary: clip(`${sample}…`, 240), count: rows.length }];
    } else {
      drafts = rows.flatMap((r) => draftAudit(table, null, r) ?? []);
    }
    if (drafts.length > 0) await db.insertMany("audit_log", await stamp(drafts));
  } catch (e) {
    failed(table, e);
  }
}

// ---------- Reading ----------

export interface AuditQuery {
  entityId?: string; table?: string; docId?: string;
  /** A user id, or `AUDIT_SYSTEM` for entries written without a signed-in user. */
  userId?: string;
  action?: string;
  /** Days `YYYY-MM-DD` (inclusive), read in WITA like every date in the app. */
  from?: string; to?: string;
  /** Text contained in the label (case-insensitive). */
  q?: string;
  limit?: number; offset?: number;
}

/**
 * Filters of the audit pages and of the CSV export, read from a query string: `entity`, `user`, `table`, `action`,
 * `from`, `to`, `q` and `doc` (one record). `get` returns the first value of a key.
 */
export function auditQueryFrom(get: (key: string) => string | null | undefined): AuditQuery {
  const v = (key: string) => get(key)?.trim() || undefined;
  return { entityId: v("entity"), userId: v("user"), table: v("table"), action: v("action"), from: v("from"), to: v("to"), q: v("q"), docId: v("doc") };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Bounds of a WITA day (UTC+8, lib/dates.ts `TZ`) as the ISO instants `at` is stored in. */
const dayBound = (d: string | undefined, end: boolean): string | undefined => (d && DAY.test(d) ? new Date(`${d}T${end ? "23:59:59.999" : "00:00:00.000"}+08:00`).toISOString() : undefined);

/**
 * Log entries, newest first. On Supabase every filter, the ordering and the window run in the database (the page never
 * loads the whole table); on the file backend the table is filtered in memory.
 */
export async function listAudit(query: AuditQuery = {}): Promise<AuditEntry[]> {
  const limit = Math.max(0, query.limit ?? 200), offset = Math.max(0, query.offset ?? 0);
  const from = dayBound(query.from, false), to = dayBound(query.to, true);
  const q = query.q?.trim().toLowerCase() || undefined;
  const action = (AUDIT_ACTIONS as readonly string[]).includes(query.action ?? "") ? query.action : undefined;
  const system = query.userId === AUDIT_SYSTEM;
  const eq: Record<string, string> = {};
  for (const [k, v] of Object.entries({ table: query.table, docId: query.docId, userId: system ? undefined : query.userId, action })) if (v) eq[k] = v;
  const client = supabaseClient();
  if (client) {
    const out: AuditEntry[] = [];
    // PostgREST caps a response at 1000 rows: read larger windows (CSV export) in pages.
    while (out.length < limit) {
      const size = Math.min(1000, limit - out.length), start = offset + out.length;
      let sel = client.from("audit_log").select("data").order("created_at", { ascending: false }).order("id", { ascending: false });
      if (query.entityId) sel = sel.eq("entity_id", query.entityId);
      if (Object.keys(eq).length > 0) sel = sel.contains("data", eq);
      if (system) sel = sel.is("data->>userId", null);
      if (from) sel = sel.gte("data->>at", from);
      if (to) sel = sel.lte("data->>at", to);
      if (q) sel = sel.ilike("data->>label", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
      const { data, error } = await sel.range(start, start + size - 1);
      if (error) throw new Error(`audit_log list: ${error.message}`);
      out.push(...(data ?? []).map((r) => r.data as AuditEntry));
      if (!data || data.length < size) break;
    }
    return out;
  }
  const rows = await db.list("audit_log", {
    where: (e) => (!query.entityId || e.entityId === query.entityId) && Object.entries(eq).every(([k, v]) => (e as unknown as Row)[k] === v)
      && (!system || !e.userId) && (!from || e.at >= from) && (!to || e.at <= to) && (!q || e.label.toLowerCase().includes(q)),
  });
  // Stored in write order: reversed, then a stable sort on the timestamp, puts the latest write first.
  return rows.reverse().sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0)).slice(offset, offset + limit);
}

/**
 * Where a logged record lives in the app, when its table has a page (bulk entries and tables without one: undefined).
 * The record may have been deleted since; callers do not link "delete" entries.
 */
export function auditHref(e: Pick<AuditEntry, "table" | "docId" | "entityId" | "label">): string | undefined {
  if (!e.docId) return undefined;
  const id = encodeURIComponent(e.docId);
  switch (e.table) {
    case "companies": return `/clients/companies/${id}`;
    case "contacts": return `/clients/contacts/${id}`;
    case "vendors": return `/clients/vendors/${id}`;
    case "services": return `/clients/services/${id}`;
    case "entities": return `/settings/entities/${id}`;
    case "users": return "/settings/users";
  }
  if (!e.entityId) return undefined;
  const ent = encodeURIComponent(e.entityId), books = `/books/${ent}`;
  switch (e.table) {
    case "journal_entries": return `${books}/journal/${id}`;
    case "invoices": return `${books}/sales/${id}`;
    case "bills": return `${books}/purchases/${id}`;
    // Only expenses and deposits have a page; receipts, bill payments and transfers are shown on their document.
    case "payments": return e.label.startsWith("Expense ") ? `${books}/expenses/${id}` : e.label.startsWith("Deposit ") ? `${books}/deposits/${id}` : undefined;
    case "fixed_assets": return `${books}/assets/${id}`;
    case "accounts": return `${books}/accounts/${id}`;
    case "bank_accounts": return `${books}/bank/${id}`;
    case "recurring_templates": return `${books}/recurring/${id}`;
    case "periods": return `${books}/periods`;
    case "employees": return `/payroll/${ent}/employees/${id}/edit`;
    case "payroll_runs": return `/payroll/${ent}/runs/${id}`;
    case "withholding_slips": return `/tax/${ent}/withholding/${id}`;
    case "tax_obligations": return `/tax/${ent}/obligations/${id}`;
    default: return undefined;
  }
}
