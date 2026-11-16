import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AuditEntry, Vendor, Account } from "../lib/types";

/**
 * Audit trail: the pure rules of lib/audit.ts (action, diff, label, summary, links) and the hook in lib/db.ts on the
 * file backend. lib/db.ts reads ILA_DATA_DIR when it is first loaded, so the temp directory is set before the modules
 * are imported, and the Supabase variables are removed so a developer's environment can never be written to.
 */

const DIR = mkdtempSync(path.join(os.tmpdir(), "ila-audit-"));
process.env.ILA_DATA_DIR = DIR;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

let A: typeof import("../lib/audit");
let D: typeof import("../lib/db");
before(async () => {
  A = await import("../lib/audit");
  D = await import("../lib/db");
});
after(() => rmSync(DIR, { recursive: true, force: true }));

const ENTITY = "ent-1";
const journal = (over: Record<string, unknown> = {}) => ({
  id: "je-1", entityId: ENTITY, number: "JE-2026-0007", date: "2026-09-15", period: "2026-09", memo: "Office rent September", source: "manual",
  lines: [{ accountId: "a-rent", accountCode: "6-2000", debit: 5_000_000, credit: 0 }, { accountId: "a-bank", accountCode: "1-1100", debit: 0, credit: 5_000_000 }],
  status: "posted", postedAt: "2026-09-15T08:00:00.000Z", createdAt: "2026-09-15T08:00:00.000Z", ...over,
});
const invoice = (over: Record<string, unknown> = {}) => ({
  id: "inv-1", entityId: ENTITY, number: "INV-2026-0012", customer: { type: "company", id: "co-1", name: "PT Contoh Abadi" }, date: "2026-10-01", dueDate: "2026-10-06",
  currency: "IDR", fxRate: 1, lines: [{ id: "l1", description: "Monthly bookkeeping", qty: 1, unitPrice: 1_500_000, amount: 1_500_000, accountId: "a-sales", taxCode: "none" }],
  subtotal: 1_500_000, discount: 0, ppnAmount: 0, total: 1_500_000, amountPaid: 0, status: "draft", createdAt: "2026-10-01T02:00:00.000Z", ...over,
});
const fields = (changes: Array<{ field: string }>) => changes.map((c) => c.field);

// ---------- actionFor ----------

test("actionFor: creation, deletion and plain updates", () => {
  assert.equal(A.actionFor("vendors", null, { id: "v", name: "Notaris" }), "create");
  assert.equal(A.actionFor("vendors", { id: "v", name: "Notaris" }, null), "delete");
  assert.equal(A.actionFor("vendors", { id: "v", name: "Notaris" }, { id: "v", name: "Notaris Baru" }), "update");
  assert.equal(A.actionFor("tax_obligations", { status: "not_started" }, { status: "paid" }), "update", "tables without a rule stay an update");
});

test("actionFor: journal entries are posted and voided", () => {
  assert.equal(A.actionFor("journal_entries", null, journal()), "post", "an entry stored as posted straight away is a post");
  assert.equal(A.actionFor("journal_entries", null, journal({ status: "draft" })), "create");
  assert.equal(A.actionFor("journal_entries", journal({ status: "draft" }), journal()), "post");
  assert.equal(A.actionFor("journal_entries", journal(), journal({ status: "void" })), "void");
  assert.equal(A.actionFor("journal_entries", journal(), journal({ memo: "Office rent" })), "update", "an edit that keeps the status is an update");
});

test("actionFor: invoices and bills leave draft, get paid, get voided", () => {
  for (const table of ["invoices", "bills"]) {
    assert.equal(A.actionFor(table, null, invoice()), "create", table);
    assert.equal(A.actionFor(table, invoice(), invoice({ status: "sent" })), "post", table);
    assert.equal(A.actionFor(table, invoice(), invoice({ status: "paid" })), "post", `${table}: a bill with nothing payable goes straight to paid`);
    assert.equal(A.actionFor(table, invoice({ status: "sent" }), invoice({ status: "partial", amountPaid: 500_000 })), "pay", table);
    assert.equal(A.actionFor(table, invoice({ status: "partial", amountPaid: 500_000 }), invoice({ status: "partial", amountPaid: 900_000 })), "pay", `${table}: a second instalment`);
    assert.equal(A.actionFor(table, invoice({ status: "partial", amountPaid: 500_000 }), invoice({ status: "paid", amountPaid: 1_500_000 })), "pay", table);
    assert.equal(A.actionFor(table, invoice({ status: "paid", amountPaid: 1_500_000 }), invoice({ status: "sent", amountPaid: 0 })), "update", `${table}: a reversed payment`);
    assert.equal(A.actionFor(table, invoice({ status: "sent" }), invoice({ status: "void" })), "void", table);
    assert.equal(A.actionFor(table, invoice(), invoice({ notes: "PO 123" })), "update", table);
  }
});

