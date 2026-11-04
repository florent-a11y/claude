import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccounts } from "../lib/coa";
import { findByCode, findByTag } from "../lib/balances";
import { trialBalance, profitAndLoss, profitAndLossMonthly, balanceSheet, PL_SECTIONS } from "../lib/ledger";
import type { Account, JournalEntry, JournalLine } from "../lib/types";

// Zero-balance handling of the statements: by default zero rows and sections without balances are hidden; `zero: "show"` lists the whole chart.

let seq = 0;
const newId = () => `id-${++seq}`;
const ENTITY = "ent-zero";
const accounts: Account[] = buildAccounts(ENTITY, newId);
const code = (c: string) => findByCode(accounts, c)!;
const tag = (t: Account["taxTag"]) => findByTag(accounts, t)!;

function entry(date: string, lines: JournalLine[], status: JournalEntry["status"] = "posted"): JournalEntry {
  return { id: newId(), entityId: ENTITY, number: `JE-${seq}`, date, period: date.slice(0, 7), memo: "test", source: "manual", lines, status, createdAt: date };
}
const dr = (a: Account, amt: number): JournalLine => ({ accountId: a.id, accountCode: a.code, debit: amt, credit: 0 });
const cr = (a: Account, amt: number): JournalLine => ({ accountId: a.id, accountCode: a.code, debit: 0, credit: amt });

const bank = code("1-1100"), ar = tag("ar_trade"), sales = tag("sales_default"), rent = code("6-1100"), capital = code("3-1000");
// A young company: capital paid in, one invoice, one rent payment. Most of the chart has no balance.
const entries: JournalEntry[] = [
  entry("2026-01-05", [dr(bank, 100_000_000), cr(capital, 100_000_000)]),
  entry("2026-02-10", [dr(ar, 20_000_000), cr(sales, 20_000_000)]),
  entry("2026-03-01", [dr(rent, 5_000_000), cr(bank, 5_000_000)]),
];
const count = (type: Account["type"]) => accounts.filter((a) => a.type === type).length;
const rowCount = (sections: Array<{ rows: unknown[] }>) => sections.reduce((n, s) => n + s.rows.length, 0);
const byCode = (xs: Account[]) => [...xs].sort((x, y) => x.code.localeCompare(y.code)).map((a) => a.id);

test("balance sheet: zero rows and empty sections are hidden by default, equity always prints", () => {
  const bs = balanceSheet(accounts, entries, "2026-03-31", 1);
  assert.deepEqual(bs.assets.map((s) => s.key), ["current_assets"]);
  assert.deepEqual(bs.assets[0].rows.map((r) => r.account.code), ["1-1100", "1-1200"]);
  assert.deepEqual(bs.liabilities, []);
  assert.deepEqual(bs.emptySections, ["Fixed assets", "Other assets", "Current liabilities", "Loans"]);
  // Equity: paid-in capital, retained earnings (zero but always shown) and current-year earnings.
  assert.equal(bs.equity.length, 1);
  assert.deepEqual(bs.equity[0].rows.map((r) => r.account.id), byCode([capital, tag("retained_earnings"), tag("current_earnings")]));
  assert.equal(bs.totalAssets, 115_000_000);
  assert.equal(bs.totalLiabilities, 0);
  assert.equal(bs.totalEquity, 115_000_000);
  assert.ok(bs.balanced);
});

test("balance sheet: zero: \"show\" lists every account of the chart with the same totals", () => {
  const all = balanceSheet(accounts, entries, "2026-03-31", 1, { zero: "show" });
  assert.deepEqual(all.assets.map((s) => s.label), ["Current assets", "Fixed assets", "Other assets"]);
  assert.deepEqual(all.liabilities.map((s) => s.label), ["Current liabilities", "Loans"]);
  assert.equal(rowCount(all.assets), count("asset"));
  assert.equal(rowCount(all.liabilities), count("liability"));
  assert.equal(rowCount(all.equity), count("equity"));
  assert.deepEqual(all.emptySections, []);
  assert.ok(all.assets[1].rows.length > 0 && all.assets[1].rows.every((r) => r.amount === 0));
  const def = balanceSheet(accounts, entries, "2026-03-31", 1);
  for (const k of ["totalAssets", "totalLiabilities", "totalEquity", "retainedEarnings", "currentYearEarnings", "balanced"] as const) assert.equal(all[k], def[k], k);
});

