import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccounts } from "../lib/coa";
import { findByCode, validateLines } from "../lib/balances";
import { isMoneyMove, moneyMoveJournalLines, moneyMoveKindOf, validateMoneyMove } from "../lib/money-moves";
import type { Account, JournalLine } from "../lib/types";

let seq = 0;
const newId = () => `id-${++seq}`;
const ENTITY = "ent-1";
const accounts: Account[] = buildAccounts(ENTITY, newId);
const code = (c: string) => findByCode(accounts, c)!;
const on = (ls: JournalLine[], a: Account) => ls.filter((l) => l.accountId === a.id);
const sumD = (ls: JournalLine[]) => ls.reduce((s, l) => s + l.debit, 0);
const sumC = (ls: JournalLine[]) => ls.reduce((s, l) => s + l.credit, 0);

const idrBank = { id: "bank-idr", entityId: ENTITY, accountId: code("1-1100").id, name: "OCBC IDR", currency: "IDR", active: true };
const usdBank = { id: "bank-usd", entityId: ENTITY, accountId: code("1-1110").id, name: "Aspire USD", currency: "USD", active: true };

test("IDR expense with two lines: Dr each line / Cr bank for the total, payee on every line", () => {
  const lines = moneyMoveJournalLines({
    kind: "expense", bankGl: code("1-1100"), currency: "IDR", fxRate: 1, payee: "OCBC", memo: "Bank charges September",
    lines: [{ account: code("6-2000"), description: "Monthly admin fee", amount: 15_000 }, { account: code("6-9000"), amount: 5_000 }],
  });
  assert.equal(lines.length, 3);
  assert.equal(validateLines(lines), null);
  assert.deepEqual(lines.map((l) => l.accountCode), ["6-2000", "6-9000", "1-1100"]);
  assert.equal(on(lines, code("6-2000"))[0].debit, 15_000);
  assert.equal(on(lines, code("6-9000"))[0].debit, 5_000);
  const bank = on(lines, code("1-1100"))[0];
  assert.equal(bank.credit, 20_000);
  assert.equal(bank.debit, 0);
  assert.equal(bank.description, "Bank charges September");
  assert.equal(on(lines, code("6-2000"))[0].description, "Monthly admin fee");
  assert.equal(on(lines, code("6-9000"))[0].description, "Bank charges September", "a line without its own description falls back to the memo");
  for (const l of lines) {
    assert.equal(l.counterpartyName, "OCBC");
    assert.equal(l.currency, undefined, "IDR entries carry no FX information");
    assert.equal(l.fxAmount, undefined);
  }
});

test("USD deposit: each line converted on its own, bank line is the sum of the rounded lines so the entry balances", () => {
  const rate = 16_333.337;
  const lines = moneyMoveJournalLines({
    kind: "deposit", bankGl: code("1-1110"), currency: "USD", fxRate: rate, payee: "Aspire", memo: "Interest Q3",
    lines: [{ account: code("7-1000"), amount: 33.33 }, { account: code("7-1000"), amount: 33.33 }, { account: code("7-1200"), amount: 33.34 }],
  });
  assert.equal(lines.length, 4);
  assert.equal(validateLines(lines), null);
  assert.equal(sumD(lines), sumC(lines));
  const bank = lines[0];
  assert.equal(bank.accountCode, "1-1110", "a deposit debits the bank first");
  // 33.33 × rate = 544,390.12 → 544,390 (twice); 33.34 × rate = 544,553.46 → 544,553; the sum is 1,633,333 while
  // converting the 100.00 total directly would give 1,633,334.
  assert.deepEqual(on(lines, code("7-1000")).map((l) => l.credit), [544_390, 544_390]);
  assert.equal(on(lines, code("7-1200"))[0].credit, 544_553);
  assert.equal(bank.debit, 1_633_333);
  assert.equal(bank.credit, 0);
  assert.equal(bank.currency, "USD");
  assert.equal(bank.fxAmount, 100);
  assert.equal(bank.fxRate, rate);
  for (const l of lines.slice(1)) {
    assert.equal(l.debit, 0);
    assert.equal(l.currency, "USD");
    assert.equal(l.fxRate, rate);
    assert.equal(l.counterpartyName, "Aspire");
  }
  assert.deepEqual(lines.slice(1).map((l) => l.fxAmount), [33.33, 33.33, 33.34]);
});

