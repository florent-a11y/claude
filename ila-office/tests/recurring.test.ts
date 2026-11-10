import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccounts } from "../lib/coa";
import { findByCode } from "../lib/balances";
import { MAX_OCCURRENCES_PER_RUN, advance, isEnded, nextOccurrence, occurrencesDue, payloadOf, templateFromDocument, templateSummary } from "../lib/recurring";
import type { Account, Bill, Invoice, JournalEntry, Payment, RecurringTemplate } from "../lib/types";

/** Recurring transactions: the schedule arithmetic and the templates built from existing documents (synthetic data). */

let seq = 0;
const newId = () => `id-${++seq}`;
const ENTITY = "ent-1";
const accounts: Account[] = buildAccounts(ENTITY, newId);
const code = (c: string) => findByCode(accounts, c)!;

test("nextOccurrence: monthly keeps the chosen day and clamps to short months, leap years included", () => {
  // 31st: February gives 28 (or 29), March is back on the 31st when dayOfMonth is kept on the template.
  assert.equal(nextOccurrence("2026-01-31", "monthly", 31), "2026-02-28");
  assert.equal(nextOccurrence("2026-02-28", "monthly", 31), "2026-03-31");
  assert.equal(nextOccurrence("2028-01-31", "monthly", 31), "2028-02-29", "leap year");
  assert.equal(nextOccurrence("2028-02-29", "monthly", 31), "2028-03-31");
  // Without dayOfMonth the day of the given date is used, so the 31st drifts to the 28th for good (as addMonths does).
  assert.equal(nextOccurrence("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(nextOccurrence("2026-02-28", "monthly"), "2026-03-28");
  assert.equal(nextOccurrence("2026-12-15", "monthly", 15), "2027-01-15", "year roll-over");
  assert.equal(nextOccurrence("2026-04-30", "monthly", 30), "2026-05-30");
});

test("nextOccurrence: quarterly, six-monthly, annual and weekly", () => {
  assert.equal(nextOccurrence("2026-11-30", "quarterly", 30), "2027-02-28");
  assert.equal(nextOccurrence("2027-02-28", "quarterly", 30), "2027-05-30");
  assert.equal(nextOccurrence("2026-08-31", "semiannual", 31), "2027-02-28");
  assert.equal(nextOccurrence("2027-02-28", "semiannual", 31), "2027-08-31");
  assert.equal(nextOccurrence("2028-02-29", "annual", 29), "2029-02-28");
  assert.equal(nextOccurrence("2031-02-28", "annual", 29), "2032-02-29");
  assert.equal(nextOccurrence("2026-12-28", "weekly"), "2027-01-04");
  assert.equal(nextOccurrence("2026-12-28", "weekly", 31), "2027-01-04", "weekly ignores dayOfMonth");
});

test("occurrencesDue: every date from nextDate up to today, stopped by the end date, capped", () => {
  const monthly = { frequency: "monthly" as const, nextDate: "2026-08-31", dayOfMonth: 31 };
  assert.deepEqual(occurrencesDue(monthly, "2026-11-10"), ["2026-08-31", "2026-09-30", "2026-10-31"]);
  assert.deepEqual(occurrencesDue(monthly, "2026-08-31"), ["2026-08-31"], "due on the day itself");
  assert.deepEqual(occurrencesDue(monthly, "2026-08-30"), [], "nothing before the next date");
  assert.deepEqual(occurrencesDue({ ...monthly, endDate: "2026-09-30" }, "2026-11-10"), ["2026-08-31", "2026-09-30"], "the end date is inclusive");
  assert.deepEqual(occurrencesDue({ ...monthly, endDate: "2026-08-15" }, "2026-11-10"), [], "an end date before the next date gives nothing");
  const weekly = occurrencesDue({ frequency: "weekly" as const, nextDate: "2024-01-01" }, "2026-11-10");
  assert.equal(weekly.length, MAX_OCCURRENCES_PER_RUN, "a forgotten template cannot flood the books");
  assert.equal(weekly[0], "2024-01-01");
  assert.equal(weekly[weekly.length - 1], "2024-06-10");
});

test("advance: next date from the occurrence that ran, ended once the end date is passed", () => {
  const t = { frequency: "monthly" as const, dayOfMonth: 31, endDate: undefined as string | undefined, status: "active" as const };
  assert.deepEqual(advance(t, "2026-01-31"), { nextDate: "2026-02-28", status: "active" });
  assert.deepEqual(advance({ ...t, endDate: "2026-02-28" }, "2026-01-31"), { nextDate: "2026-02-28", status: "active" }, "an occurrence on the end date still runs");
  assert.deepEqual(advance({ ...t, endDate: "2026-02-27" }, "2026-01-31"), { nextDate: "2026-02-28", status: "ended" });
  assert.deepEqual(advance({ ...t, status: "paused" }, "2026-01-31"), { nextDate: "2026-02-28", status: "paused" }, "pause is kept");
  assert.equal(isEnded({ nextDate: "2026-03-01", endDate: "2026-02-28" }), true);
  assert.equal(isEnded({ nextDate: "2026-02-28", endDate: "2026-02-28" }), false);
  assert.equal(isEnded({ nextDate: "2026-02-28" }), false);
});

const invoice: Invoice = {
  id: "inv-1", entityId: ENTITY, number: "INV-2026-0012", customer: { type: "company", id: "co-1", name: "PT Sunrise Villas", email: "ap@sunrise.test" },
  date: "2026-10-31", dueDate: "2026-11-05", currency: "USD", fxRate: 16_250,
  lines: [{ id: "l1", serviceId: "svc-1", description: "Monthly bookkeeping", qty: 1, unitPrice: 300, amount: 300, accountId: code("4-1000").id, taxCode: "out_of_scope" }, { id: "l2", description: "Tax filing", qty: 2, unitPrice: 50, amount: 100, accountId: code("4-1000").id, taxCode: "out_of_scope" }],
  subtotal: 400, discount: 0, ppnAmount: 0, total: 400, amountPaid: 0, status: "sent", journalId: "je-1", fakturNumber: "010.000-26.00000001", notes: "Retainer", createdAt: "2026-10-31T01:00:00.000Z",
};

test("templateFromDocument(invoice): monthly on the invoice's day, due days from the document, payload without dates or e-Faktur number", () => {
  const d = templateFromDocument("invoice", invoice);
  assert.equal(d.kind, "invoice");
  assert.equal(d.name, "Invoice · PT Sunrise Villas");
  assert.equal(d.frequency, "monthly");
  assert.equal(d.dayOfMonth, 31);
  assert.equal(d.startDate, "2026-11-30", "the next occurrence after the invoice date");
  assert.equal(d.nextDate, d.startDate);
  assert.equal(d.status, "active");
  assert.equal(d.autoPost, true);
  assert.equal(d.dueDays, 5);
  assert.equal(d.sourceDocId, "inv-1");
  const p = payloadOf({ kind: "invoice", payload: d.payload });
  assert.deepEqual(p.customer, invoice.customer);
  assert.equal(p.currency, "USD");
  assert.equal(p.fxRate, 16_250);
  assert.equal(p.notes, "Retainer");
  assert.deepEqual(p.lines, [
    { description: "Monthly bookkeeping", qty: 1, unitPrice: 300, accountId: code("4-1000").id, taxCode: "out_of_scope", serviceId: "svc-1" },
    { description: "Tax filing", qty: 2, unitPrice: 50, accountId: code("4-1000").id, taxCode: "out_of_scope", serviceId: undefined },
  ]);
  assert.equal("date" in (p as object), false);
  assert.equal("dueDate" in (p as object), false);
  assert.equal("fakturNumber" in (p as object), false);
  const s = templateSummary(d);
  assert.equal(s.party, "PT Sunrise Villas");
  assert.equal(s.currency, "USD");
  assert.equal(s.amount, 400);
  assert.equal(s.lines.length, 2);
});

const bill: Bill = {
  id: "bill-1", entityId: ENTITY, number: "BILL-2026-0003", vendor: { type: "vendor", id: "v-1", name: "Bali Office Space", npwp: "01.234.567.8-901.000" }, vendorInvoiceNumber: "BOS/2026/10/17",
  date: "2026-10-01", dueDate: "2026-10-15", currency: "IDR", fxRate: 1,
  lines: [{ id: "b1", description: "Office rent October", amount: 10_000_000, accountId: code("6-1000").id, taxCode: "none", withholding: "pph4_2", withholdingRate: 0.1, withholdingAmount: 1_000_000 }],
  subtotal: 10_000_000, ppnInput: 0, withholdingTotal: 1_000_000, total: 10_000_000, amountPayable: 9_000_000, amountPaid: 0, status: "sent", createdAt: "2026-10-01T01:00:00.000Z",
};

test("templateFromDocument(bill): vendor and withholding kept, the vendor's own invoice number dropped", () => {
  const d = templateFromDocument("bill", bill);
  assert.equal(d.kind, "bill");
  assert.equal(d.name, "Bill · Bali Office Space");
  assert.equal(d.dayOfMonth, 1);
  assert.equal(d.startDate, "2026-11-01");
  assert.equal(d.dueDays, 14);
  const p = payloadOf({ kind: "bill", payload: d.payload });
  assert.deepEqual(p.vendor, bill.vendor);
  assert.equal(p.currency, "IDR");
  assert.deepEqual(p.lines, [{ description: "Office rent October", amount: 10_000_000, accountId: code("6-1000").id, taxCode: "none", withholding: "pph4_2", withholdingRate: 0.1 }]);
  assert.equal("vendorInvoiceNumber" in (p as object), false);
  assert.equal("date" in (p as object), false);
  const s = templateSummary(d);
  assert.equal(s.party, "Bali Office Space");
  assert.equal(s.amount, 10_000_000);
  assert.equal(s.lines[0].sub, "withholding pph4_2");
});

const expense: Payment = {
  id: "pay-1", entityId: ENTITY, kind: "disbursement", date: "2026-09-30", amount: 1_960_000, currency: "IDR", fxRate: 1, bankAccountId: "bank-idr", journalId: "je-9", bankTransactionId: "tx-1",
  reference: "TRX123", method: "transfer", payee: "Konsultan IT", memo: "IT support September", lines: [{ accountId: code("6-9000").id, description: "IT support", amount: 2_000_000 }, { accountId: code("2-1320").id, description: "PPh 23", amount: -40_000 }],
  status: "posted", createdAt: "2026-09-30T02:00:00.000Z",
};
const deposit: Payment = {
  id: "pay-2", entityId: ENTITY, kind: "receipt", date: "2026-09-15", amount: 120.5, currency: "USD", fxRate: 16_400, bankAccountId: "bank-usd", journalId: "je-10",
  memo: "Interest", lines: [{ accountId: code("7-1000").id, amount: 120.5 }], status: "posted", createdAt: "2026-09-15T02:00:00.000Z",
};

test("templateFromDocument(expense / deposit): signed lines and payee kept, statement line dropped, the kind must match", () => {
  const e = templateFromDocument("expense", expense);
  assert.equal(e.kind, "expense");
  assert.equal(e.name, "Expense · Konsultan IT");
  assert.equal(e.dayOfMonth, 30);
  assert.equal(e.startDate, "2026-10-30");
  assert.equal(e.dueDays, undefined);
  assert.equal(e.autoPost, true);
  const ep = payloadOf({ kind: "expense", payload: e.payload });
  assert.equal(ep.kind, "expense");
  assert.equal(ep.bankAccountId, "bank-idr");
  assert.equal(ep.payee, "Konsultan IT");
  assert.equal(ep.memo, "IT support September");
  assert.equal(ep.reference, "TRX123");
  assert.equal(ep.fxRate, undefined, "an IDR account carries no rate");
  assert.deepEqual(ep.lines, [{ accountId: code("6-9000").id, description: "IT support", amount: 2_000_000 }, { accountId: code("2-1320").id, description: "PPh 23", amount: -40_000 }]);
  assert.equal("bankTransactionId" in (ep as object), false);
  const es = templateSummary(e, "IDR");
  assert.equal(es.party, "Konsultan IT");
  assert.equal(es.amount, 1_960_000, "the net the bank pays");

  const d = templateFromDocument("deposit", deposit);
  assert.equal(d.kind, "deposit");
  assert.equal(d.name, "Deposit · Interest", "falls back to the memo without a payee");
  const dp = payloadOf({ kind: "deposit", payload: d.payload });
  assert.equal(dp.kind, "deposit");
  assert.equal(dp.fxRate, 16_400, "a foreign-currency account keeps its last rate as the fallback");
  assert.equal(templateSummary(d, "USD").currency, "USD");

  assert.throws(() => templateFromDocument("deposit", expense), /is an expense, not a deposit/);
  assert.throws(() => templateFromDocument("expense", { ...expense, billId: "bill-1" }), /Only expenses and deposits/);
  assert.throws(() => templateFromDocument("expense", { ...expense, kind: "transfer" }), /Only expenses and deposits/);
});

const journal: JournalEntry = {
  id: "je-20", entityId: ENTITY, number: "JE-2026-0020", date: "2026-10-31", period: "2026-10", memo: "Amortisation of prepaid insurance", source: "manual",
  lines: [{ accountId: code("6-9000").id, accountCode: "6-9000", description: "Insurance October", debit: 500_000, credit: 0 }, { accountId: code("1-1400").id, accountCode: "1-1400", debit: 0, credit: 500_000, counterpartyName: "Allianz" }],
  status: "posted", postedAt: "2026-10-31T09:00:00.000Z", createdAt: "2026-10-31T09:00:00.000Z", bankCleared: { "bank-idr": "2026-10" }, attachments: [],
};

test("templateFromDocument(journal): memo and lines kept, reconciliation ticks and attachments left behind, generated sources become manual", () => {
  const d = templateFromDocument("journal", journal);
  assert.equal(d.kind, "journal");
  assert.equal(d.name, "Journal · Amortisation of prepaid insurance");
  assert.equal(d.dayOfMonth, 31);
  assert.equal(d.startDate, "2026-11-30");
  const p = payloadOf({ kind: "journal", payload: d.payload });
  assert.equal(p.memo, journal.memo);
  assert.equal(p.source, "manual");
  assert.equal(p.lines.length, 2);
  assert.equal(p.lines[0].debit, 500_000);
  assert.equal(p.lines[1].credit, 500_000);
  assert.equal(p.lines[1].counterpartyName, "Allianz");
  assert.equal("bankCleared" in (p as object), false);
  const s = templateSummary(d);
  assert.equal(s.currency, "IDR");
  assert.equal(s.amount, 500_000);
  assert.equal(s.party, "Allianz");
  assert.deepEqual(s.lines.map((l) => l.label), ["Dr 6-9000", "Cr 1-1400"]);
  assert.equal(payloadOf({ kind: "journal", payload: templateFromDocument("journal", { ...journal, source: "adjustment" }).payload }).source, "adjustment", "hand-written sources are kept");
  assert.equal(payloadOf({ kind: "journal", payload: templateFromDocument("journal", { ...journal, source: "depreciation" }).payload }).source, "manual", "generated sources are repeated as manual entries");
});

test("a template built from a document runs on the schedule the draft proposes", () => {
  const d = templateFromDocument("bill", bill);
  const t: RecurringTemplate = { ...d, id: "rt-1", entityId: ENTITY, runs: [], createdAt: "2026-10-05T00:00:00.000Z" };
  assert.deepEqual(occurrencesDue(t, "2027-01-15"), ["2026-11-01", "2026-12-01", "2027-01-01"]);
  const after = advance(t, "2027-01-01");
  assert.equal(after.nextDate, "2027-02-01");
  assert.equal(after.status, "active");
});
