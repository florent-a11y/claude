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
  assert.match(validateMoneyMove({ ...ok, lines: [{ accountId: code("6-2000").id, amount: 0 }] }, accounts, idrBank) ?? "", /must not be zero/i);
  assert.match(validateMoneyMove({ ...ok, lines: [{ accountId: code("6-2000").id, amount: -5 }] }, accounts, idrBank) ?? "", /at least one positive line/i);
  assert.match(validateMoneyMove({ ...ok, lines: [{ accountId: code("6-2000").id, amount: Number.NaN }] }, accounts, idrBank) ?? "", /must not be zero/i);
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

test("expense with a PPh 23 withholding line: Dr fee / Cr PPh 23 payable / Cr bank for the net", () => {
  const lines = moneyMoveJournalLines({
    kind: "expense", bankGl: code("1-1100"), currency: "IDR", fxRate: 1, payee: "Consultant", memo: "Advisory fee October",
    lines: [{ account: code("6-1300"), amount: 2_000_000 }, { account: code("2-1310"), description: "PPh 23 withheld", amount: -40_000 }],
  });
  assert.equal(lines.length, 3);
  assert.equal(validateLines(lines), null);
  assert.deepEqual(lines.map((l) => l.accountCode), ["6-1300", "2-1310", "1-1100"]);
  assert.deepEqual([lines[0].debit, lines[0].credit], [2_000_000, 0]);
  assert.deepEqual([lines[1].debit, lines[1].credit], [0, 40_000], "a negative expense line is a credit for its absolute value");
  assert.equal(lines[1].description, "PPh 23 withheld");
  assert.deepEqual([lines[2].debit, lines[2].credit], [0, 1_960_000], "the bank pays the net");
  for (const l of lines) assert.equal(l.counterpartyName, "Consultant");
  assert.equal(validateMoneyMove({ kind: "expense", lines: [{ accountId: code("6-1300").id, amount: 2_000_000 }, { accountId: code("2-1310").id, amount: -40_000 }] }, accounts, idrBank), null);
});

test("USD expense with a withholding line: fxAmount stays positive on the credit line, bank line is the sum of the rounded IDR lines", () => {
  const rate = 16_333.337;
  const lines = moneyMoveJournalLines({
    kind: "expense", bankGl: code("1-1110"), currency: "USD", fxRate: rate, memo: "Design fee",
    lines: [{ account: code("6-1300"), amount: 66.67 }, { account: code("6-1300"), amount: 33.33 }, { account: code("2-1310"), amount: -1.99 }],
  });
  assert.equal(lines.length, 4);
  assert.equal(validateLines(lines), null);
  assert.equal(sumD(lines), sumC(lines));
  // 66.67 × rate = 1,088,943.58 → 1,088,944; 33.33 × rate = 544,390.12 → 544,390; 1.99 × rate = 32,503.34 → 32,503.
  assert.deepEqual(on(lines, code("6-1300")).map((l) => l.debit), [1_088_944, 544_390]);
  const pph = on(lines, code("2-1310"))[0];
  assert.deepEqual([pph.debit, pph.credit], [0, 32_503]);
  assert.equal(pph.fxAmount, 1.99, "the original-currency amount is a magnitude; the side is given by the credit");
  assert.equal(pph.currency, "USD");
  assert.equal(pph.fxRate, rate);
  const bank = on(lines, code("1-1110"))[0];
  // 1,088,944 + 544,390 − 32,503 = 1,600,831, while converting the 98.01 net directly would give 1,600,830.
  assert.deepEqual([bank.debit, bank.credit], [0, 1_600_831]);
  assert.equal(bank.fxAmount, 98.01);
  for (const l of lines) assert.ok((l.fxAmount ?? 0) > 0, "no negative fxAmount anywhere");
});

test("validateMoneyMove with negative lines: no zero lines, at least one positive line, a positive total; the fee/PPh example passes", () => {
  const fee = { accountId: code("6-1300").id, amount: 2_000_000 };
  const pph = { accountId: code("2-1310").id, amount: -40_000 };
  const v = (lines: Array<{ accountId: string; amount: number }>) => validateMoneyMove({ kind: "expense", lines }, accounts, idrBank);
  assert.equal(v([fee, pph]), null);
  assert.equal(v([fee, { ...pph, amount: 0 }]), "Line 2: the amount must not be zero.");
  assert.match(v([fee, { ...pph, amount: 0.4 }]) ?? "", /must not be zero/, "an amount that rounds to zero rupiah counts as zero");
  assert.match(v([pph]) ?? "", /at least one positive line/i, "a withholding line on its own");
  assert.match(v([pph, { ...pph, accountId: code("2-1300").id }]) ?? "", /at least one positive line/i);
  assert.equal(v([fee, { ...pph, amount: -2_000_000 }]), "The total must be greater than zero (withholding lines cannot exceed the amount paid).");
  assert.match(v([fee, { ...pph, amount: -2_500_000 }]) ?? "", /total must be greater than zero/i);
  // The USD check still applies after the sign rules, and a deposit's deductions get the mirrored wording.
  assert.match(validateMoneyMove({ kind: "expense", lines: [{ accountId: code("6-1300").id, amount: 100 }, { accountId: code("2-1310").id, amount: -2 }] }, accounts, usdBank) ?? "", /FX rate/);
  assert.match(validateMoneyMove({ kind: "deposit", lines: [{ accountId: code("7-1200").id, amount: 100 }, { accountId: code("6-2000").id, amount: -100 }] }, accounts, idrBank) ?? "", /deductions cannot exceed the amount received/);
});

test("deposit with a charge taken from the money received: Dr bank net / Dr charge / Cr income gross", () => {
  const lines = moneyMoveJournalLines({
    kind: "deposit", bankGl: code("1-1100"), currency: "IDR", fxRate: 1, payee: "Marketplace", memo: "Payout October",
    lines: [{ account: code("7-1200"), amount: 1_000_000 }, { account: code("6-2000"), description: "Payout fee", amount: -5_000 }],
  });
  assert.equal(lines.length, 3);
  assert.equal(validateLines(lines), null);
  assert.deepEqual(lines.map((l) => l.accountCode), ["1-1100", "7-1200", "6-2000"]);
  assert.deepEqual([lines[0].debit, lines[0].credit], [995_000, 0], "the bank receives the net");
  assert.deepEqual([lines[1].debit, lines[1].credit], [0, 1_000_000]);
  assert.deepEqual([lines[2].debit, lines[2].credit], [5_000, 0], "a negative deposit line is a debit for its absolute value");
  assert.equal(lines[2].description, "Payout fee");
  assert.equal(validateMoneyMove({ kind: "deposit", lines: [{ accountId: code("7-1200").id, amount: 1_000_000 }, { accountId: code("6-2000").id, amount: -5_000 }] }, accounts, idrBank), null);
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