test("P&L: empty sections are hidden by default; totals and summary lines do not depend on the mode", () => {
  const range = { from: "2026-01-01", to: "2026-12-31" };
  const pl = profitAndLoss(accounts, entries, range);
  assert.deepEqual(pl.sections.map((s) => s.key), ["revenue", "opex"]);
  assert.deepEqual(pl.emptySections, ["Cost of sales", "Other income", "Other expenses", "Income tax"]);
  assert.ok(pl.sections.every((s) => s.rows.length > 0 && s.rows.every((r) => r.amount !== 0)));
  const all = profitAndLoss(accounts, entries, range, { zero: "show" });
  assert.deepEqual(all.sections.map((s) => s.key), PL_SECTIONS.map((s) => s.key));
  assert.deepEqual(all.emptySections, []);
  assert.equal(rowCount(all.sections), count("revenue") + count("expense"));
  for (const k of ["revenue", "cogs", "grossProfit", "opex", "operatingProfit", "otherIncome", "otherExpense", "profitBeforeTax", "tax", "netProfit"] as const) assert.equal(all[k], pl[k], k);
  assert.equal(pl.grossProfit, 20_000_000);
  assert.equal(pl.netProfit, 15_000_000);
  // Movements that net to zero inside the period count as a zero balance: hidden by default, listed at 0 when shown.
  const interest = code("7-1000");
  const swing = [...entries, entry("2026-04-01", [dr(bank, 1_000_000), cr(interest, 1_000_000)]), entry("2026-04-15", [dr(interest, 1_000_000), cr(bank, 1_000_000)])];
  const net0 = profitAndLoss(accounts, swing, range);
  assert.ok(!net0.sections.some((s) => s.key === "other_income"));
  assert.ok(net0.emptySections.includes("Other income"));
  const shown = profitAndLoss(accounts, swing, range, { zero: "show" }).sections.find((s) => s.key === "other_income")!;
  assert.equal(shown.rows.find((r) => r.account.id === interest.id)!.amount, 0);
  assert.equal(net0.netProfit, pl.netProfit);
});

test("trial balance: zero-balance accounts are skipped by default and listed with zero: \"show\"", () => {
  const tb = trialBalance(accounts, entries, "2026-03-31");
  assert.deepEqual(tb.rows.map((r) => r.account.id), byCode([bank, ar, capital, sales, rent]));
  assert.equal(tb.accountsSkipped, accounts.length - 5);
  assert.ok(tb.balanced);
  const all = trialBalance(accounts, entries, "2026-03-31", { zero: "show" });
  assert.equal(all.rows.length, accounts.length);
  assert.equal(all.accountsSkipped, 0);
  assert.equal(all.totalDebit, tb.totalDebit);
  assert.equal(all.totalCredit, tb.totalCredit);
  assert.ok(all.balanced);
  const cash = all.rows.find((r) => r.account.id === code("1-1000").id)!;
  assert.deepEqual([cash.debit, cash.credit], [0, 0]);
  // Before any posting nothing shows by default, while "show" still lists the chart.
  assert.equal(trialBalance(accounts, entries, "2025-12-31").rows.length, 0);
  assert.equal(trialBalance(accounts, entries, "2025-12-31", { zero: "show" }).rows.length, accounts.length);
});

test("monthly P&L: empty sections are hidden by default and the four summary lines stay", () => {
  const range = { from: "2026-01-01", to: "2026-03-31" };
  const m = profitAndLossMonthly(accounts, entries, range);
  assert.deepEqual(m.sections.map((s) => s.key), ["revenue", "opex"]);
  assert.deepEqual(m.emptySections, ["Cost of sales", "Other income", "Other expenses", "Income tax"]);
  assert.deepEqual(m.summary.map((s) => s.key), ["grossProfit", "operatingProfit", "profitBeforeTax", "netProfit"]);
  assert.deepEqual(m.summary.find((s) => s.key === "netProfit")!.amounts, [0, 20_000_000, -5_000_000]);
  // A section with a movement in one month only still prints; its other columns read zero.
  assert.deepEqual(m.sections.find((s) => s.key === "opex")!.totals, [0, 0, 5_000_000]);
  const all = profitAndLossMonthly(accounts, entries, range, { zero: "show" });
  assert.deepEqual(all.sections.map((s) => s.key), PL_SECTIONS.map((s) => s.key));
  assert.deepEqual(all.emptySections, []);
  assert.equal(rowCount(all.sections), count("revenue") + count("expense"));
  assert.deepEqual(all.summary, m.summary);
  assert.deepEqual(all.total.netProfit, m.total.netProfit);
});
