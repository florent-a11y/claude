import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccounts } from "../lib/coa";
import { accountBalances, findByCode, findByTag, validateLines } from "../lib/balances";
import { applyJournalEdit } from "../lib/posting";
import { trialBalance, generalLedger, profitAndLoss, profitAndLossInRupiah, profitAndLossMonthly, profitAndLossMonthlyInRupiah, balanceSheet, balanceSheetInRupiah, invoiceTotals, billTotals, depreciationSchedule } from "../lib/ledger";
import { buildReconciliation } from "../lib/reconciliation";
import { fmtMoney, fmtMoneyAt, reportDecimals } from "../lib/money";
import { buildWorkbook } from "../lib/report-xlsx";
import { csvCell, toCSV } from "../lib/csv";
import * as XLSX from "xlsx";
import type { Account, BankAccount, BankTransaction, FixedAsset, JournalEntry, JournalLine } from "../lib/types";

// Rupiah cents: the ledger keeps the exact amount (bank statements carry cents in IDR too), the trial balance, the
// general ledger and the reconciliation show it, and only the financial statements are rounded to whole rupiah.

let seq = 0;
const newId = () => `id-${++seq}`;
const ENTITY = "ent-cents";
const accounts: Account[] = buildAccounts(ENTITY, newId);
const code = (c: string) => findByCode(accounts, c)!;
const tag = (t: Account["taxTag"]) => findByTag(accounts, t)!;
const bank = code("1-1100"), sales = tag("sales_default"), rent = code("6-1100"), capital = code("3-1000"), fees = code("6-2000");

function entry(date: string, lines: JournalLine[]): JournalEntry {
  return { id: newId(), entityId: ENTITY, number: `JE-${String(++seq).padStart(4, "0")}`, date, period: date.slice(0, 7), memo: "test", source: "manual", lines, status: "posted", createdAt: date };
}
const dr = (a: Account, amt: number): JournalLine => ({ accountId: a.id, accountCode: a.code, debit: amt, credit: 0 });
const cr = (a: Account, amt: number): JournalLine => ({ accountId: a.id, accountCode: a.code, debit: 0, credit: amt });

// Bank interest of 1,234.56 and 0.10 + 0.20 (the classic binary-noise pair), a fee of 6,500.45, rent of 5,000,000.50.
const entries: JournalEntry[] = [
  entry("2026-01-05", [dr(bank, 100_000_000), cr(capital, 100_000_000)]),
  entry("2026-01-31", [dr(bank, 1_234.56), cr(sales, 1_234.56)]),
  entry("2026-02-10", [dr(bank, 0.1), cr(sales, 0.1)]),
  entry("2026-02-11", [dr(bank, 0.2), cr(sales, 0.2)]),
  entry("2026-02-28", [dr(fees, 6_500.45), cr(bank, 6_500.45)]),
  entry("2026-03-01", [dr(rent, 5_000_000.5), cr(bank, 5_000_000.5)]),
];

test("balances keep the cents and never carry binary noise", () => {
  const bal = accountBalances(entries);
  assert.equal(bal.get(sales.id)!.net, -1_234.86, "0.1 + 0.2 + 1,234.56 is exactly 1,234.86");
  assert.equal(bal.get(bank.id)!.net, 94_994_733.91);
  const tb = trialBalance(accounts, entries, "2026-03-31");
  assert.equal(tb.totalDebit, tb.totalCredit);
  assert.ok(tb.balanced);
  assert.equal(tb.rows.find((r) => r.account.id === bank.id)!.debit, 94_994_733.91, "the trial balance is exact");
  const gl = generalLedger(bank, entries, { from: "2026-02-01", to: "2026-03-31" });
  assert.equal(gl.opening, 100_001_234.56);
  assert.deepEqual(gl.rows.map((r) => r.balance), [100_001_234.66, 100_001_234.86, 99_994_734.41, 94_994_733.91]);
  assert.equal(gl.closing, 94_994_733.91);
});

test("validateLines compares debits and credits to the cent", () => {
  assert.equal(validateLines([dr(bank, 0.1), dr(bank, 0.2), cr(sales, 0.3)]), null, "0.1 + 0.2 balances 0.3");
  assert.match(validateLines([dr(bank, 1000.5), cr(sales, 1000)]) ?? "", /do not balance/, "fifty cents out is out of balance");
  assert.match(validateLines([dr(bank, 1000.01), cr(sales, 1000)]) ?? "", /do not balance/, "one cent out is out of balance");
});

test("an edited journal entry keeps the cents typed", () => {
  const edited = applyJournalEdit(entries[1], { date: "2026-01-31", memo: "Interest", source: "manual", lines: [dr(bank, 1_234.567), cr(sales, 1_234.567)] }, { at: "2026-04-01T00:00:00.000Z" });
  assert.deepEqual(edited.lines.map((l) => [l.debit, l.credit]), [[1_234.57, 0], [0, 1_234.57]]);
});