test("actionFor: payroll runs, periods, withholding slips, expenses, imports", () => {
  assert.equal(A.actionFor("payroll_runs", { status: "draft" }, { status: "approved" }), "approve");
  assert.equal(A.actionFor("payroll_runs", { status: "approved" }, { status: "paid" }), "pay");
  assert.equal(A.actionFor("payroll_runs", { status: "draft", payDate: "2026-10-01" }, { status: "draft", payDate: "2026-10-02" }), "update");
  assert.equal(A.actionFor("periods", null, { id: "ent-1:2026-09", locked: true }), "lock", "the first lock creates the row");
  assert.equal(A.actionFor("periods", { locked: true }, { locked: false }), "unlock");
  assert.equal(A.actionFor("periods", { locked: false }, { locked: true }), "lock");
  assert.equal(A.actionFor("periods", { locked: true }, { locked: true }), "update");
  assert.equal(A.actionFor("withholding_slips", { status: "draft" }, { status: "issued" }), "post");
  assert.equal(A.actionFor("withholding_slips", { status: "issued" }, { status: "reported" }), "update");
  assert.equal(A.actionFor("payments", { status: "posted" }, { status: "void" }), "void");
  assert.equal(A.actionFor("payments", null, { status: "posted" }), "create");
  assert.equal(A.actionFor("import_batches", null, { id: "b", kind: "bank_csv" }), "import");
});

// ---------- diffRows ----------

test("diffRows: scalar fields carry both values, unchanged and noise fields are left out", () => {
  const changes = A.diffRows("invoices", invoice({ updatedAt: "2026-10-01T02:00:00.000Z" }), invoice({ status: "sent", total: 1_750_000, notes: "PO 123", updatedAt: "2026-10-02T05:00:00.000Z", createdAt: "2026-10-02T05:00:00.000Z", sentAt: "2026-10-02T05:00:00.000Z" }));
  assert.deepEqual(changes, [
    { field: "total", from: "1,500,000", to: "1,750,000" },
    { field: "status", from: "draft", to: "sent" },
    { field: "notes", to: "PO 123" },
    { field: "sentAt", to: "2026-10-02T05:00:00.000Z" },
  ]);
  assert.deepEqual(A.diffRows("invoices", invoice(), invoice()), []);
  assert.deepEqual(A.diffRows("users", { id: "u", name: "Ayu", lastLoginAt: "2026-10-01T00:00:00.000Z" }, { id: "u", name: "Ayu", lastLoginAt: "2026-10-02T00:00:00.000Z" }), [], "a sign-in is not a change");
  assert.deepEqual(A.diffRows("vendors", { id: "v", phone: "" }, { id: "v", phone: undefined, email: null }), [], "empty, null and missing are the same");
  assert.deepEqual(A.diffRows("contacts", { id: "c", tags: [] }, { id: "c", attachments: [], tags: undefined, extra: {} }), [], "so are an empty list and an empty object");
  assert.deepEqual(A.diffRows("vendors", { id: "v", phone: "0811", active: true }, { id: "v", active: false }), [{ field: "phone", from: "0811" }, { field: "active", from: "true", to: "false" }]);
});

