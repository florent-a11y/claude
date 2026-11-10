import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tableFromCSV, normHeader, mapQboAccount, accountGroupDigit, allocateAccountCode, qboNumberToCode, parseQboAccounts, parseQboTrialBalance, openingLinesFromTrialBalance,
  parseQboJournal, journalLabel, parseQboBills, dedupeBy, existingKeys, billKeys, journalKeys,
} from "../lib/importers";
import { buildAccounts } from "../lib/coa";
import type { Account } from "../lib/types";

/**
 * QuickBooks → client books migration: account list mapping and code allocation, trial balance → opening lines,
 * journal grouping, bills. Synthetic exports only.
 */

let seq = 0;
const TEMPLATE = buildAccounts("e1", () => `a${++seq}`);
const byName = (name: string) => TEMPLATE.find((a) => a.name === name)!;

// ---------- Report headers ----------

test("QBO reports: unnamed first column, Account # column, repeated hints", () => {
  const t = tableFromCSV("Demo Company\nTrial Balance\nAs of October 31, 2026\n\n,Debit,Credit\nBank Demo,\"1,000.00\",\n");
  assert.deepEqual(t.headers, ["", "debit", "credit"]);
  assert.equal(t.rows[0].cells["column 1"], "Bank Demo");
  assert.equal(normHeader("Account #"), "account number");
  assert.equal(normHeader("Bill No."), "bill no");
});

// ---------- Account list ----------

test("QBO account types map to our type/subtype, refined by detail type", () => {
  assert.deepEqual(mapQboAccount("Bank", "Checking", "Bank Demo IDR"), { type: "asset", subtype: "bank" });
  assert.deepEqual(mapQboAccount("Bank", "Cash on hand", "Petty cash"), { type: "asset", subtype: "cash" });
  assert.deepEqual(mapQboAccount("Accounts receivable (A/R)"), { type: "asset", subtype: "ar" });
  assert.deepEqual(mapQboAccount("Other Current Assets", "Prepaid Expenses"), { type: "asset", subtype: "prepaid" });
  assert.deepEqual(mapQboAccount("Other Current Assets", "Other current assets", "PPh 23 prepaid"), { type: "asset", subtype: "prepaid_tax" });
  assert.deepEqual(mapQboAccount("Other Current Assets", "Inventory"), { type: "asset", subtype: "inventory" });
  assert.deepEqual(mapQboAccount("Other Current Assets", "Employee Cash Advances"), { type: "asset", subtype: "other_receivable" });
  assert.deepEqual(mapQboAccount("Fixed Assets", "Machinery & Equipment"), { type: "asset", subtype: "fixed_asset" });
  assert.deepEqual(mapQboAccount("Fixed Assets", "Accumulated Depreciation"), { type: "asset", subtype: "accum_depr" });
  assert.deepEqual(mapQboAccount("Accounts payable (A/P)"), { type: "liability", subtype: "ap" });
  assert.deepEqual(mapQboAccount("Credit Card"), { type: "liability", subtype: "other_liability" });
  assert.deepEqual(mapQboAccount("Other Current Liabilities", "Payroll Tax Payable"), { type: "liability", subtype: "tax_payable" });
  assert.deepEqual(mapQboAccount("Other Current Liabilities", "Other current liabilities", "VAT output"), { type: "liability", subtype: "tax_payable" });
  assert.deepEqual(mapQboAccount("Other Current Liabilities", "Accrued Liabilities"), { type: "liability", subtype: "accrued" });
  assert.deepEqual(mapQboAccount("Other Current Liabilities", "Other current liabilities", "Customer deposits"), { type: "liability", subtype: "customer_deposit" });
  assert.deepEqual(mapQboAccount("Other Current Liabilities", "Other current liabilities", "Due to director"), { type: "liability", subtype: "other_liability" });
  assert.deepEqual(mapQboAccount("Long Term Liabilities", "Notes Payable"), { type: "liability", subtype: "loan" });
  assert.deepEqual(mapQboAccount("Equity", "Paid-In Capital or Surplus"), { type: "equity", subtype: "share_capital" });
  assert.deepEqual(mapQboAccount("Equity", "Retained Earnings"), { type: "equity", subtype: "retained_earnings" });
  assert.deepEqual(mapQboAccount("Equity", "Owner's Equity", "Dividends declared"), { type: "equity", subtype: "dividend" });
  assert.deepEqual(mapQboAccount("Income", "Service/Fee Income"), { type: "revenue", subtype: "sales" });
  assert.deepEqual(mapQboAccount("Other Income", "Interest Earned"), { type: "revenue", subtype: "other_income" });
  assert.deepEqual(mapQboAccount("Other Income", "Exchange Gain or Loss"), { type: "revenue", subtype: "fx_gain" });
  assert.deepEqual(mapQboAccount("Cost of Goods Sold", "Cost of labor - COS"), { type: "expense", subtype: "cogs" });
  assert.deepEqual(mapQboAccount("Expenses", "Rent or Lease of Buildings"), { type: "expense", subtype: "opex" });
  assert.deepEqual(mapQboAccount("Expenses", "Payroll Expenses"), { type: "expense", subtype: "payroll" });
  assert.deepEqual(mapQboAccount("Expenses", "Other Miscellaneous Service Cost", "Depreciation"), { type: "expense", subtype: "depreciation" });
  assert.deepEqual(mapQboAccount("Other Expense", "Exchange Gain or Loss"), { type: "expense", subtype: "fx_loss" });
  assert.deepEqual(mapQboAccount("Other Expense", "Other Expense", "Income tax expense"), { type: "expense", subtype: "tax_expense" });
  assert.deepEqual(mapQboAccount("Other Expense", "Penalties & Settlements"), { type: "expense", subtype: "other_expense" });
  assert.equal(mapQboAccount("Suspense type"), undefined);
});