test("statements are rounded to whole rupiah at presentation; the exact statement is untouched", () => {
  const exact = profitAndLoss(accounts, entries, { from: "2026-01-01", to: "2026-03-31" });
  assert.equal(exact.revenue, 1_234.86);
  assert.equal(exact.opex, 5_006_500.95);
  assert.equal(exact.netProfit, -5_005_266.09);
  const pl = profitAndLossInRupiah(exact);
  assert.equal(pl.revenue, 1_235);
  assert.equal(pl.opex, 5_006_501);
  assert.equal(pl.netProfit, -5_005_266, "rounded from the exact net profit, not from the rounded lines");
  const opex = pl.sections.find((s) => s.key === "opex")!;
  assert.deepEqual(opex.rows.map((r) => r.amount), [5_000_001, 6_500], "5,000,000.50 rounds half away from zero; 6,500.45 down");
  assert.equal(opex.total, 5_006_501);
  assert.equal(exact.sections.find((s) => s.key === "opex")!.rows[0].amount, 5_000_000.5, "the exact statement is not modified");

  const bsExact = balanceSheet(accounts, entries, "2026-03-31", 1);
  assert.ok(bsExact.balanced);
  assert.equal(bsExact.totalAssets, 94_994_733.91);
  assert.equal(bsExact.totalLiabilitiesAndEquity, 94_994_733.91);
  const bs = balanceSheetInRupiah(bsExact);
  assert.equal(bs.totalAssets, 94_994_734);
  assert.equal(bs.totalLiabilitiesAndEquity, 94_994_734, "assets = liabilities + equity after rounding too");
  assert.equal(bs.currentYearEarnings, -5_005_266);
  assert.ok(bs.balanced);
  for (const s of [...bs.assets, ...bs.liabilities, ...bs.equity]) for (const r of s.rows) assert.ok(Number.isInteger(r.amount), `${r.account.code} is whole rupiah`);

  const mExact = profitAndLossMonthly(accounts, entries, { from: "2026-01-01", to: "2026-03-31" });
  const m = profitAndLossMonthlyInRupiah(mExact);
  const net = m.summary.find((s) => s.key === "netProfit")!;
  assert.deepEqual(net.amounts, [1_235, -6_500, -5_000_001]);
  assert.equal(net.total, -5_005_266);
  assert.deepEqual(mExact.summary.find((s) => s.key === "netProfit")!.amounts, [1_234.56, -6_500.15, -5_000_000.5]);
});

test("document totals: amounts keep cents, PPN and withholding stay whole rupiah in IDR", () => {
  const inv = invoiceTotals([{ qty: 1, unitPrice: 1_000_000.5, taxCode: "ppn" }], { pkp: true, ppnRate: 0.11, currency: "IDR" });
  assert.equal(inv.subtotal, 1_000_000.5);
  assert.equal(inv.ppnAmount, 110_000, "110,000.055 → whole rupiah");
  assert.equal(inv.total, 1_110_000.5);
  const usd = invoiceTotals([{ qty: 1, unitPrice: 100.5, taxCode: "ppn" }], { pkp: true, ppnRate: 0.11, currency: "USD" });
  assert.equal(usd.ppnAmount, 11.06, "other currencies keep two decimals on tax");
  const bill = billTotals([{ amount: 2_500_000.75, taxCode: "ppn", withholding: "pph23" }], { ppnRate: 0.11, currency: "IDR" });
  assert.equal(bill.subtotal, 2_500_000.75);
  assert.equal(bill.ppnInput, 275_000);
  assert.equal(bill.withholdingTotal, 50_000);
  assert.equal(bill.amountPayable, 2_725_000.75);
});

test("depreciation: whole rupiah each month, the last month absorbs the cents of the cost", () => {
  const asset = { id: "a1", entityId: ENTITY, name: "Laptop", acquisitionDate: "2026-01-15", cost: 10_000_000.5, salvageValue: 0, usefulLifeMonths: 3, method: "straight_line", accumulatedDepreciation: 0, status: "active" } as unknown as FixedAsset;
  const schedule = depreciationSchedule(asset);
  assert.equal(schedule.length, 3);
  assert.ok(schedule.slice(0, -1).every((r) => Number.isInteger(r.amount)));
  assert.equal(Math.round(schedule.reduce((s, r) => s + r.amount, 0) * 100) / 100, 10_000_000.5, "the schedule depreciates the exact cost");
});