test("expense without a payee carries no counterparty; amounts are rounded to the currency", () => {
  const lines = moneyMoveJournalLines({ kind: "expense", bankGl: code("1-1100"), currency: "IDR", fxRate: 1, memo: "Rounding", lines: [{ account: code("6-2000"), amount: 1000.4 }, { account: code("6-2000"), amount: 2000.6 }] });
  assert.equal(on(lines, code("1-1100"))[0].credit, 3001);
  assert.equal(lines[0].debit, 1000);
  assert.equal(lines[1].debit, 2001);
  for (const l of lines) assert.equal("counterpartyName" in l && l.counterpartyName !== undefined, false);
});

test("validateMoneyMove: lines, amounts, inactive accounts, the bank's own GL account and the FX rate", () => {
  const ok = { kind: "expense" as const, lines: [{ accountId: code("6-2000").id, amount: 15_000 }] };
  assert.equal(validateMoneyMove(ok, accounts, idrBank), null);
  assert.match(validateMoneyMove({ ...ok, lines: [] }, accounts, idrBank) ?? "", /at least one line/i);
  assert.match(validateMoneyMove({ ...ok, lines: [{ accountId: code("6-2000").id, amount: 0 }] }, accounts, idrBank) ?? "", /greater than zero/i);
  assert.match(validateMoneyMove({ ...ok, lines: [{ accountId: code("6-2000").id, amount: -5 }] }, accounts, idrBank) ?? "", /greater than zero/i);
  assert.match(validateMoneyMove({ ...ok, lines: [{ accountId: code("6-2000").id, amount: Number.NaN }] }, accounts, idrBank) ?? "", /greater than zero/i);
  assert.match(validateMoneyMove({ ...ok, lines: [{ accountId: "", amount: 10 }] }, accounts, idrBank) ?? "", /pick an account/i);
  assert.match(validateMoneyMove({ ...ok, lines: [{ accountId: "nope", amount: 10 }] }, accounts, idrBank) ?? "", /not found/i);
  const inactive = accounts.map((a) => (a.code === "6-2000" ? { ...a, active: false } : a));
  assert.match(validateMoneyMove(ok, inactive, idrBank) ?? "", /inactive/i);
  assert.match(validateMoneyMove({ ...ok, lines: [{ accountId: code("1-1100").id, amount: 10 }] }, accounts, idrBank) ?? "", /own GL account/i);
  // The second line is the problem: the message names it.
  assert.match(validateMoneyMove({ ...ok, lines: [{ accountId: code("6-2000").id, amount: 10 }, { accountId: code("6-2000").id, amount: 0 }] }, accounts, idrBank) ?? "", /^Line 2/);
  // Foreign-currency bank accounts need a positive rate; IDR accounts ignore it.
  const usd = { kind: "deposit" as const, lines: [{ accountId: code("7-1000").id, amount: 12.5 }] };
  assert.match(validateMoneyMove(usd, accounts, usdBank) ?? "", /FX rate \(IDR per 1 USD\)/);
  assert.match(validateMoneyMove({ ...usd, fxRate: 0 }, accounts, usdBank) ?? "", /FX rate/);
  assert.equal(validateMoneyMove({ ...usd, fxRate: 16_500 }, accounts, usdBank), null);
  assert.equal(validateMoneyMove({ ...ok, fxRate: 0 }, accounts, idrBank), null);
});

test("isMoneyMove tells expenses/deposits apart from bill payments, invoice receipts and transfers", () => {
  assert.equal(isMoneyMove({ kind: "disbursement" }), true);
  assert.equal(isMoneyMove({ kind: "receipt" }), true);
  assert.equal(isMoneyMove({ kind: "disbursement", billId: "b1" }), false);
  assert.equal(isMoneyMove({ kind: "receipt", invoiceId: "i1" }), false);
  assert.equal(isMoneyMove({ kind: "transfer" }), false);
  assert.equal(moneyMoveKindOf({ kind: "disbursement" }), "expense");
  assert.equal(moneyMoveKindOf({ kind: "receipt" }), "deposit");
});
