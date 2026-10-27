import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccounts } from "../lib/coa";
import { findByCode, findByTag } from "../lib/balances";
import { profitAndLoss, profitAndLossMonthly, monthColumnLabel, MONTHLY_PL_MAX_COLUMNS } from "../lib/ledger";
import type { Account, JournalEntry, JournalLine } from "../lib/types";

let seq = 0;
const newId = () => `id-${++seq}`;
const ENTITY = "ent-monthly";
const accounts: Account[] = buildAccounts(ENTITY, newId);
const code = (c: string) => findByCode(accounts, c)!;
const tag = (t: Account["taxTag"]) => findByTag(accounts, t)!;

function entry(date: string, lines: JournalLine[], status: JournalEntry["status"] = "posted"): JournalEntry {
  return { id: newId(), entityId: ENTITY, number: `JE-${seq}`, date, period: date.slice(0, 7), memo: "test", source: "manual", lines, status, createdAt: date };
}
const dr = (a: Account, amt: number): JournalLine => ({ accountId: a.id, accountCode: a.code, debit: amt, credit: 0 });
const cr = (a: Account, amt: number): JournalLine => ({ accountId: a.id, accountCode: a.code, debit: 0, credit: amt });

const bank = tag("bank_default");
const sales = tag("sales_default");
const opex = accounts.find((a) => a.subtype === "opex")!;
const sale = (date: string, amt: number) => entry(date, [dr(bank, amt), cr(sales, amt)]);
const spend = (date: string, amt: number) => entry(date, [dr(opex, amt), cr(bank, amt)]);

const entries: JournalEntry[] = [
  sale("2026-01-05", 7_000_000), // before the range starts on the 10th: clipped out
  sale("2026-01-15", 1_000_000),
  sale("2026-02-10", 2_000_000),
  spend("2026-02-20", 500_000),
  sale("2026-03-30", 3_000_000),
  sale("2026-03-31", 9_000_000), // after the range ends on the 30th: clipped out
  entry("2026-02-25", [dr(bank, 4_000_000), cr(sales, 4_000_000)], "draft"), // drafts never count
];

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

test("monthly P&L: one column per month, short labels, month columns add up to the Total column", () => {
  const m = profitAndLossMonthly(accounts, entries, { from: "2026-01-10", to: "2026-03-30" });
  assert.deepEqual(m.columns.map((c) => c.label), ["Jan 26", "Feb 26", "Mar 26"]);
  assert.deepEqual(m.columns.map((c) => c.period), ["2026-01", "2026-02", "2026-03"]);
  assert.equal(m.note, undefined);
  assert.equal(m.months.length, 3);
  const whole = profitAndLoss(accounts, entries, { from: "2026-01-10", to: "2026-03-30" });
  assert.deepEqual(m.total, whole);
  for (const s of m.sections) {
    assert.equal(s.totals.length, 3);
    assert.equal(sum(s.totals), s.total, `section ${s.key} totals`);
    for (const r of s.rows) {
      assert.equal(r.amounts.length, 3);
      assert.equal(sum(r.amounts), r.total, `row ${r.account.code}`);
    }
  }
  assert.deepEqual(m.summary.map((s) => s.key), ["grossProfit", "operatingProfit", "profitBeforeTax", "netProfit"]);
  for (const line of m.summary) assert.equal(sum(line.amounts), line.total, line.key);
  const net = m.summary.find((s) => s.key === "netProfit")!;
  assert.equal(net.total, whole.netProfit);
  assert.equal(net.total, 1_000_000 + 2_000_000 - 500_000 + 3_000_000);
});

