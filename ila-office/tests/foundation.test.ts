import { test } from "node:test";
import assert from "node:assert/strict";
import { addWorkingDays, addMonths, quarterOf, nextPeriod } from "../lib/dates";
import { parseMoney, roundMoney, fmtIDR } from "../lib/money";
import { parseCSV } from "../lib/csv";
import { hashPassword, verifyPassword } from "../lib/password";
import { buildAccounts } from "../lib/coa";

test("invoices due 3 working days after a Thursday fall on Tuesday", () => {
  assert.equal(addWorkingDays("2026-10-01", 3), "2026-10-06"); // Thu → Tue
  assert.equal(addWorkingDays("2026-09-29", 3), "2026-10-02"); // Tue → Fri
});

test("month arithmetic clamps to month end and quarters are derived", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-10-01", 24), "2028-10-01");
  assert.equal(quarterOf("2026-11"), "2026-Q4");
  assert.equal(nextPeriod("2026-12"), "2027-01");
});

test("money parsing handles Indonesian and English separators", () => {
  assert.equal(parseMoney("2.500.000"), 2_500_000);
  assert.equal(parseMoney("2,500,000.50"), 2_500_000.5);
  assert.equal(parseMoney("2.500.000,50"), 2_500_000.5);
  assert.equal(parseMoney("Rp 1.000"), 1000);
  assert.equal(roundMoney(1234.5, "IDR"), 1235);
  assert.equal(roundMoney(12.345, "USD"), 12.35);
  assert.equal(fmtIDR(2_500_000), "Rp 2.500.000");
});

test("csv parser handles quotes, embedded newlines and semicolons", () => {
  const rows = parseCSV('a;b\n"x;1";"line1\nline2"\n');
  assert.deepEqual(rows, [["a", "b"], ["x;1", "line1\nline2"]]);
});

test("passwords verify and reject", () => {
  const h = hashPassword("correct horse battery");
  assert.ok(verifyPassword("correct horse battery", h));
  assert.ok(!verifyPassword("wrong", h));
});

test("chart of accounts template has unique codes and the tax tags the tax module needs", () => {
  const accounts = buildAccounts("e1", () => Math.random().toString(36).slice(2));
  const codes = new Set(accounts.map((a) => a.code));
  assert.equal(codes.size, accounts.length);
  for (const tag of ["ppn_output", "ppn_input", "pph21_payable", "pph23_payable", "ar_trade", "ap_trade", "sales_default", "bank_default", "retained_earnings", "current_earnings"]) {
    assert.ok(accounts.some((a) => a.taxTag === tag), `missing tag ${tag}`);
  }
});

test("money parsing: comma thousands without decimals, negatives and parentheses", () => {
  assert.equal(parseMoney("1,000,000"), 1_000_000);
  assert.equal(parseMoney("1,500"), 1500);
  assert.equal(parseMoney("1.500"), 1500);
  assert.equal(parseMoney("12,5"), 12.5);
  assert.equal(parseMoney("-2,500,000"), -2_500_000);
  assert.equal(parseMoney("(1.000.000)"), -1_000_000);
  assert.equal(parseMoney("USD 1,234.56"), 1234.56);
});