test("diffRows: secret fields are never present, by name or by value", () => {
  const before = { id: "u-1", name: "Ayu", role: "accountant", passwordHash: "scrypt$OLD-SECRET", apiToken: "tok-OLD", profile: { nickname: "ayu", resetSecret: "RS-OLD" } };
  const after = { id: "u-1", name: "Ayu", role: "admin", passwordHash: "scrypt$NEW-SECRET", apiToken: "tok-NEW", profile: { nickname: "ay", resetSecret: "RS-NEW" } };
  const changes = A.diffRows("users", before, after);
  assert.deepEqual(changes, [{ field: "role", from: "accountant", to: "admin" }, { field: "profile.nickname", from: "ayu", to: "ay" }]);
  assert.doesNotMatch(JSON.stringify(changes), /SECRET|tok-|RS-|passwordHash|apiToken|resetSecret/);
  // Bank statement lines carry a de-duplication hash: not a secret, but it matches the rule and stays out too.
  assert.deepEqual(A.diffRows("bank_transactions", { id: "t", hash: "aaa", status: "unmatched" }, { id: "t", hash: "bbb", status: "matched" }), [{ field: "status", from: "unmatched", to: "matched" }]);
});

test("diffRows: long values are cut to about 120 characters", () => {
  const long = "x".repeat(500);
  const [c] = A.diffRows("vendors", { id: "v", notes: "short" }, { id: "v", notes: long });
  assert.equal(c.field, "notes");
  assert.equal(c.from, "short");
  assert.equal(c.to!.length, 120);
  assert.ok(c.to!.endsWith("…"));
});

test("diffRows: lists and deep objects are named without values, one level of object is compared field by field", () => {
  const b = invoice();
  const a = invoice({
    lines: [{ id: "l1", description: "Monthly bookkeeping", qty: 2, unitPrice: 1_500_000, amount: 3_000_000, accountId: "a-sales", taxCode: "none" }],
    customer: { type: "company", id: "co-1", name: "PT Contoh Abadi Jaya", email: "finance@contoh.example" },
    attachments: [{ id: "f1", name: "po.pdf" }],
  });
  assert.deepEqual(A.diffRows("invoices", b, a), [
    { field: "customer.name", from: "PT Contoh Abadi", to: "PT Contoh Abadi Jaya" },
    { field: "customer.email", to: "finance@contoh.example" },
    { field: "lines" },
    { field: "attachments" },
  ]);
  // Deeper than one level: the name only.
  assert.deepEqual(A.diffRows("recurring_templates", { id: "r", payload: { memo: "Rent", lines: [{ amount: 1 }], meta: { a: 1 } } }, { id: "r", payload: { memo: "Rent Oct", lines: [{ amount: 2 }], meta: { a: 2 } } }), [
    { field: "payload.memo", from: "Rent", to: "Rent Oct" }, { field: "payload.lines" }, { field: "payload.meta" },
  ]);
  // An object that appears or disappears is spelled out too.
  assert.deepEqual(A.diffRows("bank_transactions", { id: "t", matchedDocument: { type: "invoice", id: "inv-1" } }, { id: "t" }), [
    { field: "matchedDocument.type", from: "invoice" }, { field: "matchedDocument.id", from: "inv-1" },
  ]);
});

test("diffRows: an edited journal entry shows its new total, not its revisions", () => {
  const b = journal();
  const a = journal({
    memo: "Office rent October", updatedAt: "2026-10-01T03:00:00.000Z",
    lines: [{ accountId: "a-rent", accountCode: "6-2000", debit: 5_500_000, credit: 0 }, { accountId: "a-bank", accountCode: "1-1100", debit: 0, credit: 5_500_000 }],
    revisions: [{ at: "2026-10-01T03:00:00.000Z", byName: "Ayu", date: b.date, memo: b.memo, source: b.source, lines: b.lines }],
  });
  assert.deepEqual(A.diffRows("journal_entries", b, a), [
    { field: "memo", from: "Office rent September", to: "Office rent October" }, { field: "lines" }, { field: "total", from: "5,000,000", to: "5,500,000" },
  ]);
});

// ---------- summary and draft ----------

