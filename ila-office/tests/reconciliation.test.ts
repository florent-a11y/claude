import { test } from "node:test";
import assert from "node:assert/strict";
import { bankLineAmount, buildReconciliation } from "../lib/reconciliation";
import type { BankAccount, BankTransaction, JournalEntry } from "../lib/types";

const bank: BankAccount = { id: "b1", entityId: "e1", accountId: "gl-bank", name: "OCBC IDR", currency: "IDR", active: true };
const je = (id: string, date: string, memo: string, inIDR: number, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id, entityId: "e1", number: id, date, period: date.slice(0, 7), memo, source: "manual", status: "posted", createdAt: date,
  lines: inIDR >= 0
    ? [{ accountId: "gl-bank", accountCode: "1-1100", debit: inIDR, credit: 0 }, { accountId: "x", accountCode: "4-1000", debit: 0, credit: inIDR }]
    : [{ accountId: "gl-bank", accountCode: "1-1100", debit: 0, credit: -inIDR }, { accountId: "x", accountCode: "6-1000", debit: -inIDR, credit: 0 }],
  ...extra,
});
const tx = (id: string, date: string, amount: number, balance: number, extra: Partial<BankTransaction> = {}): BankTransaction => ({ id, entityId: "e1", bankAccountId: "b1", date, description: id, amount, balance, hash: id, status: "unmatched", createdAt: date, ...extra });

test("statement and books agree once outstanding items are listed", () => {
  const entries = [
    je("JE-1", "2026-01-05", "Capital", 250_000_000),          // on the bank statement before the import started: ticked as cleared
    je("JE-2", "2026-09-15", "Receipt INV-1", 2_500_000),       // matched to a statement line
    je("JE-3", "2026-09-26", "Payroll", -21_000_000),           // in the books, not yet on the statement
  ];
  entries[0].bankCleared = { b1: "2026-08" };
  const transactions = [
    tx("T-1", "2026-09-15", 2_500_000, 252_500_000, { status: "matched", matchedJournalId: "JE-2" }),
    tx("T-2", "2026-09-30", -15_000, 252_485_000),              // bank fee not yet booked
  ];
  const r = buildReconciliation({ bank, transactions, entries, period: "2026-09" });
  assert.equal(r.endDate, "2026-09-30");
  assert.equal(r.statementBalance, 252_485_000);
  assert.equal(r.statementBalanceSource, "statement");
  assert.equal(r.ledgerBalance, 250_000_000 + 2_500_000 - 21_000_000);
  assert.deepEqual(r.unbookedStatement.map((i) => i.id), ["T-2"]);
  assert.deepEqual(r.unpresentedLedger.map((i) => i.id), ["JE-3"]);
  assert.deepEqual(r.clearedLedger.map((i) => i.id), ["JE-1"]);
  assert.equal(r.adjustedBank, 252_485_000 - 21_000_000);
  assert.equal(r.adjustedBooks, 231_500_000 - 15_000);
  assert.equal(r.difference, 0);
  assert.ok(r.balanced);
});

test("a sign-off settles older items; a manual statement balance overrides the import", () => {
  const settled: BankAccount = { ...bank, reconciledThrough: "2026-08-31" };
  const entries = [je("JE-1", "2026-01-05", "Capital", 250_000_000), je("JE-3", "2026-09-26", "Payroll", -21_000_000)];
  const r = buildReconciliation({ bank: settled, transactions: [], entries, period: "2026-09", statementBalance: 250_000_000 });
  assert.equal(r.statementBalanceSource, "manual");
  assert.deepEqual(r.unpresentedLedger.map((i) => i.id), ["JE-3"], "January is settled by the August sign-off");
  assert.equal(r.difference, 0);
  assert.ok(r.balanced);
  const none = buildReconciliation({ bank: settled, transactions: [], entries, period: "2026-09" });
  assert.equal(none.statementBalance, null);
  assert.equal(none.balanced, false);
});

test("foreign-currency accounts reconcile in their own currency", () => {
  const usd: BankAccount = { ...bank, id: "b2", accountId: "gl-usd", currency: "USD" };
  const line = { accountId: "gl-usd", accountCode: "1-1111", debit: 16_450_000, credit: 0, currency: "USD", fxAmount: 1000, fxRate: 16_450 };
  assert.deepEqual(bankLineAmount(line, "USD"), { amount: 1000, approximate: false });
  assert.deepEqual(bankLineAmount({ ...line, debit: 0, credit: 16_450_000 }, "USD"), { amount: -1000, approximate: false });
  assert.deepEqual(bankLineAmount({ accountId: "gl-usd", accountCode: "1-1111", debit: 0, credit: 8_200_000, fxRate: 16_400 }, "USD"), { amount: -500, approximate: true });
  const entries: JournalEntry[] = [{ id: "JE-9", entityId: "e1", number: "JE-9", date: "2026-09-28", period: "2026-09", memo: "Receipt", source: "receipt", status: "posted", createdAt: "2026-09-28", lines: [line, { accountId: "ar", accountCode: "1-1200", debit: 0, credit: 16_450_000 }] }];
  const r = buildReconciliation({ bank: usd, transactions: [tx("A-1", "2026-09-28", 1000, 1000, { bankAccountId: "b2", status: "matched", matchedJournalId: "JE-9" })], entries, period: "2026-09" });
  assert.equal(r.ledgerBalance, 1000);
  assert.equal(r.difference, 0);
  assert.ok(r.balanced);
});