test("monthly P&L: months are clipped to the range edges", () => {
  const m = profitAndLossMonthly(accounts, entries, { from: "2026-01-10", to: "2026-03-30" });
  assert.equal(m.from, "2026-01-10");
  assert.equal(m.to, "2026-03-30");
  assert.deepEqual(m.columns.map((c) => [c.from, c.to]), [["2026-01-10", "2026-01-31"], ["2026-02-01", "2026-02-28"], ["2026-03-01", "2026-03-30"]]);
  const revenue = m.sections.find((s) => s.key === "revenue")!;
  // The 7m sale on 5 Jan and the 9m sale on 31 Mar fall outside the range.
  assert.deepEqual(revenue.totals, [1_000_000, 2_000_000, 3_000_000]);
  const row = revenue.rows.find((r) => r.account.id === sales.id)!;
  assert.deepEqual(row.amounts, [1_000_000, 2_000_000, 3_000_000]);
  assert.equal(row.total, 6_000_000);
  const opexSection = m.sections.find((s) => s.key === "opex")!;
  assert.deepEqual(opexSection.totals, [0, 500_000, 0]);
  const gross = m.summary.find((s) => s.key === "grossProfit")!;
  assert.deepEqual(gross.amounts, [1_000_000, 2_000_000, 3_000_000]);
  const net = m.summary.find((s) => s.key === "netProfit")!;
  assert.deepEqual(net.amounts, [1_000_000, 1_500_000, 3_000_000]);
  // A range inside one month gives a single, fully clipped column.
  const one = profitAndLossMonthly(accounts, entries, { from: "2026-02-12", to: "2026-02-22" });
  assert.deepEqual(one.columns.map((c) => [c.label, c.from, c.to]), [["Feb 26", "2026-02-12", "2026-02-22"]]);
  assert.deepEqual(one.summary.find((s) => s.key === "netProfit")!.amounts, [-500_000]);
});

test("monthly P&L: an account that nets to zero over the range still shows its monthly movements", () => {
  const swing = [sale("2026-04-10", 1_000_000), entry("2026-05-10", [dr(sales, 1_000_000), cr(bank, 1_000_000)])];
  const m = profitAndLossMonthly(accounts, swing, { from: "2026-04-01", to: "2026-05-31" });
  const row = m.sections.find((s) => s.key === "revenue")!.rows.find((r) => r.account.id === sales.id)!;
  assert.deepEqual(row.amounts, [1_000_000, -1_000_000]);
  assert.equal(row.total, 0);
  assert.equal(m.total.sections.find((s) => s.key === "revenue")!.rows.length, 0);
});

test("monthly P&L: ranges longer than 13 months keep the last 13 months and say so", () => {
  const long = [sale("2025-01-15", 1_000_000), sale("2025-09-15", 2_000_000), sale("2025-10-01", 3_000_000), sale("2026-10-20", 4_000_000)];
  const m = profitAndLossMonthly(accounts, long, { from: "2025-01-01", to: "2026-10-31" });
  assert.equal(m.columns.length, MONTHLY_PL_MAX_COLUMNS);
  assert.equal(MONTHLY_PL_MAX_COLUMNS, 13);
  assert.equal(m.columns[0].period, "2025-10");
  assert.equal(m.columns[0].label, "Oct 25");
  assert.equal(m.columns[12].label, "Oct 26");
  assert.equal(m.from, "2025-10-01");
  assert.equal(m.to, "2026-10-31");
  assert.ok(m.note && m.note.includes("22 months") && m.note.includes("last 13"), m.note);
  const revenue = m.sections.find((s) => s.key === "revenue")!;
  // Only the sales inside the 13 shown months count, in both the columns and the Total.
  assert.equal(revenue.totals[0], 3_000_000);
  assert.equal(revenue.totals[12], 4_000_000);
  assert.equal(sum(revenue.totals), revenue.total);
  assert.equal(revenue.total, 7_000_000);
  // Exactly 13 months is not trimmed.
  const exact = profitAndLossMonthly(accounts, long, { from: "2025-10-01", to: "2026-10-31" });
  assert.equal(exact.columns.length, 13);
  assert.equal(exact.note, undefined);
});

test("monthly P&L: swapped bounds and label helper", () => {
  const m = profitAndLossMonthly(accounts, entries, { from: "2026-03-30", to: "2026-01-10" });
  assert.deepEqual(m.columns.map((c) => c.label), ["Jan 26", "Feb 26", "Mar 26"]);
  assert.equal(monthColumnLabel("2027-12"), "Dec 27");
  assert.equal(monthColumnLabel("2026-01"), "Jan 26");
});