test("account codes: group digit by type, next free code per subtype, QBO numbers normalised", () => {
  assert.equal(accountGroupDigit("asset", "bank"), "1");
  assert.equal(accountGroupDigit("revenue", "sales"), "4");
  assert.equal(accountGroupDigit("revenue", "other_income"), "7");
  assert.equal(accountGroupDigit("expense", "cogs"), "5");
  assert.equal(accountGroupDigit("expense", "opex"), "6");
  assert.equal(accountGroupDigit("expense", "fx_loss"), "8");
  assert.equal(accountGroupDigit("expense", "tax_expense"), "9");
  const taken = new Set(TEMPLATE.map((a) => a.code));
  assert.equal(allocateAccountCode("asset", "bank", taken), "1-1120"); // 1-1100 and 1-1110 are in the template
  taken.add("1-1120");
  assert.equal(allocateAccountCode("asset", "bank", taken), "1-1130");
  assert.equal(allocateAccountCode("liability", "tax_payable", taken), "2-1370");
  assert.equal(allocateAccountCode("expense", "opex", taken), "6-3000");
  assert.equal(allocateAccountCode("revenue", "other_income", taken), "7-1300");
  assert.equal(allocateAccountCode("asset", "fixed_asset", taken), "1-2600");
  taken.add("1-2600");
  assert.equal(allocateAccountCode("asset", "accum_depr", taken), "1-2610");
  assert.equal(qboNumberToCode("1-1100", "asset", "bank"), "1-1100");
  assert.equal(qboNumberToCode("6100", "expense", "opex"), "6-6100");
  assert.equal(qboNumberToCode("11100", "asset", "bank"), "1-1100");
  assert.equal(qboNumberToCode("ABC", "asset", "bank"), undefined);
  assert.equal(qboNumberToCode(undefined, "asset", "bank"), undefined);
});

const QBO_ACCOUNTS = `Demo Company
Account List
As of October 31, 2026

Account,Type,Detail type,Account number,Balance
Bank Demo IDR,Bank,Checking,1-1100,"125,000,000.00"
Petty cash,Bank,Cash on hand,,"2,500,000.00"
Accounts Receivable (A/R),Accounts receivable (A/R),Accounts Receivable (A/R),,"40,000,000.00"
Office equipment,Fixed Assets,Machinery & Equipment,,"30,000,000.00"
Office equipment:Accumulated depreciation,Fixed Assets,Accumulated Depreciation,,"(6,000,000.00)"
PPh 21 payable,Other Current Liabilities,Payroll Tax Payable,,"1,500,000.00"
Retained Earnings,Equity,Retained Earnings,,"20,000,000.00"
Consulting income,Income,Service/Fee Income,,"80,000,000.00"
Rent expense,Expenses,Rent or Lease of Buildings,6100,"24,000,000.00"
Mystery,Suspense type,,,"0.00"
TOTAL,,,,
`;

