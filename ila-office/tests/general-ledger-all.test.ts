import { test } from "node:test";
import assert from "node:assert/strict";
import type { Account, JournalEntry } from "../lib/types";
import { generalLedger, generalLedgerAll } from "../lib/ledger";

const acc = (id: string, code: string, name: string, type: Account["type"], normal: Account["normalBalance"]): Account => ({ id, entityId: "e", code, name, type, subtype: type === "asset" ? "bank" : type === "revenue" ? "revenue" : "opex", normalBalance: normal, isSystem: false, active: true } as Account);
const accounts = [acc("exp", "6-1000", "Salaries", "expense", "debit"), acc("bank", "1-1100", "Bank", "asset", "debit"), acc("rev", "4-1000", "Revenue", "revenue", "credit"), acc("idle", "6-9000", "Unused", "expense", "debit")];
const je = (id: string, date: string, lines: Array<[string, number, number]>): JournalEntry => ({ id, entityId: "e", number: `JE-${id}`, date, period: date.slice(0, 7), memo: `Entry ${id}`, source: "manual", status: "posted", createdAt: "", lines: lines.map(([accountId, debit, credit]) => ({ accountId, accountCode: accounts.find((a) => a.id === accountId)!.code, debit, credit })) });
const entries = [
  je("1", "2026-01-10", [["bank", 10_000_000, 0], ["rev", 0, 10_000_000]]),
  je("2", "2026-02-05", [["exp", 3_000_000, 0], ["bank", 0, 3_000_000]]),
  je("3", "2026-03-01", [["exp", 1_000_000, 0], ["bank", 0, 1_000_000]]),
];

test("generalLedgerAll: sorted by code, idle accounts hidden unless asked", () => {
  const all = generalLedgerAll(accounts, entries, { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(all.ledgers.map((g) => g.account.code), ["1-1100", "4-1000", "6-1000"]);
  assert.equal(all.accountsSkipped, 1);
  const withIdle = generalLedgerAll(accounts, entries, { from: "2026-02-01", to: "2026-02-28" }, { includeInactive: true });
  assert.deepEqual(withIdle.ledgers.map((g) => g.account.code), ["1-1100", "4-1000", "6-1000", "6-9000"]);
  assert.equal(withIdle.accountsSkipped, 0);
});

test("generalLedgerAll: every ledger equals generalLedger() for that account and totals add up", () => {
  const range = { from: "2026-02-01", to: "2026-03-31" };
  const all = generalLedgerAll(accounts, entries, range);
  for (const g of all.ledgers) assert.deepEqual(g, generalLedger(g.account, entries, range));
  const bank = all.ledgers.find((g) => g.account.code === "1-1100")!;
  assert.equal(bank.opening, 10_000_000);
  assert.equal(bank.closing, 6_000_000);
  assert.equal(all.totalDebit, all.ledgers.reduce((s, g) => s + g.totalDebit, 0));
  assert.equal(all.totalDebit, all.totalCredit); // every entry balances, so the whole ledger does
  assert.equal(all.totalDebit, 4_000_000);
});

test("generalLedgerAll: revenue account with only an opening balance is kept (closing carries it)", () => {
  const all = generalLedgerAll(accounts, entries, { from: "2026-03-01", to: "2026-03-31" });
  const rev = all.ledgers.find((g) => g.account.code === "4-1000")!;
  assert.equal(rev.rows.length, 0);
  assert.equal(rev.opening, 10_000_000);
  assert.equal(rev.closing, 10_000_000);
});
