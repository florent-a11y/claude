import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccounts } from "../lib/coa";
import { findByCode, findByTag, validateLines } from "../lib/balances";
import { buildRevaluation, existingRevaluation, revaluationJournalLines, revaluationSourceId } from "../lib/fx-revaluation";
import type { Account, BankAccount, JournalEntry, JournalLine } from "../lib/types";

let seq = 0;
const newId = () => `id-${++seq}`;
const ENTITY = "ent-1";
const accounts: Account[] = buildAccounts(ENTITY, newId);
const code = (c: string) => findByCode(accounts, c)!;
const usdGl = code("1-1110");
const usdBank: BankAccount = { id: "bank-usd", entityId: ENTITY, accountId: usdGl.id, name: "Aspire USD", currency: "USD", active: true };
const idrBank: BankAccount = { id: "bank-idr", entityId: ENTITY, accountId: code("1-1100").id, name: "OCBC IDR", currency: "IDR", active: true };

function entry(date: string, lines: JournalLine[], extra: Partial<JournalEntry> = {}): JournalEntry {
  return { id: newId(), entityId: ENTITY, number: `JE-${seq}`, date, period: date.slice(0, 7), memo: "test", source: "manual", lines, status: "posted", createdAt: date, ...extra };
}
const line = (a: Account, debit: number, credit: number, fx?: { currency: string; fxAmount: number; fxRate: number }): JournalLine => ({ accountId: a.id, accountCode: a.code, debit, credit, ...(fx ?? {}) });

// 1,000 USD in at 16,000 and 200 USD out at 16,500: 800 USD standing at IDR 12,700,000.
const entries: JournalEntry[] = [
  entry("2026-10-05", [line(usdGl, 16_000_000, 0, { currency: "USD", fxAmount: 1000, fxRate: 16_000 }), line(code("3-1000"), 0, 16_000_000)]),
  entry("2026-10-20", [line(code("6-2000"), 3_300_000, 0), line(usdGl, 0, 3_300_000, { currency: "USD", fxAmount: 200, fxRate: 16_500 })]),
  // November: must not count for October.
  entry("2026-11-02", [line(usdGl, 1_600_000, 0, { currency: "USD", fxAmount: 100, fxRate: 16_000 }), line(code("3-1000"), 0, 1_600_000)]),
];

test("revaluation: foreign balance and book value from the ledger, gain at a higher closing rate", () => {
  const rev = buildRevaluation({ period: "2026-10", banks: [usdBank, idrBank], accounts, entries, rates: { USD: 16_250 } });
  assert.equal(rev.endDate, "2026-10-31");
  assert.equal(rev.rows.length, 1, "IDR accounts are not revalued");
  const r = rev.rows[0];
  assert.equal(r.fcBalance, 800);
  assert.equal(r.fcApproximate, false);
  assert.equal(r.bookIDR, 12_700_000);
  assert.equal(r.bookRate, 15_875);
  assert.equal(r.revaluedIDR, 13_000_000);
  assert.equal(r.difference, 300_000);
  assert.equal(rev.unrealisedGain, 300_000);
  assert.equal(rev.unrealisedLoss, 0);
  assert.equal(rev.postable.length, 1);
  assert.deepEqual(rev.missingRates, []);
});

test("revaluation lines: Dr bank / Cr unrealised gain, the bank leg in USD with a zero foreign amount at the closing rate", () => {
  const rev = buildRevaluation({ period: "2026-10", banks: [usdBank], accounts, entries, rates: { USD: 16_250 } });
  const gain: Account = { ...code("7-1100"), id: "gain", code: "7-1110", name: "Unrealised foreign exchange gain", taxTag: "fx_unrealised_gain" };
  const loss: Account = { ...code("8-1100"), id: "loss", code: "8-1110", name: "Unrealised foreign exchange loss", taxTag: "fx_unrealised_loss" };
  const lines = revaluationJournalLines(rev, gain, loss);
  assert.equal(lines.length, 2);
  assert.equal(validateLines(lines), null);
  const bank = lines.find((l) => l.accountId === usdGl.id)!;
  assert.equal(bank.debit, 300_000);
  assert.equal(bank.currency, "USD");
  assert.equal(bank.fxAmount, 0, "no movement in USD: the reconciliation must not see one");
  assert.equal(bank.fxRate, 16_250);
  const g = lines.find((l) => l.accountId === "gain")!;
  assert.equal(g.credit, 300_000);
});