test("QBO account list: report title skipped, parent:child split, numbers and balances read, unknown types rejected", () => {
  const r = parseQboAccounts(QBO_ACCOUNTS);
  assert.equal(r.rowCount, 11);
  assert.equal(r.drafts.length, 9);
  assert.deepEqual(r.errors, [{ line: 14, message: 'unknown QuickBooks account type "Suspense type" for Mystery' }]); // blank title line dropped by the CSV parser
  assert.deepEqual(r.skipped, [{ line: 15, reason: "report total line" }]);
  const [bank, petty, ar, equip, accum, pph21, re, income, rent] = r.drafts;
  assert.equal(bank.number, "1-1100");
  assert.equal(bank.subtype, "bank");
  assert.equal(bank.balance, 125_000_000);
  assert.equal(petty.subtype, "cash");
  assert.equal(ar.subtype, "ar");
  assert.equal(equip.subtype, "fixed_asset");
  assert.equal(accum.qboName, "Office equipment:Accumulated depreciation");
  assert.equal(accum.name, "Accumulated depreciation");
  assert.equal(accum.parentQboName, "Office equipment");
  assert.equal(accum.subtype, "accum_depr");
  assert.equal(accum.balance, -6_000_000);
  assert.equal(pph21.subtype, "tax_payable");
  assert.equal(re.subtype, "retained_earnings");
  assert.equal(income.subtype, "sales");
  assert.equal(rent.number, "6100");
  assert.equal(rent.subtype, "opex");
});

test("QBO account list: Account # export without report title", () => {
  const r = parseQboAccounts("Account #,Account,Type,Detail type\n1-1100,Bank Demo,Bank,Checking\n,Consulting,Income,Service/Fee Income\n");
  assert.equal(r.drafts.length, 2);
  assert.equal(r.drafts[0].number, "1-1100");
  assert.equal(r.drafts[0].qboName, "Bank Demo");
  assert.equal(r.drafts[1].number, undefined);
  assert.equal(r.warnings.length, 0);
});

// ---------- Trial balance ----------

const QBO_TB = `Demo Company
Trial Balance
As of October 31, 2026

,Debit,Credit
Bank IDR,"125,000,000.00",
Accounts receivable,"40,000,000.00",
Equipment and furniture,"30,000,000.00",
Equipment and furniture:Accumulated depreciation - equipment,,"6,000,000.00"
Accounts payable,,"15,000,000.00"
Share capital (paid-up),,"100,000,000.00"
Retained earnings,,"20,000,000.00"
Service revenue,,"80,000,000.00"
Office rent,"24,000,000.00",
Salaries and wages,"2,000,000.00",
Suspense,"(0.00)",
TOTAL,"221,000,000.00","221,000,000.00"
`;

test("QBO trial balance: as-of date from the title, totals dropped, zero rows skipped, file balances", () => {
  const r = parseQboTrialBalance(QBO_TB);
  assert.equal(r.asOf, "2026-10-31");
  assert.equal(r.drafts.length, 10);
  assert.equal(r.totalDebit, 221_000_000);
  assert.equal(r.totalCredit, 221_000_000);
  assert.ok(r.skipped.some((s) => s.reason === "report total line"));
  assert.ok(r.skipped.some((s) => /Suspense: zero balance/.test(s.reason)));
  assert.equal(r.warnings.length, 0);
  assert.deepEqual(r.drafts[3], { account: "Equipment and furniture:Accumulated depreciation - equipment", debit: 0, credit: 6_000_000, line: 8 });
});

test("QBO trial balance: negative debits are credits and the file-level imbalance is reported", () => {
  const r = parseQboTrialBalance(",Debit,Credit\nBank,\"(1,000.00)\",\nLoan,,\"2,000.00\"\n");
  assert.deepEqual(r.drafts.map((d) => [d.debit, d.credit]), [[0, 1000], [0, 2000]]);
  assert.match(r.warnings[0], /do not balance/);
});

