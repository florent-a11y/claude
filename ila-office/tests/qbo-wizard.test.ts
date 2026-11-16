import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  accountResolver, cleanAccountName, detectQboReport, gridToCSV, guessAccountFromName, journalSourceIds, parseQboBills, parseQboInvoices, parseQboJournal, parseQboTrialBalance, parseQboVendors,
  parseDate, parseReportPeriod, sameCompanyName, tableFromCSV, tableFromGrid,
} from "../lib/importers";
import { bestTrialBalanceCheck, compareTrialBalance, migrationRules, uploadBatches, QBO_MAX_FILE_BYTES } from "../lib/qbo-migration";
import { buildAccounts } from "../lib/coa";
import type { Account, Entity, JournalEntry } from "../lib/types";

/**
 * "Migrate a company from QuickBooks": reading Excel-shaped grids with title rows, recognising each report, the rules
 * of the combined plan (Journal + Trial Balance → history posted and the trial balance only checked; Trial Balance
 * alone → opening entry), accounts created from the journal, the proof against QuickBooks, bulk posting, and one
 * full run on the file backend (twice: the second adds nothing). Synthetic data only. lib/db.ts reads ILA_DATA_DIR
 * when it is first loaded, so the temp directory is set before the store modules are imported.
 */

const DIR = mkdtempSync(path.join(os.tmpdir(), "ila-qbo-wizard-"));
process.env.ILA_DATA_DIR = DIR;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

let D: typeof import("../lib/db");
let P: typeof import("../lib/posting");
let S: typeof import("../lib/qbo-migration-services");
let I: typeof import("../lib/import-services");
before(async () => {
  D = await import("../lib/db");
  P = await import("../lib/posting");
  S = await import("../lib/qbo-migration-services");
  I = await import("../lib/import-services");
});
after(() => rmSync(DIR, { recursive: true, force: true }));

// ---------- Synthetic QuickBooks exports (grids, as lib/statement-file.ts returns them) ----------

const FOOTER = ["Monday, Nov 16, 2026 02:13:22 AM GMT+8 - Accrual Basis"];
const COMPANY = "Demo Trading Co";

/** Modern layout: report title first, then the company. */
const ACCOUNTS_GRID = [
  ["Account List"], [COMPANY], [],
  ["Account", "Type", "Detail type", "Description", "Balance"],
  ["Bank Demo IDR", "Bank", "Checking", "", "121,000,000.75"],
  ["Accounts Receivable (A/R)", "Accounts receivable (A/R)", "Accounts Receivable (A/R)", "", "8,000,000.00"],
  ["Accounts Payable (A/P)", "Accounts payable (A/P)", "Accounts Payable (A/P)", "", "750,000.00"],
  ["Opening Balance Equity", "Equity", "Opening Balance Equity", "", "100,000,000.00"],
  ["Retained Earnings", "Equity", "Retained Earnings", "", ""],
  ["Consulting income", "Income", "Service/Fee Income", "", ""],
  ["Rent expense", "Expenses", "Rent or Lease of Buildings", "", ""],
  [], FOOTER,
];