test("revaluation: loss at a lower closing rate posts Dr unrealised loss / Cr bank", () => {
  const rev = buildRevaluation({ period: "2026-10", banks: [usdBank], accounts, entries, rates: { USD: 15_000 } });
  assert.equal(rev.rows[0].difference, -700_000);
  assert.equal(rev.unrealisedLoss, 700_000);
  const gain = { ...code("7-1100"), id: "gain" }, loss = { ...code("8-1100"), id: "loss" };
  const lines = revaluationJournalLines(rev, gain, loss);
  assert.equal(validateLines(lines), null);
  assert.equal(lines.find((l) => l.accountId === "loss")!.debit, 700_000);
  assert.equal(lines.find((l) => l.accountId === usdGl.id)!.credit, 700_000);
});

test("revaluation: a typed statement balance replaces the ledger's foreign balance", () => {
  const rev = buildRevaluation({ period: "2026-10", banks: [usdBank], accounts, entries, rates: { USD: 16_000 }, overrides: { "bank-usd": 850 } });
  const r = rev.rows[0];
  assert.equal(r.fcOverridden, true);
  assert.equal(r.fcBalance, 850);
  assert.equal(r.revaluedIDR, 13_600_000);
  assert.equal(r.difference, 900_000);
});

test("revaluation: missing rate, nothing to post, approximate balances", () => {
  const none = buildRevaluation({ period: "2026-10", banks: [usdBank], accounts, entries, rates: {} });
  assert.deepEqual(none.missingRates, ["USD"]);
  assert.equal(none.rows[0].difference, null);
  assert.equal(none.postable.length, 0);
  // 800 USD at 15,875 is exactly the book value: no entry.
  const flat = buildRevaluation({ period: "2026-10", banks: [usdBank], accounts, entries, rates: { USD: 15_875 } });
  assert.equal(flat.rows[0].difference, 0);
  assert.equal(flat.postable.length, 0);
  // A line without a foreign amount is converted at its rate and flagged.
  const approx = [...entries, entry("2026-10-25", [line(usdGl, 1_650_000, 0, { currency: "USD", fxAmount: undefined as unknown as number, fxRate: 16_500 }), line(code("3-1000"), 0, 1_650_000)])];
  const rev = buildRevaluation({ period: "2026-10", banks: [usdBank], accounts, entries: approx, rates: { USD: 16_000 } });
  assert.equal(rev.rows[0].fcApproximate, true);
  assert.equal(rev.rows[0].fcBalance, 900);
});

test("existingRevaluation finds the month's posted entry by its source id", () => {
  const posted = entry("2026-10-31", [line(usdGl, 300_000, 0), line(code("7-1100"), 0, 300_000)], { source: "fx", sourceId: revaluationSourceId("2026-10") });
  const voided = { ...entry("2026-09-30", [line(usdGl, 1, 0), line(code("7-1100"), 0, 1)], { source: "fx", sourceId: revaluationSourceId("2026-09") }), status: "void" as const };
  assert.equal(existingRevaluation([...entries, posted, voided], "2026-10")?.id, posted.id);
  assert.equal(existingRevaluation([...entries, posted, voided], "2026-09"), undefined);
  assert.ok(findByTag(buildAccounts("e2", newId), "fx_unrealised_gain"), "new books get the unrealised accounts from the template");
});