test("opening lines: one balanced line per resolved account (leaf names), netted, unmatched reported", () => {
  const r = parseQboTrialBalance(QBO_TB);
  const resolve = (qbo: string): Account | undefined => TEMPLATE.find((a) => a.name.toLowerCase() === (qbo.split(":").pop() ?? qbo).trim().toLowerCase());
  const o = openingLinesFromTrialBalance(r.drafts, resolve, { description: "Opening" });
  assert.equal(o.unmatched.length, 0);
  assert.equal(o.difference, 0);
  assert.equal(o.lines.length, 10);
  const debit = o.lines.reduce((s, l) => s + l.debit, 0), credit = o.lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(debit, 221_000_000);
  assert.equal(credit, 221_000_000);
  assert.ok(o.lines.every((l) => (l.debit > 0) !== (l.credit > 0)));
  const ar = o.lines.find((l) => l.accountId === byName("Accounts receivable").id)!;
  assert.equal(ar.accountCode, "1-1200");
  assert.equal(ar.debit, 40_000_000);
  assert.equal(ar.description, "Opening");
  // Two QBO accounts on one of ours net into a single line; an unknown account comes back unmatched.
  const netted = openingLinesFromTrialBalance([{ account: "Bank A", debit: 500, credit: 0, line: 1 }, { account: "Bank B", debit: 0, credit: 200, line: 2 }, { account: "Nowhere", debit: 300, credit: 0, line: 3 }], (n) => (n.startsWith("Bank") ? byName("Bank IDR") : undefined));
  assert.deepEqual(netted.lines.map((l) => [l.accountCode, l.debit, l.credit]), [["1-1100", 300, 0]]);
  assert.deepEqual(netted.unmatched.map((u) => u.account), ["Nowhere"]);
  assert.equal(netted.difference, 300);
  // A residual difference is booked to the account given.
  const rounded = openingLinesFromTrialBalance([{ account: "Bank A", debit: 1001, credit: 0, line: 1 }, { account: "Loan", debit: 0, credit: 1000, line: 2 }], (n) => (n === "Loan" ? byName("Bank loans") : byName("Bank IDR")), { balanceTo: byName("Retained earnings") });
  assert.equal(rounded.difference, 0);
  assert.deepEqual(rounded.lines[2], { accountId: byName("Retained earnings").id, accountCode: "3-2000", description: "Rounding difference on opening balances", debit: 0, credit: 1 });
});

// ---------- Journal ----------

const QBO_JOURNAL = `Demo Company
Journal
January - March 2026

,Date,Transaction Type,Num,Name,Memo/Description,Account,Debit,Credit
,15/01/2026,Invoice,1041,PT Demo Villa,Working KITAS,Accounts Receivable (A/R),"43,000,000.00",
,,,,,Working KITAS,Consulting income,,"43,000,000.00"
,,,,,,,"43,000,000.00","43,000,000.00"
,Date,Transaction Type,Num,Name,Memo/Description,Account,Debit,Credit
,02/02/2026,Journal Entry,7,,Bank charges January,Bank charges,"150,000.00",
,,,,,Bank charges January,Bank Demo IDR,"(150,000.00)",
,,,,,,,"150,000.00","150,000.00"
,20/02/2026,Payment,,PT Demo Villa,,Bank Demo IDR,"43,000,000.00",
,,,,,,Accounts Receivable (A/R),,"40,000,000.00"
,,,,,,,"43,000,000.00","40,000,000.00"
,TOTAL,,,,,,"86,150,000.00","83,150,000.00"
`;

test("QBO journal: groups by transaction, blank-date continuation rows, repeated headers, parentheses as credits, unbalanced groups rejected", () => {
  const r = parseQboJournal(QBO_JOURNAL);
  assert.equal(r.drafts.length, 2);
  assert.deepEqual(r.errors, [{ line: 12, message: "Payment PT Demo Villa: debits 43000000 ≠ credits 40000000" }]);
  assert.ok(r.skipped.some((s) => s.reason === "repeated header"));
  assert.ok(r.skipped.some((s) => s.reason === "report total line"));
  assert.ok(r.warnings.some((w) => /dd\/mm\/yyyy/.test(w)));
  const [inv, je] = r.drafts;
  assert.equal(inv.date, "2026-01-15");
  assert.equal(inv.type, "Invoice");
  assert.equal(inv.num, "1041");
  assert.equal(inv.name, "PT Demo Villa");
  assert.equal(inv.memo, "Working KITAS");
  assert.equal(journalLabel(inv), "Invoice 1041 PT Demo Villa");
  assert.deepEqual(inv.lines.map((l) => [l.account, l.debit, l.credit]), [["Accounts Receivable (A/R)", 43_000_000, 0], ["Consulting income", 0, 43_000_000]]);
  assert.ok(inv.balanced);
  assert.equal(je.date, "2026-02-02"); // ambiguous date read day-first like the rest of the column
  assert.equal(journalLabel(je), "Journal Entry 7");
  assert.deepEqual(je.lines.map((l) => [l.account, l.debit, l.credit]), [["Bank charges", 150_000, 0], ["Bank Demo IDR", 0, 150_000]]);
  assert.equal(je.totalDebit, 150_000);
  assert.equal(je.totalCredit, 150_000);
});