test("auditSummary: status first, values next, changed lists by name, ids and timestamps folded away", () => {
  const changes = A.diffRows("invoices", invoice(), invoice({ status: "sent", total: 1_750_000, journalId: "je-9", sentAt: "2026-10-02T05:00:00.000Z", lines: [] }));
  assert.equal(A.auditSummary(changes), "status draft → sent · total 1,500,000 → 1,750,000 · lines changed · +2 more");
  assert.equal(A.auditSummary([{ field: "journalId", to: "je-9" }]), "journalId (none) → je-9", "shown when nothing else changed");
  assert.equal(A.auditSummary([{ field: "phone", from: "0811" }]), "phone 0811 → (none)");
  assert.equal(A.auditSummary([{ field: "status", from: "unmatched", to: "matched" }, { field: "matchedDocument.type", to: "invoice" }, { field: "matchedDocument.id", to: "inv-1" }, { field: "matchedJournalId", to: "je-1" }]), "status unmatched → matched · matchedDocument.type (none) → invoice · +2 more");
  assert.equal(A.auditSummary([]), undefined);
});

test("draftAudit: what is written for a creation, an update, a deletion, and when nothing is written", () => {
  const created = A.draftAudit("journal_entries", null, journal());
  assert.deepEqual(created, { table: "journal_entries", docId: "je-1", action: "post", label: "JE-2026-0007", entityId: ENTITY, summary: "status posted · date 2026-09-15 · source manual · total 5,000,000 · memo Office rent September" });
  const posted = A.draftAudit("invoices", invoice(), invoice({ status: "sent", total: 1_750_000, updatedAt: "2026-10-02T05:00:00.000Z" }));
  assert.equal(posted?.action, "post");
  assert.equal(posted?.label, "INV-2026-0012 · PT Contoh Abadi");
  assert.equal(posted?.summary, "status draft → sent · total 1,500,000 → 1,750,000");
  assert.equal(posted?.changes?.length, 2);
  const removed = A.draftAudit("vendors", { id: "v-1", name: "Notaris Contoh", category: "notary" }, null);
  assert.deepEqual(removed, { table: "vendors", docId: "v-1", action: "delete", label: "Notaris Contoh", entityId: undefined, summary: "category notary" });
  assert.equal(A.draftAudit("invoices", invoice(), invoice({ updatedAt: "2026-10-02T05:00:00.000Z" })), null, "only noise changed");
  assert.equal(A.draftAudit("vendors", null, null), null);
  assert.equal(A.draftAudit("entities", null, { id: "ent-9", name: "PT Baru" })?.entityId, "ent-9", "an entity belongs to its own books");
  assert.deepEqual(A.draftAudit("periods", null, { id: "ent-1:2026-09", entityId: ENTITY, period: "2026-09", locked: true }), { table: "periods", docId: "ent-1:2026-09", action: "lock", label: "2026-09", entityId: ENTITY, summary: "locked" });
  assert.deepEqual(A.draftAudit("import_batches", null, { id: "b-1", kind: "bank_csv", entityId: ENTITY, fileName: "mutasi-sep.csv", rows: 130, inserted: 120, skipped: 10, errors: [] }), {
    table: "import_batches", docId: "b-1", action: "import", label: "bank_csv · mutasi-sep.csv", entityId: ENTITY, summary: "rows 130 · inserted 120 · skipped 10", count: 120,
  });
});

test("draftAudit: a password reset is logged without the secret", () => {
  const user = { id: "u-1", name: "Ayu", email: "ayu@ila.example", role: "accountant", passwordHash: "scrypt$OLD-SECRET", active: true };
  const draft = A.draftAudit("users", user, { ...user, passwordHash: "scrypt$NEW-SECRET" });
  assert.deepEqual(draft, { table: "users", docId: "u-1", action: "update", label: "Ayu · ayu@ila.example", entityId: undefined, summary: "password changed", changes: undefined });
  const both = A.draftAudit("users", user, { ...user, role: "admin", passwordHash: "scrypt$NEW-SECRET" });
  assert.equal(both?.summary, "role accountant → admin · password changed");
  assert.doesNotMatch(JSON.stringify([draft, both, A.draftAudit("users", null, user), A.draftAudit("users", user, null)]), /SECRET|passwordHash/);
});

// ---------- labels and links ----------