test("reconciliation matches a statement with rupiah cents exactly, and one cent off is a difference", () => {
  const acct: BankAccount = { id: "b1", entityId: ENTITY, accountId: bank.id, name: "OCBC IDR", currency: "IDR", active: true };
  const tx = (id: string, date: string, amount: number, balance: number, matchedJournalId?: string): BankTransaction => ({ id, entityId: ENTITY, bankAccountId: "b1", date, description: id, amount, balance, hash: id, status: matchedJournalId ? "matched" : "unmatched", matchedJournalId, createdAt: date });
  const transactions = [
    tx("T-1", "2026-01-05", 100_000_000, 100_000_000, entries[0].id),
    tx("T-2", "2026-01-31", 1_234.56, 100_001_234.56, entries[1].id),
    tx("T-3", "2026-02-10", 0.1, 100_001_234.66, entries[2].id),
    tx("T-4", "2026-02-11", 0.2, 100_001_234.86, entries[3].id),
    tx("T-5", "2026-02-28", -6_500.45, 99_994_734.41, entries[4].id),
    tx("T-6", "2026-03-01", -5_000_000.5, 94_994_733.91, entries[5].id),
  ];
  const r = buildReconciliation({ bank: acct, transactions, entries, period: "2026-03" });
  assert.equal(r.statementBalance, 94_994_733.91);
  assert.equal(r.ledgerBalance, 94_994_733.91);
  assert.equal(r.difference, 0);
  assert.ok(r.balanced);
  const off = buildReconciliation({ bank: acct, transactions: [...transactions.slice(0, 5), tx("T-6", "2026-03-01", -5_000_000.51, 94_994_733.9, entries[5].id)], entries, period: "2026-03" });
  assert.equal(off.difference !== null && Math.abs(off.difference), 0.01);
  assert.ok(!off.balanced, "a one-cent difference is reported, not rounded away");
});

test("Show cents: every figure prints two decimals, whole amounts included", () => {
  // The default prints rupiah cents only when an amount has some; a report with the switch ticked prints them always.
  assert.equal(fmtMoney(2_500_000), "Rp 2.500.000");
  assert.equal(fmtMoneyAt(2_500_000, 2), "Rp 2.500.000,00");
  assert.equal(fmtMoneyAt(2_500_000.5, 2), "Rp 2.500.000,50");
  assert.equal(fmtMoneyAt(-1_000, 2), "−Rp 1.000,00");
  assert.equal(fmtMoneyAt(0, 2), "Rp 0,00");
  assert.equal(fmtMoneyAt(2_500_000.4, 0), "Rp 2.500.000", "a statement in whole rupiah");
  assert.equal(fmtMoneyAt(1_315, 0, "USD"), "$1,315.00", "other currencies always keep their two decimals");
  // Decimals of a report: two with the switch; without it, two only when one figure has cents.
  assert.equal(reportDecimals(true, [1_000, 2_000]), 2);
  assert.equal(reportDecimals(false, [1_000, 2_000]), 0);
  assert.equal(reportDecimals(false, [1_000, 2_000.5]), 2);
  assert.equal(reportDecimals(true, []), 2);
});

test("Show cents in the Excel export: whole amounts get the 0.00 format too", () => {
  const read = (decimals?: number) => {
    const wb = XLSX.read(buildWorkbook([{ name: "Balance sheet", headers: ["Account", "Amount"], rows: [["Bank", 1_232_067], ["Cash", 500.5]], decimals }]), { type: "buffer", cellNF: true });
    const ws = wb.Sheets["Balance sheet"];
    return [ws.B2.z, ws.B3.z, ws.B2.v, ws.B3.v];
  };
  assert.deepEqual(read(), ["#,##0", "#,##0.00", 1_232_067, 500.5], "by default only an amount with cents shows decimals");
  assert.deepEqual(read(2), ["#,##0.00", "#,##0.00", 1_232_067, 500.5], "with the switch every amount does, and the values stay numbers");
});

test("CSV export: a negative number keeps its minus sign, text that looks like a formula is still neutralised", () => {
  assert.equal(csvCell(-5_000_000), '"-5000000"', "a number is data: no apostrophe in front of a loss or a credit balance");
  assert.equal(csvCell(1_232_067.44), '"1232067.44"');
  assert.equal(csvCell("-5000000"), `"'-5000000"`, "the same characters typed as text are neutralised");
  assert.equal(csvCell("=SUM(A1:A9)"), `"'=SUM(A1:A9)"`);
  assert.equal(csvCell("@cmd"), `"'@cmd"`);
  assert.equal(csvCell(null), '""');
  // "Show cents": two decimals on every number, whole amounts included; text and headers are untouched.
  assert.equal(csvCell(1_500_000, { decimals: 2 }), '"1500000.00"');
  assert.equal(csvCell(-0.5, { decimals: 2 }), '"-0.50"');
  assert.equal(toCSV(["Account", "2026"], [["Bank", 95_000_000], ["Net profit", -5_000_000]], { decimals: 2 }), '﻿"Account","2026"\r\n"Bank","95000000.00"\r\n"Net profit","-5000000.00"');
  assert.equal(toCSV(["Account", "2026"], [["Net profit", -5_000_000]]), '﻿"Account","2026"\r\n"Net profit","-5000000"');
});