test("QBO journal: flat export that repeats the date on every line, Amount column with signed values", () => {
  const csv = "Date,Type,Num,Name,Account,Amount\n2026-03-01,Expense,E-1,Demo Shop,Office supplies and software,250000\n2026-03-01,Expense,E-1,Demo Shop,Bank IDR,-250000\n2026-03-01,Expense,E-2,Demo Shop,Bank charges,10000\n2026-03-01,Expense,E-2,Demo Shop,Bank IDR,-10000\n";
  const r = parseQboJournal(csv, { dateFormat: "ymd" });
  assert.deepEqual(r.drafts.map((d) => [d.num, d.lines.length, d.balanced]), [["E-1", 2, true], ["E-2", 2, true]]);
  assert.equal(r.errors.length, 0);
  const keys = existingKeys([{ sourceId: "qbo:Expense:E-1:2026-03-01" }], journalKeys);
  const { fresh, duplicates } = dedupeBy(r.drafts.map((d) => ({ sourceId: `qbo:${d.type}:${d.num}:${d.date}` })), journalKeys, keys);
  assert.equal(fresh.length, 1);
  assert.equal(duplicates.length, 1);
});

// ---------- Bills ----------

const QBO_BILLS = `Date,Transaction Type,Num,Vendor,Due Date,Memo/Description,Amount,Open Balance,Currency,Exchange rate
15/01/2026,Bill,INV-778,CV Demo Notaris,30/01/2026,Deed amendment,"5,000,000.00","0.00",IDR,
03/02/2026,Bill,A-12,Demo Software Ltd - USD,03/03/2026,Annual licence,"1,000.00","1,200.00",USD,16300
03/02/2026,Bill,A-12,Demo Software Ltd - USD,03/03/2026,Support,"200.00","1,200.00",USD,16300
10/02/2026,Bill Payment (Check),,CV Demo Notaris,,,"-5,000,000.00",,IDR,
12/02/2026,Bill,,Demo Utilities,12/03/2026,Electricity,"750,000.00","250,000.00",IDR,
Total,,,,,,"6,950,000.00",,,
`;

test("QBO bills: one bill per number with lines, status from open balance, payments and totals skipped, currency suffix", () => {
  const r = parseQboBills(QBO_BILLS, { dateFormat: "dmy" });
  assert.equal(r.drafts.length, 3);
  assert.deepEqual(r.currencies, ["IDR", "USD"]);
  assert.ok(r.hasOpenBalanceColumn);
  assert.equal(r.errors.length, 0);
  assert.ok(r.skipped.some((s) => /Bill Payment/.test(s.reason)));
  assert.ok(r.skipped.some((s) => s.reason === "report total line"));
  const [notary, software, utilities] = r.drafts;
  assert.equal(notary.qboDocNumber, "INV-778");
  assert.equal(notary.vendorName, "CV Demo Notaris");
  assert.equal(notary.date, "2026-01-15");
  assert.equal(notary.dueDate, "2026-01-30");
  assert.equal(notary.total, 5_000_000);
  assert.equal(notary.status, "paid");
  assert.equal(notary.amountPaid, 5_000_000);
  assert.equal(software.vendorName, "Demo Software Ltd");
  assert.equal(software.currency, "USD");
  assert.equal(software.fxRate, 16300);
  assert.equal(software.lines.length, 2);
  assert.equal(software.total, 1200);
  assert.equal(software.status, "sent");
  assert.match(utilities.qboDocNumber, /^2026-02-12\/demo utilities\/750000$/);
  assert.equal(utilities.status, "partial");
  assert.equal(utilities.amountPaid, 500_000);
  assert.ok(utilities.warnings.some((w) => /no bill number/.test(w)));
  const { fresh, duplicates } = dedupeBy(r.drafts, billKeys, existingKeys([{ qboDocNumber: "inv-778" }], billKeys));
  assert.deepEqual(fresh.map((d) => d.qboDocNumber), ["A-12", utilities.qboDocNumber]);
  assert.equal(duplicates.length, 1);
});

test("QBO bills: Status column without open balances, Supplier / No. / Total headers", () => {
  const r = parseQboBills("Date,No.,Supplier,Total,Status\n2026-03-01,77,Demo Utilities,100000,Paid\n2026-03-02,78,Demo Utilities,200000,Open\n2026-03-03,79,Demo Utilities,300000,Voided\n");
  assert.deepEqual(r.drafts.map((d) => [d.qboDocNumber, d.status, d.total, d.amountPaid]), [["77", "paid", 100_000, 100_000], ["78", "sent", 200_000, 0]]);
  assert.ok(!r.hasOpenBalanceColumn);
  assert.ok(r.warnings.some((w) => /no Open Balance column/.test(w)));
  assert.match(r.skipped[0].reason, /voided/);
});