test("auditLabel: the reference people know a record by", () => {
  assert.equal(A.auditLabel("journal_entries", journal()), "JE-2026-0007");
  assert.equal(A.auditLabel("invoices", invoice()), "INV-2026-0012 · PT Contoh Abadi");
  assert.equal(A.auditLabel("bills", { id: "b", number: "BILL-2026-0003", vendor: { type: "vendor", name: "Notaris Contoh" } }), "BILL-2026-0003 · Notaris Contoh");
  assert.equal(A.auditLabel("payments", { id: "p", kind: "disbursement", amount: 20_000, currency: "IDR", payee: "Bank Contoh", date: "2026-09-30", lines: [] }), "Expense IDR 20,000 · Bank Contoh · 2026-09-30");
  assert.equal(A.auditLabel("payments", { id: "p", kind: "receipt", amount: 2_500_000, currency: "IDR", date: "2026-09-30", lines: [] }), "Deposit IDR 2,500,000 · 2026-09-30");
  assert.equal(A.auditLabel("payments", { id: "p", kind: "receipt", invoiceId: "inv-1", amount: 1_500.5, currency: "USD", date: "2026-09-30" }), "Receipt USD 1,500.5 · 2026-09-30");
  assert.equal(A.auditLabel("payments", { id: "p", kind: "disbursement", billId: "b-1", amount: 750_000, currency: "IDR", date: "2026-09-30" }), "Bill payment IDR 750,000 · 2026-09-30");
  assert.equal(A.auditLabel("payments", { id: "p", kind: "transfer", amount: 1_000_000, currency: "IDR", date: "2026-09-30" }), "Transfer IDR 1,000,000 · 2026-09-30");
  assert.equal(A.auditLabel("accounts", { id: "a", code: "1-1100", name: "Bank" }), "1-1100 Bank");
  assert.equal(A.auditLabel("periods", { id: "ent-1:2026-09", period: "2026-09", locked: true }), "2026-09");
  assert.equal(A.auditLabel("payroll_runs", { id: "r", period: "2026-10" }), "Payroll 2026-10");
  assert.equal(A.auditLabel("withholding_slips", { id: "s", number: "BP-2026-0004", counterparty: { name: "CV Jasa Contoh" } }), "BP-2026-0004 · CV Jasa Contoh");
  assert.equal(A.auditLabel("tax_obligations", { id: "ent-1:ppn:2026-09", label: "PPN (VAT) return", period: "2026-09" }), "PPN (VAT) return · 2026-09");
  assert.equal(A.auditLabel("contacts", { id: "c", firstName: "Made", lastName: "Contoh" }), "Made Contoh");
  assert.equal(A.auditLabel("users", { id: "u", name: "Ayu", email: "ayu@ila.example", passwordHash: "x" }), "Ayu · ayu@ila.example");
  for (const table of ["entities", "companies", "vendors", "employees", "fixed_assets", "bank_accounts", "recurring_templates"]) assert.equal(A.auditLabel(table, { id: "x", name: "Contoh" }), "Contoh", table);
  assert.equal(A.auditLabel("import_batches", { id: "i", kind: "bank_csv", fileName: "mutasi-sep.csv" }), "bank_csv · mutasi-sep.csv");
  assert.equal(A.auditLabel("vendors", { id: "v-9" }), "v-9", "falls back to the id");
  assert.equal(A.auditLabel("vendors", null), "(no reference)");
  assert.equal(A.auditLabel("vendors", { id: "v", name: "n".repeat(300) }).length, 120);
});

test("auditTableName and auditQueryFrom: words for the filters, filters from a query string", () => {
  assert.equal(A.auditTableName("journal_entries"), "journal entry");
  assert.equal(A.auditTableName("journal_entries", true), "journal entries");
  assert.equal(A.auditTableName("some_new_table", true), "some new table");
  assert.ok(!A.AUDITED_TABLES.some((t) => ["audit_log", "counters", "settings", "fx_rates"].includes(t)));
  assert.ok(A.AUDITED_TABLES.includes("journal_entries") && A.AUDITED_TABLES.includes("users"));
  const q = new URLSearchParams("entity=ent-1&user=u-1&table=invoices&action=post&from=2026-03-01&to=2026-03-31&q=%20INV%20&doc=inv-1&page=3&other=x");
  assert.deepEqual(A.auditQueryFrom((k) => q.get(k)), { entityId: "ent-1", userId: "u-1", table: "invoices", action: "post", from: "2026-03-01", to: "2026-03-31", q: "INV", docId: "inv-1" });
  assert.deepEqual(A.auditQueryFrom(() => ""), { entityId: undefined, userId: undefined, table: undefined, action: undefined, from: undefined, to: undefined, q: undefined, docId: undefined });
});