const JH = ["", "Date", "Transaction Type", "Num", "Name", "Memo/Description", "Account", "Debit", "Credit"];
const txn = (date: string, type: string, num: string, name: string, memo: string, lines: Array<[account: string, debit: string, credit: string]>): string[][] => {
  const total = lines.reduce((s, l) => s + Number(l[1].replace(/,/g, "") || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
  return [...lines.map((l, i) => (i === 0 ? ["", date, type, num, name, memo, l[0], l[1], l[2]] : ["", "", "", "", "", memo, l[0], l[1], l[2]])), ["", "", "", "", "", "", "", total, total]];
};
const Y2025 = [
  ...txn("05/01/2025", "Deposit", "", "", "Capital paid in", [["Bank Demo IDR", "100,000,000.00", ""], ["Opening Balance Equity", "", "100,000,000.00"]]),
  ...txn("10/03/2025", "Invoice", "1001", "PT Demo Villa", "Advisory", [["Accounts Receivable (A/R)", "30,000,000.50", ""], ["Consulting income", "", "30,000,000.50"]]),
  ...txn("20/03/2025", "Payment", "", "PT Demo Villa", "", [["Bank Demo IDR", "30,000,000.50", ""], ["Accounts Receivable (A/R)", "", "30,000,000.50"]]),
  ...txn("01/06/2025", "Expense", "", "Demo Landlord", "Rent", [["Rent expense", "12,000,000.00", ""], ["Bank Demo IDR", "", "12,000,000.00"]]),
];
const Y2026 = [
  // Two unnumbered deposits on the same day: the same legacy key, told apart by their lines.
  ...txn("15/01/2026", "Deposit", "", "", "Cash sale A", [["Bank Demo IDR", "1,000,000.00", ""], ["Consulting income", "", "1,000,000.00"]]),
  ...txn("15/01/2026", "Deposit", "", "", "Cash sale B", [["Bank Demo IDR", "2,500,000.25", ""], ["Consulting income", "", "2,500,000.25"]]),
  ...txn("20/02/2026", "Invoice", "1002", "PT Demo Villa", "Retainer", [["Accounts Receivable (A/R)", "8,000,000.00", ""], ["Consulting income", "", "8,000,000.00"]]),
  // Accounts missing from the Account List: one deleted in QuickBooks, one whose name says nothing.
  ...txn("25/02/2026", "Bill", "B-7", "CV Demo Supplies", "Stationery", [["Old supplies expense (deleted)", "750,000.00", ""], ["Accounts Payable (A/P)", "", "750,000.00"]]),
  ...txn("28/02/2026", "Journal Entry", "5", "", "Reclass", [["Clearing 77", "500,000.00", ""], ["Bank Demo IDR", "", "500,000.00"]]),
];
/** Classic layout: company first, then the report title and the period. */
const journalGrid = (rows: string[][], period = "All Dates") => [[COMPANY], ["Journal"], [period], [], JH, ...rows, ["", "TOTAL", "", "", "", "", "", "1.00", "1.00"], [], FOOTER];
const JOURNAL_GRID = journalGrid([...Y2025, ...Y2026]);

/** QuickBooks' own layout: income and expenses for 2026 only, the 2025 result (30,000,000.50 − 12,000,000) in Retained Earnings. */
const TB_GRID = [
  [COMPANY], ["Trial Balance"], ["As of February 28, 2026"], [],
  ["", "Debit", "Credit"],
  ["Bank Demo IDR", "121,000,000.75", ""],
  ["Accounts Receivable (A/R)", "8,000,000.00", ""],
  ["Clearing 77", "500,000.00", ""],
  ["Accounts Payable (A/P)", "", "750,000.00"],
  ["Opening Balance Equity", "", "100,000,000.00"],
  ["Retained Earnings", "", "18,000,000.50"],
  ["Consulting income", "", "11,500,000.25"],
  ["Old supplies expense (deleted)", "750,000.00", ""],
  ["TOTAL", "130,250,000.75", "130,250,000.75"],
  [], FOOTER,
];

/** Grouped by customer, open balance only. */
const OPEN_INVOICES_GRID = [
  [COMPANY], ["Open Invoices"], ["As of February 28, 2026"], [],
  ["", "Date", "Transaction Type", "Num", "Due Date", "Open Balance"],
  ["PT Demo Villa"],
  ["", "20/02/2026", "Invoice", "1002", "22/03/2026", "8,000,000.00"],
  ["Total for PT Demo Villa", "", "", "", "", "8,000,000.00"],
  ["TOTAL", "", "", "", "", "8,000,000.00"],
  [], FOOTER,
];
const UNPAID_BILLS_GRID = [
  [COMPANY], ["Unpaid Bills"], ["All Dates"], [],
  ["", "Date", "Transaction Type", "Num", "Due Date", "Past Due", "Amount", "Open Balance"],
  ["CV Demo Supplies"],
  ["", "25/02/2026", "Bill", "B-7", "27/03/2026", "0", "750,000.00", "750,000.00"],
  ["Total for CV Demo Supplies", "", "", "", "", "", "750,000.00", "750,000.00"],
  [], FOOTER,
];
const GL_GRID = [
  [COMPANY], ["General Ledger"], ["All Dates"], [],
  ["", "Date", "Transaction Type", "Num", "Name", "Memo/Description", "Split", "Amount", "Balance"],
  ["Bank Demo IDR"], ["", "05/01/2025", "Deposit", "", "", "Capital paid in", "Opening Balance Equity", "100,000,000.00", "100,000,000.00"],
];
const VENDORS_GRID = [
  [COMPANY], ["Vendor Contact List"], [],
  ["Vendor", "Phone Numbers", "Email", "Full Name", "Address", "Account #"],
  ["CV Demo Supplies", "Phone: 0361 555 0100", "billing@demo-supplies.example", "Made Demo", "Jl. Contoh 1, Denpasar", "V-22"],
  ["Demo Software Ltd - USD", "", "not-an-email", "", "", ""],
  ["Closed vendor (deleted)", "", "", "", "", ""],
];
const CUSTOMERS_GRID = [
  ["Customer Contact List"], [COMPANY], [],
  ["Customer", "Phone Numbers", "Email", "Full Name", "Billing Address", "Shipping Address"],
  ["PT Demo Villa", "", "finance@demo-villa.example", "Wayan Demo", "Jl. Contoh 2, Ubud", ""],
];

let seq = 0;
const ENTITY: Entity = {
  id: "ent-demo", name: COMPANY, legalName: "PT Demo Trading Co", type: "pt_pma", country: "ID", isOwn: false, baseCurrency: "IDR", fiscalYearStartMonth: 1,
  tax: { regime: "normal_22", pkp: false, ppnRate: 0.11, lkpm: true, payroll: false }, status: "active", createdAt: "2026-01-01T00:00:00.000Z",
};
const template = () => buildAccounts(ENTITY.id, () => `acc-${++seq}`);
const world = (over: Partial<import("../lib/qbo-migration-services").MigrationWorld> = {}) => ({ entity: ENTITY, virtual: false, accounts: template(), entries: [], invoices: [], bills: [], vendors: [], companies: [], contacts: [], ...over });
/** Files as the wizard holds them after the upload. */
const tables = (...grids: Array<[name: string, grid: string[][]]>) => grids.map(([name, grid]) => {
  const { file } = S.readUpload(name, Buffer.from(gridToCSV(grid)), [ENTITY.name, ENTITY.legalName]);
  return { file, table: tableFromGrid(grid) };
});
const xlsx = (grid: string[][]): Buffer => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

// ---------- tableFromGrid ----------

test("tableFromGrid: title rows skipped, company and report told apart in both layouts, footer dropped", () => {
  const classic = tableFromGrid(JOURNAL_GRID);
  assert.equal(classic.headerLine, 5);
  assert.deepEqual(classic.headers.slice(0, 4), ["", "date", "transaction type", "num"]);
  assert.equal(classic.reportTitle, "Journal");
  assert.equal(classic.companyName, COMPANY);
  assert.equal(classic.periodLine, "All Dates");
  assert.deepEqual(classic.titleLines, [COMPANY, "Journal", "All Dates"]);
  assert.ok(classic.rows.every((r) => !Object.values(r.cells).some((v) => /Accrual Basis/.test(v))));
  assert.equal(classic.rows[0].cells["account"], "Bank Demo IDR");
  assert.equal(classic.rows[0].cells["column 1"], "");
  const modern = tableFromGrid(ACCOUNTS_GRID);
  assert.equal(modern.reportTitle, "Account List");
  assert.equal(modern.companyName, COMPANY);
  assert.equal(modern.periodLine, undefined);
  assert.equal(modern.rows.length, 7); // blank row and footer dropped
  const tb = tableFromGrid(TB_GRID);
  assert.deepEqual(tb.headers, ["", "debit", "credit"]);
  assert.equal(tb.periodLine, "As of February 28, 2026");
  assert.equal(tb.rows[0].cells["column 1"], "Bank Demo IDR");
  // No title rows at all: the first row is the header.
  const flat = tableFromGrid([["Date", "Num", "Customer", "Amount"], ["2026-03-01", "7", "Demo", "100"]]);
  assert.equal(flat.headerLine, 1);
  assert.deepEqual(flat.titleLines, []);
  assert.equal(flat.reportTitle, undefined);
});

test("tableFromCSV is tableFromGrid over the parsed CSV; a grid survives the trip through CSV text", () => {
  const back = tableFromCSV(gridToCSV(TB_GRID));
  assert.equal(back.reportTitle, "Trial Balance");
  assert.equal(back.companyName, COMPANY);
  assert.deepEqual(back.rows.map((r) => r.cells), tableFromGrid(TB_GRID).rows.map((r) => r.cells));
  assert.equal(parseQboTrialBalance(back).asOf, "2026-02-28");
  // An unquoted date in a CSV is split on its comma and put back together.
  assert.equal(parseQboTrialBalance("Demo\nTrial Balance\nAs of October 31, 2026\n,Debit,Credit\nBank,100,\nLoan,,100\n").asOf, "2026-10-31");
});

test("report period: as of, ranges with and without days, a single month, all dates", () => {
  assert.deepEqual(parseReportPeriod("As of February 28, 2026"), { to: "2026-02-28" });
  assert.deepEqual(parseReportPeriod("As of 28 Feb 2026"), { to: "2026-02-28" });
  assert.deepEqual(parseReportPeriod("January - March 2026"), { from: "2026-01-01", to: "2026-03-31" });
  assert.deepEqual(parseReportPeriod("January - October, 2026"), { from: "2026-01-01", to: "2026-10-31" });
  assert.deepEqual(parseReportPeriod("January 1 - February 28, 2026"), { from: "2026-01-01", to: "2026-02-28" });
  assert.deepEqual(parseReportPeriod("1 July 2025 - 30 June 2026"), { from: "2025-07-01", to: "2026-06-30" });
  assert.deepEqual(parseReportPeriod("01/01/2026 - 28/02/2026"), { from: "2026-01-01", to: "2026-02-28" });
  assert.deepEqual(parseReportPeriod("February 2026"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(parseReportPeriod("All Dates"), {});
  assert.deepEqual(parseReportPeriod(undefined), {});
  assert.deepEqual(parseReportPeriod("Trial Balance as of 28-Feb-26"), { to: "2026-02-28" }); // Excel's d-mmm-yy date cells
  assert.equal(parseDate("20-Jan-26"), "2026-01-20");
  assert.equal(parseDate("20-01-26"), "2026-01-20"); // still numeric, day first
  const ranged = parseQboTrialBalance([[COMPANY], ["Trial Balance"], ["January - February, 2026"], ["", "Debit", "Credit"], ["Bank", "5.00", ""], ["Capital", "", "5.00"]].map((r) => r.join(",")).join("\n").replace("January - February, 2026", '"January - February, 2026"'));
  assert.equal(ranged.asOf, "2026-02-28");
  assert.equal(ranged.from, "2026-01-01");
});

// ---------- Kind detection ----------

test("each QuickBooks report is recognised from its title", () => {
  const kind = (grid: string[][]) => detectQboReport(tableFromGrid(grid)).kind;
  assert.equal(kind(ACCOUNTS_GRID), "accounts");
  assert.equal(kind(JOURNAL_GRID), "journal");
  assert.equal(kind(TB_GRID), "trial_balance");
  assert.equal(kind(GL_GRID), "general_ledger");
  assert.equal(kind(OPEN_INVOICES_GRID), "invoices");
  assert.equal(kind(UNPAID_BILLS_GRID), "bills");
  assert.equal(kind(CUSTOMERS_GRID), "customers");
  assert.equal(kind(VENDORS_GRID), "vendors");
  assert.equal(kind([[COMPANY], ["Supplier Contact List"], ["Supplier", "Phone Numbers", "Email"], ["Demo", "", ""]]), "vendors");
  assert.equal(kind([[COMPANY], ["Invoice List"], ["All Dates"], ["Date", "Transaction Type", "Num", "Name", "Due Date", "Amount", "Open Balance"], ["01/02/2026", "Invoice", "9", "Demo", "", "1", "1"]]), "invoices");
  assert.equal(kind([[COMPANY], ["Bill List"], ["Date", "Num", "Vendor", "Amount"], ["01/02/2026", "9", "Demo", "1"]]), "bills");
  assert.equal(kind([[COMPANY], ["Profit and Loss"], ["January - March 2026"], ["", "Total"], ["Income", "5"]]), "unknown");
  assert.match(detectQboReport(tableFromGrid(JOURNAL_GRID)).reason, /report title "Journal"/);
});

test("without a title the column set decides", () => {
  const kind = (header: string[]) => detectQboReport(tableFromGrid([header, header.map(() => "x")])).kind;
  assert.equal(kind(["Date", "Transaction Type", "Num", "Name", "Memo/Description", "Account", "Debit", "Credit"]), "journal");
  assert.equal(kind(["", "Debit", "Credit"]), "trial_balance");
  assert.equal(kind(["", "Date", "Transaction Type", "Num", "Name", "Memo/Description", "Split", "Amount", "Balance"]), "general_ledger");
  assert.equal(kind(["Account", "Type", "Detail type", "Balance"]), "accounts");
  assert.equal(kind(["Full name", "Type", "Detail type", "Total balance"]), "accounts");
  assert.equal(kind(["Date", "Num", "Customer", "Due Date", "Amount", "Open Balance"]), "invoices");
  assert.equal(kind(["Date", "Num", "Vendor", "Due Date", "Amount", "Open Balance"]), "bills");
  assert.equal(kind(["Date", "No.", "Supplier", "Total", "Status"]), "bills");
  assert.equal(kind(["Customer", "Phone Numbers", "Email", "Full Name", "Billing Address"]), "customers");
  assert.equal(kind(["Vendor", "Phone Numbers", "Email", "Full Name", "Address"]), "vendors");
  assert.equal(kind(["Colour", "Shape"]), "unknown");
});

test("the company printed in a file is compared with the chosen company, legal forms aside", () => {
  assert.ok(sameCompanyName("PT Demo Trading Co", "Demo Trading Co"));
  assert.ok(sameCompanyName("Demo Trading", "PT. Demo Trading Co, Ltd"));
  assert.ok(!sameCompanyName("Other Villa Group", "Demo Trading Co"));
  assert.ok(sameCompanyName(undefined, "Demo Trading Co")); // nothing printed: nothing to warn about
});

// ---------- Grouped reports, vendors, account names ----------

test("Open Invoices and Unpaid Bills: the heading row names the customer or vendor, the open balance is the total when there is no amount", () => {
  const inv = parseQboInvoices(tableFromGrid(OPEN_INVOICES_GRID));
  assert.equal(inv.errors.length, 0);
  assert.deepEqual(inv.drafts.map((d) => [d.qboDocNumber, d.customerName, d.date, d.dueDate, d.total, d.openBalance, d.status]), [["1002", "PT Demo Villa", "2026-02-20", "2026-03-22", 8_000_000, 8_000_000, "sent"]]);
  assert.ok(inv.warnings.some((w) => /open balance is taken as the invoice total/.test(w)));
  assert.equal(inv.skipped.filter((s) => s.reason === "report total line").length, 2);
  const bills = parseQboBills(tableFromGrid(UNPAID_BILLS_GRID));
  assert.equal(bills.errors.length, 0);
  assert.deepEqual(bills.drafts.map((d) => [d.qboDocNumber, d.vendorName, d.date, d.total, d.openBalance, d.status]), [["B-7", "CV Demo Supplies", "2026-02-25", 750_000, 750_000, "sent"]]);
  assert.ok(!bills.warnings.some((w) => /no Vendor/.test(w)));
});

test("vendor contact list: names cleaned, email checked, deleted vendors marked inactive", () => {
  const r = parseQboVendors(tableFromGrid(VENDORS_GRID));
  assert.deepEqual(r.drafts.map((d) => [d.name, d.email, d.inactive]), [["CV Demo Supplies", "billing@demo-supplies.example", false], ["Demo Software Ltd", undefined, false], ["Closed vendor", undefined, true]]);
  assert.match(r.drafts[0].notes ?? "", /Contact: Made Demo/);
  assert.match(r.drafts[0].notes ?? "", /Account no\. at the vendor: V-22/);
  assert.match(r.drafts[1].notes ?? "", /Billed in USD/);
  assert.ok(r.drafts[1].warnings.some((w) => /invalid email/.test(w)));
});

test("account names on reports: numbers and (deleted) marks are ignored when matching; unknown names get a guessed type", () => {
  assert.equal(cleanAccountName("1100 Bank Demo"), "Bank Demo");
  assert.equal(cleanAccountName("6000 Expenses:6100 Rent"), "Expenses:Rent");
  assert.equal(cleanAccountName("Old bank (deleted)"), "Old bank");
  assert.equal(cleanAccountName("2024 bonus"), "bonus"); // a leading number is read as an account number
  const accounts = template();
  const resolve = accountResolver([...accounts, { ...accounts[0], id: "x1", code: "1-1120", name: "Bank Demo", qboName: "Bank Demo IDR" }]);
  assert.equal(resolve("Bank Demo IDR")?.id, "x1");
  assert.equal(resolve("1120 Bank Demo IDR")?.id, "x1");
  assert.equal(resolve("Bank Demo IDR (deleted)")?.id, "x1");
  assert.equal(resolve("Assets:Bank Demo")?.id, "x1"); // leaf name
  assert.equal(resolve("Accounts receivable")?.code, "1-1200");
  assert.equal(resolve("Nowhere"), undefined);
  assert.deepEqual(guessAccountFromName("Old supplies expense (deleted)"), { type: "expense", subtype: "opex" });
  assert.deepEqual(guessAccountFromName("Staff salaries"), { type: "expense", subtype: "payroll" });
  assert.deepEqual(guessAccountFromName("Other receivables"), { type: "asset", subtype: "other_receivable" });
  assert.deepEqual(guessAccountFromName("PPh 23 payable"), { type: "liability", subtype: "tax_payable" });
  assert.deepEqual(guessAccountFromName("Interest income"), { type: "revenue", subtype: "other_income" });
  assert.deepEqual(guessAccountFromName("Share capital"), { type: "equity", subtype: "share_capital" });
  assert.deepEqual(guessAccountFromName("Clearing 77"), { type: "asset", subtype: "other_asset" }); // says nothing: neutral
});

test("journal sourceIds: one per transaction, unnumbered same-day transactions told apart, stable whatever the order", () => {
  const drafts = parseQboJournal(tableFromGrid(JOURNAL_GRID)).drafts;
  assert.equal(drafts.length, 9);
  const ids = journalSourceIds(drafts);
  assert.equal(new Set(ids.map((i) => i.sourceId)).size, 9);
  assert.equal(ids[1].sourceId, "qbo:Invoice:1001:2025-03-10"); // unique key: unchanged, as older imports stored it
  const [a, b] = [ids[4], ids[5]];
  assert.equal(a.base, "qbo:Deposit:-:2026-01-15");
  assert.equal(b.base, a.base);
  assert.notEqual(a.sourceId, b.sourceId);
  assert.ok(a.sourceId.startsWith(`${a.base}:`));
  const reversed = journalSourceIds([...drafts].reverse()).reverse();
  assert.deepEqual(reversed.map((i) => i.sourceId), ids.map((i) => i.sourceId));
  // Even identical twins are both kept.
  const twins = journalSourceIds([drafts[4], drafts[4]]);
  assert.notEqual(twins[0].sourceId, twins[1].sourceId);
  assert.equal(twins[1].sourceId, `${twins[0].sourceId}:2`);
});

// ---------- Rules of the combined plan ----------

test("rules: with a Journal the Trial Balance is the check, without one it is the opening entry; documents never post", () => {
  const history = migrationRules(["accounts", "journal", "trial_balance", "invoices", "bills"]);
  assert.deepEqual([history.mode, history.postJournal, history.postOpening, history.check, history.documentsPostToLedger], ["history", true, false, true, false]);
  assert.ok(history.notes.some((n) => /Trial Balance is not posted/.test(n)));
  assert.ok(history.notes.some((n) => /without a new posting/.test(n)));
  const noCheck = migrationRules(["journal"]);
  assert.deepEqual([noCheck.mode, noCheck.check], ["history", false]);
  const opening = migrationRules(["accounts", "trial_balance", "invoices"]);
  assert.deepEqual([opening.mode, opening.postJournal, opening.postOpening, opening.check, opening.documentsPostToLedger], ["opening", false, true, true, false]);
  const documents = migrationRules(["accounts", "invoices", "general_ledger"]);
  assert.deepEqual([documents.mode, documents.postJournal, documents.postOpening, documents.check], ["documents", false, false, false]);
  assert.equal(migrationRules(["general_ledger", "unknown"]).mode, "empty");
  // The ledger was migrated by an earlier run: a trial balance alone is compared, not posted on top.
  const check = migrationRules(["trial_balance", "bills"], { ledgerMigrated: true });
  assert.deepEqual([check.mode, check.postJournal, check.postOpening, check.check], ["check", false, false, true]);
  assert.equal(migrationRules(["journal", "trial_balance"], { ledgerMigrated: true }).mode, "history");
});

test("plan with Journal + Trial Balance: accounts first, the whole history posted, the trial balance not posted but used as the check", async () => {
  const plan = await S.buildMigrationPlan(world(), tables(["bills.csv", UNPAID_BILLS_GRID], ["tb.csv", TB_GRID], ["invoices.csv", OPEN_INVOICES_GRID], ["journal.csv", JOURNAL_GRID], ["gl.csv", GL_GRID], ["accounts.csv", ACCOUNTS_GRID]));
  assert.equal(plan.blocking, undefined);
  assert.equal(plan.rules.mode, "history");
  assert.deepEqual(plan.steps.map((s) => s.key), ["accounts", "journal", "invoices", "bills"]); // whatever the upload order; no opening step
  const [acc, jrn, inv, bill] = plan.steps.map((s) => s.plan);
  // Accounts: QuickBooks' A/R and A/P go to our trade accounts, Retained Earnings to ours by name, the rest are created.
  assert.deepEqual(acc.accounts.map((a) => a.qboName), ["Bank Demo IDR", "Opening Balance Equity", "Consulting income", "Rent expense"]);
  assert.equal(acc.accountPatches.length, 3);
  // Journal: every transaction, one entry each, in date order, cents kept.
  assert.equal(jrn.journals.length, 9);
  assert.equal(jrn.errors.length, 0);
  assert.deepEqual(jrn.journals.map((j) => j.date), [...jrn.journals.map((j) => j.date)].sort());
  assert.equal(jrn.journals[1].memo, "QBO Invoice 1001 PT Demo Villa · Advisory");
  assert.deepEqual(jrn.journals[1].lines.map((l) => [l.accountCode, l.debit, l.credit, l.counterpartyName]), [["1-1200", 30_000_000.5, 0, "PT Demo Villa"], [acc.accounts[2].code, 0, 30_000_000.5, "PT Demo Villa"]]);
  assert.ok(jrn.journals.every((j) => j.source === "manual" && j.sourceId.startsWith("qbo:")));
  // Trial balance: kept as the figures to check, never a journal.
  assert.ok(plan.steps.every((s) => s.plan.journals.every((j) => j.source !== "opening")));
  assert.equal(plan.trialBalance?.asOf, "2026-02-28");
  assert.equal(plan.trialBalance?.rows.length, 8);
  assert.equal(plan.expectedCheck?.matches, true);
  assert.equal(plan.expectedCheck?.differences, 0);
  assert.equal(plan.expectedCheck?.plFrom, "2026-01-01"); // QuickBooks' layout: income and expenses of the financial year
  assert.equal(plan.expectedCheck?.qboDebit, 130_250_000.75);
  assert.equal(plan.expectedCheck?.appDebit, 130_250_000.75);
  // Documents: records only, nothing posted for them.
  assert.equal(inv.invoices.length, 1);
  assert.equal(inv.posting, undefined);
  assert.equal(inv.invoices[0].journalId, undefined);
  assert.deepEqual([inv.invoices[0].number, inv.invoices[0].status, inv.invoices[0].total, inv.invoices[0].customer.name], ["1002", "sent", 8_000_000, "PT Demo Villa"]);
  assert.equal(bill.bills.length, 1);
  assert.equal(bill.billPosting, undefined);
  // The General Ledger is recognised and left aside with the advice.
  assert.deepEqual(plan.notImported.map((n) => n.kind), ["general_ledger"]);
  assert.match(plan.notImported[0].reason, /export the Journal report instead/);
  const view = S.planView(plan);
  assert.equal(view.totalWrites, 4 + 3 + 9 + 2 + 1 + 1); // new accounts + mapped + entries + accounts from the journal + invoice + bill
  assert.equal(view.check?.matches, true);
});

test("accounts missing from the Account List are created from the journal with a guessed type and listed", async () => {
  const plan = await S.buildMigrationPlan(world(), tables(["accounts.csv", ACCOUNTS_GRID], ["journal.csv", JOURNAL_GRID]));
  const jrn = plan.steps.find((s) => s.key === "journal")!.plan;
  assert.deepEqual(jrn.guessedAccounts.map((g) => [g.qboName, g.name, g.type, g.subtype]), [["Old supplies expense (deleted)", "Old supplies expense", "expense", "opex"], ["Clearing 77", "Clearing 77", "asset", "other_asset"]]);
  assert.deepEqual(jrn.accounts.map((a) => a.code), jrn.guessedAccounts.map((g) => g.code));
  assert.ok(jrn.accounts.every((a) => /^\d-\d{4}$/.test(a.code)));
  assert.ok(jrn.warnings.some((w) => /created from the name with a guessed type/.test(w)));
  assert.equal(S.planView(plan).guessedAccounts.length, 2);
  assert.equal(S.planView(plan).guessedAccounts[0].fileName, "journal.csv");
  // No Account List at all: every account of the journal is created the same way, and the history still posts.
  const bare = await S.buildMigrationPlan(world(), tables(["journal.csv", JOURNAL_GRID]));
  const b = bare.steps[0].plan;
  assert.equal(b.journals.length, 9);
  assert.ok(b.guessedAccounts.some((g) => g.qboName === "Bank Demo IDR" && g.subtype === "bank"));
  // The single-file journal import keeps its strict behaviour: unmapped accounts reject their entries.
  const strict = await I.prepareImport("qbo_journal", tableFromGrid(JOURNAL_GRID), { dateFormat: "auto", postToLedger: false, fxRates: {} }, { entity: ENTITY, accounts: template(), entries: [] });
  assert.equal(strict.journals.length, 0);
  assert.equal(strict.accounts.length, 0);
  assert.ok(strict.errors.every((e) => /account not mapped/.test(e.message)));
});

test("plan with a Trial Balance only: one opening entry at its date, documents without posting, and the check passes", async () => {
  const plan = await S.buildMigrationPlan(world(), tables(["invoices.csv", OPEN_INVOICES_GRID], ["tb.csv", TB_GRID], ["accounts.csv", ACCOUNTS_GRID]));
  assert.equal(plan.rules.mode, "opening");
  assert.deepEqual(plan.steps.map((s) => s.key), ["accounts", "opening", "invoices"]);
  const opening = plan.steps[1].plan;
  assert.equal(opening.journals.length, 1);
  assert.deepEqual([opening.journals[0].source, opening.journals[0].date, opening.journals[0].sourceId], ["opening", "2026-02-28", "qbo:tb:2026-02-28"]);
  assert.equal(opening.journals[0].lines.length, 8);
  assert.equal(opening.journals[0].lines.reduce((s, l) => s + l.debit, 0), 130_250_000.75);
  assert.equal(opening.guessedAccounts.length, 2); // in the trial balance, not in the account list
  assert.equal(plan.steps[2].plan.posting, undefined);
  assert.equal(plan.expectedCheck?.matches, true);
  // Without its "As of" line the trial balance needs the date from the options.
  const undated = TB_GRID.filter((r) => r[0] !== "As of February 28, 2026");
  const missing = await S.buildMigrationPlan(world(), tables(["tb.csv", undated]));
  assert.match(missing.blocking ?? "", /cut-over date/);
  const dated = await S.buildMigrationPlan(world(), tables(["tb.csv", undated]), { dateFormat: "auto", fxRates: {}, asOf: "2026-02-28" });
  assert.equal(dated.blocking, undefined);
  assert.equal(dated.steps[0].plan.journals[0].date, "2026-02-28");
});

test("a later run never counts the ledger twice: a trial balance on a migrated ledger is only compared, a journal after opening balances only adds what follows", async () => {
  const posted = (date: string, source: JournalEntry["source"], sourceId: string): JournalEntry => ({ id: sourceId, entityId: ENTITY.id, number: "JE-0000-0001", date, period: date.slice(0, 7), memo: "earlier import", source, sourceId, lines: [], status: "posted", createdAt: "" });
  // The journal history is in the books: a trial balance alone is the check, never an opening entry on top.
  const onHistory = await S.buildMigrationPlan(world({ entries: [posted("2025-03-10", "manual", "qbo:Invoice:1001:2025-03-10")] }), tables(["tb.csv", TB_GRID]));
  assert.equal(onHistory.rules.mode, "check");
  assert.deepEqual(onHistory.steps, []);
  assert.equal(onHistory.trialBalance?.asOf, "2026-02-28");
  assert.ok(onHistory.expectedCheck);
  // Opening balances at another date are in the books: same thing.
  const opening = [posted("2025-12-31", "opening", "qbo:tb:2025-12-31")];
  assert.equal((await S.buildMigrationPlan(world({ entries: opening }), tables(["tb.csv", TB_GRID]))).rules.mode, "check");
  // The same trial balance again: recognised as already imported, nothing written, no account created for it.
  const same = await S.buildMigrationPlan(world({ entries: [posted("2026-02-28", "opening", "qbo:tb:2026-02-28")] }), tables(["tb.csv", TB_GRID]));
  assert.equal(same.rules.mode, "opening");
  assert.deepEqual([same.steps[0].plan.journals.length, same.steps[0].plan.accounts.length, same.steps[0].plan.duplicates.length], [0, 0, 1]);
  assert.equal(S.planView(same).totalWrites, 0);
  // A journal added after opening balances: what the balances already include is skipped.
  const after = await S.buildMigrationPlan(world({ entries: opening }), tables(["journal.csv", JOURNAL_GRID], ["accounts.csv", ACCOUNTS_GRID]));
  const jrn = after.steps.find((s) => s.key === "journal")!.plan;
  assert.deepEqual(jrn.journals.map((j) => j.date.slice(0, 4)), ["2026", "2026", "2026", "2026", "2026"]);
  assert.equal(jrn.skipped.filter((s) => /before 2026-01-01/.test(s.reason)).length, 4);
  assert.ok(after.warnings.some((w) => /already posted as of 2025-12-31/.test(w)));
  // A voided opening entry no longer counts.
  const voided = await S.buildMigrationPlan(world({ entries: [{ ...opening[0], status: "void" }] }), tables(["journal.csv", JOURNAL_GRID]));
  assert.equal(voided.steps[0].plan.journals.length, 9);
});

test("a client company's customers stay out of ILA's directory unless asked; ILA's own are imported", async () => {
  const files = () => tables(["customers.csv", CUSTOMERS_GRID], ["vendors.csv", VENDORS_GRID]);
  const client = await S.buildMigrationPlan(world(), files());
  assert.deepEqual(client.steps.map((s) => s.key), ["vendors"]);
  assert.equal(client.steps[0].plan.vendors.length, 3);
  assert.equal(client.steps[0].plan.vendors[2].active, false);
  assert.match(client.notImported[0].reason, /directory holds ILA's clients/);
  const asked = await S.buildMigrationPlan(world(), files(), { dateFormat: "auto", fxRates: {}, customersToDirectory: true });
  assert.deepEqual(asked.steps.map((s) => s.key), ["vendors", "customers"]);
  const own = await S.buildMigrationPlan(world({ entity: { ...ENTITY, isOwn: true } }), files());
  assert.deepEqual(own.steps.map((s) => s.key), ["vendors", "customers"]);
  assert.equal(own.steps[1].plan.companies[0].name, "PT Demo Villa");
});

// ---------- The check ----------

const acct = (id: string, code: string, name: string, type: Account["type"], subtype: Account["subtype"], extra: Partial<Account> = {}): Account => ({ id, entityId: "e", code, name, type, subtype, normalBalance: type === "asset" || type === "expense" ? "debit" : "credit", isSystem: false, active: true, ...extra });
const CHECK_ACCOUNTS = [
  acct("bank", "1-1100", "Bank", "asset", "bank"), acct("re", "3-2000", "Retained earnings", "equity", "retained_earnings", { taxTag: "retained_earnings" }),
  acct("cap", "3-1000", "Share capital", "equity", "share_capital"), acct("sales", "4-1000", "Sales", "revenue", "sales", { qboName: "Consulting income" }), acct("rent", "6-1100", "Rent", "expense", "opex"),
];
const je = (date: string, lines: Array<[string, number, number]>, status: JournalEntry["status"] = "posted") => ({ status, date, lines: lines.map(([accountId, debit, credit]) => ({ accountId, accountCode: "", debit, credit })) });
const CHECK_ENTRIES = [
  je("2025-01-05", [["bank", 1000, 0], ["cap", 0, 1000]]),
  je("2025-06-01", [["bank", 300.5, 0], ["sales", 0, 300.5]]),
  je("2025-09-01", [["rent", 100, 0], ["bank", 0, 100]]),
  je("2026-01-10", [["bank", 50.25, 0], ["sales", 0, 50.25]]),
  je("2026-01-11", [["bank", 999, 0], ["sales", 0, 999]], "void"),
  je("2026-03-01", [["bank", 7, 0], ["sales", 0, 7]]), // after the date
];

test("compareTrialBalance: equal figures give a green check, in QuickBooks' layout (year's income, earlier result in retained earnings)", () => {
  const qbo = [{ account: "Bank", debit: 1250.75, credit: 0 }, { account: "Share capital", debit: 0, credit: 1000 }, { account: "Retained Earnings", debit: 0, credit: 200.5 }, { account: "Consulting income", debit: 0, credit: 50.25 }];
  const check = compareTrialBalance({ rows: qbo, accounts: CHECK_ACCOUNTS, entries: CHECK_ENTRIES, asOf: "2026-02-28", plFrom: "2026-01-01" });
  assert.equal(check.matches, true);
  assert.equal(check.differences, 0);
  assert.equal(check.accounts, 4); // rent has no balance in 2026 on either side
  assert.deepEqual(check.rows.map((r) => [r.code, r.qbo, r.app, r.difference]), [["1-1100", 1250.75, 1250.75, 0], ["3-1000", -1000, -1000, 0], ["3-2000", -200.5, -200.5, 0], ["4-1000", -50.25, -50.25, 0]]);
  assert.deepEqual([check.qboDebit, check.qboCredit, check.appDebit, check.appCredit], [1250.75, 1250.75, 1250.75, 1250.75]);
  assert.deepEqual(check.rows[3].qboNames, ["Consulting income"]); // matched through the stored QuickBooks name
});

test("compareTrialBalance: differences are listed per account, unknown QuickBooks accounts included", () => {
  const qbo = [{ account: "Bank", debit: 1250.75, credit: 0 }, { account: "Share capital", debit: 0, credit: 900 }, { account: "Retained Earnings", debit: 0, credit: 200.5 }, { account: "Consulting income", debit: 0, credit: 50.25 }, { account: "Mystery reserve", debit: 0, credit: 100 }];
  const check = compareTrialBalance({ rows: qbo, accounts: CHECK_ACCOUNTS, entries: CHECK_ENTRIES, asOf: "2026-02-28", plFrom: "2026-01-01" });
  assert.equal(check.matches, false);
  assert.equal(check.differences, 2);
  const differing = check.rows.filter((r) => r.difference !== 0);
  assert.deepEqual(differing.map((r) => [r.name, r.qbo, r.app, r.difference, r.accountId]), [["Share capital", -900, -1000, -100, "cap"], ["Mystery reserve", -100, 0, 100, undefined]]);
  // Cents count: half a rupiah off is a difference.
  const cents = compareTrialBalance({ rows: [{ account: "Bank", debit: 1250.25, credit: 0 }], accounts: CHECK_ACCOUNTS, entries: CHECK_ENTRIES, asOf: "2026-02-28" });
  assert.equal(cents.rows.find((r) => r.code === "1-1100")!.difference, 0.5);
  // Nothing to compare is not a proof.
  assert.equal(compareTrialBalance({ rows: [], accounts: CHECK_ACCOUNTS, entries: [], asOf: "2026-02-28" }).matches, false);
});

test("the layout that fits is chosen: cumulative figures for a file exported that way, the financial year otherwise", () => {
  const cumulative = [{ account: "Bank", debit: 1250.75, credit: 0 }, { account: "Share capital", debit: 0, credit: 1000 }, { account: "Consulting income", debit: 0, credit: 350.75 }, { account: "Rent", debit: 100, credit: 0 }];
  const input = { accounts: CHECK_ACCOUNTS, entries: CHECK_ENTRIES, asOf: "2026-02-28" };
  assert.equal(compareTrialBalance({ ...input, rows: cumulative }).matches, true);
  assert.equal(compareTrialBalance({ ...input, rows: cumulative, plFrom: "2026-01-01" }).matches, false);
  const best = bestTrialBalanceCheck({ ...input, rows: cumulative }, ["2026-01-01", undefined]);
  assert.equal(best.matches, true);
  assert.equal(best.plFrom, undefined);
  const yearly = [{ account: "Bank", debit: 1250.75, credit: 0 }, { account: "Share capital", debit: 0, credit: 1000 }, { account: "Retained Earnings", debit: 0, credit: 200.5 }, { account: "Consulting income", debit: 0, credit: 50.25 }];
  assert.equal(bestTrialBalanceCheck({ ...input, rows: yearly }, ["2026-01-01", undefined]).plFrom, "2026-01-01");
});

// ---------- Uploads ----------

test("uploads: requests of at most 4 MB, oversized files left out; stored grids are compact and come back intact", () => {
  const MB = 1024 * 1024;
  assert.deepEqual(uploadBatches([3 * MB, 2 * MB, 1 * MB, 5 * MB, 0.5 * MB]), [[0], [1, 2, 4]]);
  assert.deepEqual(uploadBatches([]), []);
  assert.deepEqual(uploadBatches([QBO_MAX_FILE_BYTES, 1]), [[0], [1]]);
  const padded = JOURNAL_GRID.map((r) => [...r, "", "", ""]);
  const packed = S.packGrid(padded);
  assert.ok(packed.length < JSON.stringify(padded).length / 2);
  assert.deepEqual(S.unpackGrid(packed), JOURNAL_GRID.map((r) => { const c = [...r]; while (c.length && c[c.length - 1] === "") c.pop(); return c; }));
});

test("readUpload: an Excel workbook with title rows is recognised and described; too large, too long or not a spreadsheet is refused with advice", () => {
  const { file, grid } = S.readUpload("Journal.xlsx", xlsx(JOURNAL_GRID), [ENTITY.name]);
  assert.deepEqual([file.kind, file.detected, file.content, file.from, file.to, file.company, file.companyMismatch], ["journal", "journal", "9 transactions", "2025-01-05", "2026-02-28", COMPANY, false]);
  assert.equal(file.rows, tableFromGrid(grid).rows.length);
  const tb = S.readUpload("TB.xlsx", xlsx(TB_GRID), ["Another Company"]).file;
  assert.deepEqual([tb.kind, tb.content, tb.to, tb.companyMismatch], ["trial_balance", "8 accounts", "2026-02-28", true]);
  assert.equal(S.readUpload("inv.csv", Buffer.from(gridToCSV(OPEN_INVOICES_GRID))).file.content, "1 invoice, 1 open");
  assert.throws(() => S.readUpload("big.xlsx", Buffer.alloc(QBO_MAX_FILE_BYTES + 1)), /larger than 4 MB: in QuickBooks export one year at a time/);
  assert.throws(() => S.readUpload("statement.pdf", Buffer.from("%PDF-1.7")), /only \.xlsx, \.xls and \.csv/);
  const long = `Date,Num,Customer,Amount\n${"2026-01-01,1,Demo,1\n".repeat(60_000)}`;
  assert.throws(() => S.readUpload("long.csv", Buffer.from(long)), /60,000 rows or more/);
});

// ---------- Bulk posting (file backend) ----------

const line = (accountId: string, debit: number, credit: number) => ({ accountId, accountCode: "x", debit, credit });
const entry = (date: string, amount: number, extra: Partial<import("../lib/posting").PostJournalInput> = {}): import("../lib/posting").PostJournalInput => ({ date, memo: `Entry ${date}`, source: "manual", lines: [line("a1", amount, 0), line("a2", 0, amount)], ...extra });

test("postJournalsBulk: validates every entry, refuses locked periods, numbers per year in input order, keeps cents", async () => {
  const E = "ent-bulk";
  await D.db.upsert("periods", { id: `${E}:2026-03`, entityId: E, period: "2026-03", locked: true });
  const inputs = [
    entry("2025-12-31", 100, { sourceId: "s0" }),
    entry("2026-01-05", 200),
    { ...entry("2026-01-06", 300), lines: [line("a1", 300, 0), line("a2", 0, 299)] }, // unbalanced
    { ...entry("2026-01-07", 400), lines: [line("a1", 400, 0)] }, // one line
    entry("2026-03-10", 500), // locked period
    entry("2026-02-01", 1234.56),
    entry("01/02/2026", 600), // not an ISO date
    { ...entry("2026-02-02", 700), lines: [line("a1", 700, 0), line("a2", 0, 700), line("a3", 0, 0)] }, // empty line dropped
  ];
  const r = await P.postJournalsBulk(E, inputs, { createdByUserId: "u1" });
  assert.equal(r.posted, 4);
  assert.deepEqual(r.errors.map((e) => e.index), [2, 3, 4, 6]);
  assert.match(r.errors[0].message, /do not balance/);
  assert.match(r.errors[1].message, /at least two lines/);
  assert.equal(r.errors[2].message, "Period 2026-03 is locked for this entity.");
  assert.match(r.errors[3].message, /Date is required/);
  const stored = (await D.db.list("journal_entries", { where: { entityId: E } })).sort((a, b) => a.number.localeCompare(b.number));
  assert.deepEqual(stored.map((e) => [e.number, e.date, e.period, e.status, e.createdByUserId]), [
    ["JE-2025-0001", "2025-12-31", "2025-12", "posted", "u1"], ["JE-2026-0001", "2026-01-05", "2026-01", "posted", "u1"],
    ["JE-2026-0002", "2026-02-01", "2026-02", "posted", "u1"], ["JE-2026-0003", "2026-02-02", "2026-02", "posted", "u1"],
  ]);
  assert.equal(stored[0].sourceId, "s0");
  assert.deepEqual(stored[2].lines.map((l) => [l.debit, l.credit]), [[1234.56, 0], [0, 1234.56]]);
  assert.equal(stored[3].lines.length, 2);
  assert.ok(stored.every((e) => e.postedAt && e.id));
  // The counter is the one postJournal uses: single and bulk postings interleave without gaps or repeats.
  assert.equal((await P.postJournal(E, entry("2026-02-03", 5))).number, "JE-2026-0004");
  const again = await P.postJournalsBulk(E, [entry("2026-02-04", 6), entry("2025-11-30", 7)]);
  assert.deepEqual(again, { posted: 2, errors: [] });
  assert.equal((await P.postJournal(E, entry("2026-02-05", 8))).number, "JE-2026-0006");
  assert.equal((await P.postJournal(E, entry("2025-12-01", 9))).number, "JE-2025-0003");
  assert.deepEqual(await P.postJournalsBulk(E, []), { posted: 0, errors: [] });
});

test("postJournalsBulk: more than one chunk, one counter update per year, every number used once", async () => {
  const E = "ent-chunks";
  const inputs = Array.from({ length: 1203 }, (_, i) => entry(i < 700 ? "2024-05-01" : "2025-05-01", i + 1));
  const r = await P.postJournalsBulk(E, inputs);
  assert.deepEqual(r, { posted: 1203, errors: [] });
  const stored = await D.db.list("journal_entries", { where: { entityId: E } });
  assert.equal(stored.length, 1203);
  assert.equal(new Set(stored.map((e) => e.number)).size, 1203);
  assert.equal(stored.filter((e) => e.number.startsWith("JE-2024-")).length, 700);
  assert.ok(stored.some((e) => e.number === "JE-2024-0700") && stored.some((e) => e.number === "JE-2025-0503"));
  assert.deepEqual((await D.db.list("counters")).filter((c) => c.id.startsWith(`${E}:`)).map((c) => [c.id, c.value]).sort(), [[`${E}:JE:2024`, 700], [`${E}:JE:2025`, 503]]);
  assert.equal(await D.db.reserveNumbers(E, "JE", 2024, 0).then((n) => n.length), 0);
  assert.deepEqual(await D.db.reserveNumbers(E, "JE", 2024, 2), ["JE-2024-0701", "JE-2024-0702"]);
});

// ---------- One full migration on the file backend ----------

test("full run: upload, import, proof; a second run adds nothing; a later year only adds what is missing", async () => {
  const { db } = D;
  await db.insert("entities", ENTITY);
  await db.insertMany("accounts", buildAccounts(ENTITY.id, () => db.newId()));
  const user = { id: "user-1", name: "Tester" };
  const target = `entity:${ENTITY.id}`;
  const upload = async (files: Array<[string, Buffer]>) => { for (const [name, bytes] of files) await S.addWizardFile(user.id, target, name, bytes, [ENTITY.name, ENTITY.legalName]); };
  const FIRST: Array<[string, Buffer]> = [
    ["Journal 2025.xlsx", xlsx(journalGrid(Y2025, "January - December 2025"))], ["Account List.xlsx", xlsx(ACCOUNTS_GRID)], ["Open Invoices.xlsx", xlsx(OPEN_INVOICES_GRID)],
  ];

  // Run 1: the chart, the 2025 history and the open invoice. No trial balance yet: in progress, not checked.
  await upload(FIRST);
  await upload([FIRST[0]]); // the same file dropped twice is kept once
  await upload([["Journal 2025.xlsx", xlsx(GL_GRID)]]); // another file under the same name is kept beside it
  const pending = await S.loadWizard(user.id, target);
  assert.deepEqual(pending.files.map((f) => f.kind).sort(), ["accounts", "general_ledger", "invoices", "journal"]);
  assert.deepEqual((await S.removeWizardFile(user.id, target, pending.files.find((f) => f.kind === "general_ledger")!.id)).files.map((f) => f.kind).sort(), ["accounts", "invoices", "journal"]);
  // A wrong detection can be overridden, and put back.
  const invoiceFile = pending.files.find((f) => f.kind === "invoices")!;
  assert.equal((await S.setWizardFileKind(user.id, target, invoiceFile.id, "bills")).files.find((f) => f.id === invoiceFile.id)!.content, "0 bills, 0 open");
  assert.equal((await S.setWizardFileKind(user.id, target, invoiceFile.id, "invoices")).files.find((f) => f.id === invoiceFile.id)!.content, "1 invoice, 1 open");
  assert.deepEqual((await S.loadWizard(user.id, target)).files.map((f) => f.kind).sort(), ["accounts", "invoices", "journal"]);
  const one = await S.runMigration(user, target, ENTITY);
  assert.equal(one.failed, false);
  assert.deepEqual(one.steps.map((s) => [s.key, s.inserted, s.errorCount]), [["accounts", 4, 0], ["journal", 4, 0], ["invoices", 1, 0]]);
  assert.equal(one.check, undefined);
  assert.equal(one.migration.status, "in_progress");
  assert.deepEqual((await S.loadWizard(user.id, target)).files, []); // uploads deleted after the import
  const where = { entityId: ENTITY.id };
  assert.deepEqual((await db.list("journal_entries", { where })).map((e) => e.number).sort(), ["JE-2025-0001", "JE-2025-0002", "JE-2025-0003", "JE-2025-0004"]);
  assert.equal((await db.list("accounts", { where })).find((a) => a.code === "1-1200")!.qboName, "Accounts Receivable (A/R)");
  const invoice = (await db.list("invoices", { where }))[0];
  assert.deepEqual([invoice.number, invoice.journalId, invoice.status], ["1002", undefined, "sent"]);

  // Run 2: the same files again. Everything is recognised, nothing is written.
  await upload(FIRST);
  const two = await S.runMigration(user, target, ENTITY);
  assert.deepEqual(two.steps.map((s) => s.inserted), [0, 0, 0]);
  assert.equal((await db.list("journal_entries", { where })).length, 4);
  assert.equal((await db.list("invoices", { where })).length, 1);
  assert.equal((await db.list("accounts", { where })).length, buildAccounts("x", () => "y").length + 4);

  // Run 3: the whole journal (2025 again + 2026), the bills and the trial balance: only 2026 is added, then the proof.
  await upload([["Journal all dates.xlsx", xlsx(JOURNAL_GRID)], ["Unpaid Bills.xlsx", xlsx(UNPAID_BILLS_GRID)], ["Trial Balance.xlsx", xlsx(TB_GRID)]]);
  const preview = S.planView(await S.buildMigrationPlan(await S.loadMigrationWorld(ENTITY), await S.loadWizardTables(user.id, await S.loadWizard(user.id, target))));
  assert.deepEqual(preview.steps.map((s) => [s.key, s.duplicates]), [["journal", 4], ["bills", 0]]);
  assert.equal(preview.check?.matches, true); // the dry run already says so
  const three = await S.runMigration(user, target, ENTITY);
  assert.deepEqual(three.steps.map((s) => [s.key, s.inserted, s.skipped]), [["journal", 7, 5], ["bills", 1, 1]]); // 5 entries + 2 accounts created from the journal; 4 entries already there + the report's total lines
  assert.equal(three.check?.matches, true);
  assert.equal(three.check?.differences, 0);
  assert.equal(three.migration.status, "checked_ok");
  assert.deepEqual(three.migration.counts, { accountsCreated: 6, accountsMapped: 3, journalEntries: 9, openingEntries: 0, invoices: 1, bills: 1, vendors: 0, customers: 0 });
  assert.deepEqual(three.migration.lastCheck && [three.migration.lastCheck.asOf, three.migration.lastCheck.plFrom, three.migration.lastCheck.differences, three.migration.lastCheck.qboDebit, three.migration.lastCheck.appDebit], ["2026-02-28", "2026-01-01", 0, 130_250_000.75, 130_250_000.75]);
  assert.equal(three.migration.files.length, 3 + 3 + 2 + 1); // every import, then the trial balance as the check
  assert.deepEqual(three.migration.files.at(-1) && [three.migration.files.at(-1)!.name, three.migration.files.at(-1)!.byName], ["Trial Balance.xlsx", "Tester"]);
  const entries = await db.list("journal_entries", { where });
  assert.equal(entries.length, 9);
  assert.deepEqual(entries.filter((e) => e.date.startsWith("2026")).map((e) => e.number).sort(), ["JE-2026-0001", "JE-2026-0002", "JE-2026-0003", "JE-2026-0004", "JE-2026-0005"]);
  assert.ok(entries.every((e) => e.status === "posted" && e.createdByUserId === user.id));
  assert.equal((await db.list("import_batches", { where })).length, 3 + 3 + 2);

  // Later: someone posts in the books before the trial balance date; the check on demand shows the difference.
  const accounts = await db.list("accounts", { where });
  const bank = accounts.find((a) => a.qboName === "Bank Demo IDR")!, rent = accounts.find((a) => a.qboName === "Rent expense")!;
  await P.postJournal(ENTITY.id, { date: "2026-02-10", memo: "Rent February", source: "manual", lines: [{ accountId: rent.id, accountCode: rent.code, debit: 1_000_000, credit: 0 }, { accountId: bank.id, accountCode: bank.code, debit: 0, credit: 1_000_000 }] });
  const later = await S.checkMigration(ENTITY, user.id);
  assert.equal(later?.check.matches, false);
  assert.deepEqual(later?.check.rows.filter((r) => r.difference !== 0).map((r) => [r.name, r.difference]), [["Bank Demo IDR", -1_000_000], ["Rent expense", 1_000_000]]);
  assert.equal((await S.loadMigration(ENTITY.id))?.status, "differences");
  assert.equal((await S.loadMigrations([ENTITY.id, "none"])).size, 1);

  // A trial balance dropped alone on the migrated ledger is compared, never posted as opening balances on top.
  await upload([["Trial Balance.xlsx", xlsx(TB_GRID)]]);
  const four = await S.runMigration(user, target, ENTITY);
  assert.deepEqual(four.steps, []);
  assert.equal(four.check?.differences, 2);
  const after = await db.list("journal_entries", { where });
  assert.equal(after.length, 10);
  assert.equal(after.filter((e) => e.source === "opening").length, 0);
  assert.deepEqual((await S.loadWizard(user.id, target)).files, []);
  assert.equal(await S.checkMigration({ ...ENTITY, id: "never-migrated" }), null);
});