test("auditHref: records with a page are linked", () => {
  const e = (table: string, label = "x", entityId: string | null = ENTITY) => A.auditHref({ table: table as AuditEntry["table"], docId: "doc 1", entityId: entityId ?? undefined, label });
  assert.equal(e("journal_entries"), "/books/ent-1/journal/doc%201");
  assert.equal(e("invoices"), "/books/ent-1/sales/doc%201");
  assert.equal(e("bills"), "/books/ent-1/purchases/doc%201");
  assert.equal(e("payments", "Expense IDR 20,000"), "/books/ent-1/expenses/doc%201");
  assert.equal(e("payments", "Deposit IDR 20,000"), "/books/ent-1/deposits/doc%201");
  assert.equal(e("payments", "Receipt IDR 20,000"), undefined, "receipts live on their invoice");
  assert.equal(e("fixed_assets"), "/books/ent-1/assets/doc%201");
  assert.equal(e("employees"), "/payroll/ent-1/employees/doc%201/edit");
  assert.equal(e("payroll_runs"), "/payroll/ent-1/runs/doc%201");
  assert.equal(e("withholding_slips"), "/tax/ent-1/withholding/doc%201");
  assert.equal(e("companies", "x", null), "/clients/companies/doc%201");
  assert.equal(e("contacts", "x", null), "/clients/contacts/doc%201");
  assert.equal(e("vendors", "x", null), "/clients/vendors/doc%201");
  assert.equal(e("entities"), "/settings/entities/doc%201");
  assert.equal(e("invoices", "x", null), undefined, "no entity, no books page");
  assert.equal(e("activities"), undefined);
  assert.equal(A.auditHref({ table: "accounts", docId: "", entityId: ENTITY, label: "64 accounts" }), undefined, "bulk entries have no record");
});

// ---------- the hook in lib/db.ts (file backend) ----------

test("storage hook: insert, update and remove leave one entry each, attributed to System", async () => {
  const { db, storageBackend } = D;
  assert.equal(storageBackend(), "file");
  const vendor: Vendor = { id: "v-1", name: "Notaris Contoh", category: "notary", active: true, createdAt: "2026-01-05T02:00:00.000Z" };
  await db.insert("vendors", vendor);
  await db.update("vendors", "v-1", { phone: "+62 811 0000 000", region: "Bali" });
  await db.update("vendors", "v-1", { region: "Bali" }); // nothing changed: not logged
  assert.equal(await db.update("vendors", "missing", { region: "Lombok" }), null);
  await db.remove("vendors", "v-1");
  await db.remove("vendors", "v-1"); // already gone: not logged
  // Machine state is not logged.
  await db.upsert("settings", { id: "k", value: 1, updatedAt: "2026-01-05T02:00:00.000Z" });
  await db.nextNumber(ENTITY, "INV", new Date("2026-01-05"));

  const log = await db.list("audit_log");
  assert.deepEqual(log.map((e) => [e.table, e.docId, e.action, e.label]), [
    ["vendors", "v-1", "create", "Notaris Contoh"], ["vendors", "v-1", "update", "Notaris Contoh"], ["vendors", "v-1", "delete", "Notaris Contoh"],
  ]);
  for (const e of log) {
    assert.equal(e.userName, "System");
    assert.equal(e.userId, undefined);
    assert.match(e.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(e.id);
  }
  assert.equal(log[0].summary, "category notary");
  assert.deepEqual(log[1].changes, [{ field: "phone", to: "+62 811 0000 000" }, { field: "region", to: "Bali" }]);
  assert.equal(log[1].summary, "phone (none) → +62 811 0000 000 · region (none) → Bali");
  assert.equal(log.filter((e) => (e.table as string) === "audit_log").length, 0, "the log does not log itself");
  assert.equal((await db.list("vendors")).length, 0);
});

test("storage hook: upsert is a creation the first time and an update after, and a lock is called a lock", async () => {
  const { db } = D;
  await db.upsert("periods", { id: "ent-2:2026-09", entityId: "ent-2", period: "2026-09", locked: true, lockedByUserId: "u-1", lockedAt: "2026-10-05T01:00:00.000Z" });
  await db.upsert("periods", { id: "ent-2:2026-09", entityId: "ent-2", period: "2026-09", locked: false });
  const log = await A.listAudit({ entityId: "ent-2" });
  assert.deepEqual(log.map((e) => [e.action, e.label]), [["unlock", "2026-09"], ["lock", "2026-09"]], "newest first");
  assert.equal(log[0].summary, "locked true → false · +2 more");
});

test("storage hook: a large insertMany is one import entry, a small one is logged row by row", async () => {
  const { db } = D;
  const account = (i: number, entityId = "ent-3"): Account => ({ id: `acc-${entityId}-${i}`, entityId, code: `6-${String(1000 + i)}`, name: `Expense ${i}`, type: "expense", subtype: "opex", normalBalance: "debit", isSystem: false, active: true });
  assert.equal(await db.insertMany("accounts", Array.from({ length: 25 }, (_, i) => account(i))), 25);
  assert.equal(await db.insertMany("accounts", Array.from({ length: 3 }, (_, i) => account(100 + i))), 3);
  assert.equal(await db.insertMany("accounts", []), 0);
  const log = await A.listAudit({ entityId: "ent-3" });
  const bulk = log.filter((e) => e.action === "import");
  assert.equal(bulk.length, 1);
  assert.equal(bulk[0].count, 25);
  assert.equal(bulk[0].label, "25 accounts");
  assert.equal(bulk[0].docId, "");
  assert.equal(bulk[0].table, "accounts");
  assert.equal(bulk[0].summary, "6-1000 Expense 0, 6-1001 Expense 1, 6-1002 Expense 2…");
  const single = log.filter((e) => e.action === "create");
  assert.deepEqual(single.map((e) => e.label).sort(), ["6-1100 Expense 100", "6-1101 Expense 101", "6-1102 Expense 102"]);
  assert.equal(log.length, 4);
  // Rows of several entities in one batch: the entry belongs to none of them.
  await db.insertMany("accounts", Array.from({ length: 21 }, (_, i) => account(i, i % 2 ? "ent-4" : "ent-5")));
  const mixed = (await db.list("audit_log")).filter((e) => e.label === "21 accounts");
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].entityId, undefined);
});

test("storage hook: the actor is the job scope, else the resolved user, else System", async () => {
  const { db } = D;
  const vendor = (id: string): Vendor => ({ id, name: `Vendor ${id}`, category: "other", active: true, createdAt: "2026-01-05T02:00:00.000Z" });
  A.setAuditActorResolver(async () => ({ id: "u-7", name: "Ayu", email: "ayu@ila.example" }));
  await db.insert("vendors", vendor("who-1"));
  await A.withAuditActor({ name: "Recurring job" }, () => db.insert("vendors", vendor("who-2")));
  A.setAuditActorResolver(async () => { throw new Error("no request"); });
  await db.insert("vendors", vendor("who-3"));
  A.setAuditActorResolver(async () => null);
  await db.insert("vendors", vendor("who-4"));
  const by = async (docId: string) => { const [e] = await A.listAudit({ table: "vendors", docId }); return [e.userName, e.userId, e.userEmail]; };
  assert.deepEqual(await by("who-1"), ["Ayu", "u-7", "ayu@ila.example"]);
  assert.deepEqual(await by("who-2"), ["Recurring job", undefined, undefined]);
  assert.deepEqual(await by("who-3"), ["System", undefined, undefined]);
  assert.deepEqual(await by("who-4"), ["System", undefined, undefined]);
  assert.deepEqual((await A.listAudit({ table: "vendors", userId: "u-7" })).map((e) => e.docId), ["who-1"]);
  assert.ok((await A.listAudit({ table: "vendors", userId: A.AUDIT_SYSTEM })).every((e) => !e.userId));
});

test("storage hook: a password never reaches the log", async () => {
  const { db } = D;
  await db.insert("users", { id: "u-9", email: "made@ila.example", name: "Made", role: "accountant", passwordHash: "scrypt$FIRST-SECRET", active: true, createdAt: "2026-01-05T02:00:00.000Z" });
  await db.update("users", "u-9", { passwordHash: "scrypt$SECOND-SECRET" });
  await db.update("users", "u-9", { lastLoginAt: "2026-01-06T02:00:00.000Z" }); // a sign-in: not logged
  const log = await A.listAudit({ table: "users", docId: "u-9" });
  assert.deepEqual(log.map((e) => [e.action, e.summary]), [["update", "password changed"], ["create", "role accountant"]]);
  assert.doesNotMatch(JSON.stringify(await db.list("audit_log")), /SECRET|passwordHash/);
});

test("storage hook: a failing log never fails the write", async (t) => {
  const { db } = D;
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { errors.push(args); });
  const insert = db.insert.bind(db);
  t.mock.method(db, "insert", (async (table: string, row: never) => {
    if (table === "audit_log") throw new Error("audit_log is unavailable");
    return insert(table as "vendors", row);
  }) as typeof db.insert);
  const before = (await db.list("audit_log")).length;
  const stored = await db.insert("vendors", { id: "v-fail", name: "Still saved", category: "other", active: true, createdAt: "2026-01-05T02:00:00.000Z" });
  assert.equal(stored.id, "v-fail");
  assert.equal((await db.update("vendors", "v-fail", { region: "Sumba" }))?.region, "Sumba");
  assert.equal((await db.get("vendors", "v-fail"))?.region, "Sumba");
  assert.equal((await db.list("audit_log")).length, before);
  assert.equal(errors.length, 2);
  assert.match(String(errors[0][0]), /audit_log: could not record a change to vendors: audit_log is unavailable/);
});

test("listAudit: filters, text search, date range and paging on the file backend", async () => {
  const { db } = D;
  const entry = (i: number, over: Partial<AuditEntry> = {}): AuditEntry => ({ id: `q-${i}`, at: `2026-03-${String(i).padStart(2, "0")}T04:00:00.000Z`, userName: "Ayu", userId: "u-q", entityId: "ent-q", table: "invoices", docId: `inv-${i}`, action: "update", label: `INV-2026-00${String(i).padStart(2, "0")} · PT Contoh`, ...over });
  await db.insertMany("audit_log", [entry(1), entry(2, { action: "post" }), entry(3, { table: "bills", label: "BILL-2026-0003 · Notaris" }), entry(4), entry(5, { userId: "u-other", userName: "Made" })]);
  const ids = async (q: Parameters<typeof A.listAudit>[0]) => (await A.listAudit({ entityId: "ent-q", ...q })).map((e) => e.id);
  assert.deepEqual(await ids({}), ["q-5", "q-4", "q-3", "q-2", "q-1"], "newest first");
  assert.deepEqual(await ids({ table: "bills" }), ["q-3"]);
  assert.deepEqual(await ids({ action: "post" }), ["q-2"]);
  assert.deepEqual(await ids({ action: "not-an-action" }), ["q-5", "q-4", "q-3", "q-2", "q-1"], "an unknown action is ignored");
  assert.deepEqual(await ids({ userId: "u-other" }), ["q-5"]);
  assert.deepEqual(await ids({ docId: "inv-4" }), ["q-4"]);
  assert.deepEqual(await ids({ q: "notaris" }), ["q-3"]);
  assert.deepEqual(await ids({ q: "  inv-2026-0002 " }), ["q-2"]);
  assert.deepEqual(await ids({ limit: 2 }), ["q-5", "q-4"]);
  assert.deepEqual(await ids({ limit: 2, offset: 2 }), ["q-3", "q-2"]);
  assert.deepEqual(await ids({ limit: 2, offset: 4 }), ["q-1"]);
  // Days are WITA (UTC+8): 04:00Z on the 2nd is noon on the 2nd in Bali; 20:00Z on the 1st would already be the 2nd.
  assert.deepEqual(await ids({ from: "2026-03-02", to: "2026-03-03" }), ["q-3", "q-2"]);
  await db.insert("audit_log", entry(6, { at: "2026-03-09T17:30:00.000Z" }));
  assert.deepEqual(await ids({ from: "2026-03-10", to: "2026-03-10" }), ["q-6"], "01:30 on the 10th in Bali");
  assert.deepEqual(await ids({ from: "not a date" }), ["q-6", "q-5", "q-4", "q-3", "q-2", "q-1"], "a malformed day is ignored");
  assert.deepEqual((await A.listAudit({ entityId: "nobody" })), []);
});
