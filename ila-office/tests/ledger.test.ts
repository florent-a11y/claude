import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccounts } from "../lib/coa";
import { findByCode, findByTag, validateLines, accountBalances, naturalBalance } from "../lib/balances";
import {
  invoiceTotals, billTotals, invoiceJournalLines, billJournalLines, receiptJournalLines, disbursementJournalLines, transferJournalLines,
  depreciationJournalLines, depreciationSchedule, depreciationDue, trialBalance, profitAndLoss, balanceSheet, generalLedger, arAging, apAging,
  agingBucket, docDisplayStatus, fiscalYearStartOf, bankJournalLines, disposalJournalLines,
} from "../lib/ledger";
import type { Account, Bill, FixedAsset, Invoice, JournalEntry, JournalLine } from "../lib/types";

let seq = 0;
const newId = () => `id-${++seq}`;
const ENTITY = "ent-1";
const accounts: Account[] = buildAccounts(ENTITY, newId);
const code = (c: string) => findByCode(accounts, c)!;
const tag = (t: Account["taxTag"]) => findByTag(accounts, t)!;

function entry(date: string, lines: JournalLine[], status: JournalEntry["status"] = "posted"): JournalEntry {
  return { id: newId(), entityId: ENTITY, number: `JE-${seq}`, date, period: date.slice(0, 7), memo: "test", source: "manual", lines, status, createdAt: date };
}
const dr = (a: Account, amt: number): JournalLine => ({ accountId: a.id, accountCode: a.code, debit: amt, credit: 0 });
const cr = (a: Account, amt: number): JournalLine => ({ accountId: a.id, accountCode: a.code, debit: 0, credit: amt });
const sumD = (ls: JournalLine[]) => ls.reduce((s, l) => s + l.debit, 0);
const sumC = (ls: JournalLine[]) => ls.reduce((s, l) => s + l.credit, 0);
const on = (ls: JournalLine[], a: Account) => ls.filter((l) => l.accountId === a.id);

function makeInvoice(over: Partial<Invoice> = {}, pkp = false): Invoice {
  const lines = over.lines ?? [{ id: "l1", description: "Monthly bookkeeping", qty: 1, unitPrice: 1_000_000, amount: 1_000_000, accountId: tag("sales_default").id, taxCode: pkp ? "ppn" : "out_of_scope" }];
  const t = invoiceTotals(lines, { pkp, ppnRate: 0.11, discount: over.discount ?? 0, currency: over.currency ?? "IDR" });
  return {
    id: "inv-1", entityId: ENTITY, number: "INV-2026-0001", customer: { type: "company", id: "c1", name: "PT Demo Villa" }, date: "2026-03-10", dueDate: "2026-03-13",
    currency: "IDR", fxRate: 1, lines, subtotal: t.subtotal, discount: t.discount, ppnAmount: t.ppnAmount, total: t.total, amountPaid: 0, status: "draft", createdAt: "2026-03-10",
    ...over,
  };
}

test("invoice totals: PPN only when PKP and line taxCode is ppn; discount reduces the base", () => {
  const lines = [{ qty: 2, unitPrice: 500_000, taxCode: "ppn" as const }, { qty: 1, unitPrice: 300_000, taxCode: "out_of_scope" as const }];
  const noPkp = invoiceTotals(lines, { pkp: false, ppnRate: 0.11 });
  assert.equal(noPkp.subtotal, 1_300_000);
  assert.equal(noPkp.ppnAmount, 0);
  assert.equal(noPkp.total, 1_300_000);
  const pkp = invoiceTotals(lines, { pkp: true, ppnRate: 0.11 });
  assert.equal(pkp.ppnAmount, 110_000);
  assert.equal(pkp.total, 1_410_000);
  const disc = invoiceTotals(lines, { pkp: true, ppnRate: 0.11, discount: 130_000 });
  assert.equal(disc.taxableBase, 900_000); // 1,000,000 × (1 − 10%)
  assert.equal(disc.ppnAmount, 99_000);
  assert.equal(disc.total, 1_300_000 - 130_000 + 99_000);
  const usd = invoiceTotals([{ qty: 3, unitPrice: 33.333, taxCode: "none" }], { pkp: false, ppnRate: 0.11, currency: "USD" });
  assert.equal(usd.subtotal, 100);
});

test("invoice posting without PPN: Dr AR / Cr revenue, balanced", () => {
  const inv = makeInvoice();
  const lines = invoiceJournalLines(inv, accounts);
  assert.equal(validateLines(lines), null);
  assert.equal(on(lines, tag("ar_trade"))[0].debit, 1_000_000);
  assert.equal(on(lines, tag("sales_default"))[0].credit, 1_000_000);
  assert.equal(on(lines, tag("ppn_output")).length, 0);
});

test("invoice posting with PPN 11% credits VAT output", () => {
  const inv = makeInvoice({}, true);
  assert.equal(inv.ppnAmount, 110_000);
  const lines = invoiceJournalLines(inv, accounts);
  assert.equal(validateLines(lines), null);
  assert.equal(on(lines, tag("ar_trade"))[0].debit, 1_110_000);
  assert.equal(on(lines, tag("ppn_output"))[0].credit, 110_000);
  assert.equal(sumD(lines), sumC(lines));
});

test("USD invoice posts in IDR at the document rate and absorbs rounding", () => {
  const lines = [
    { id: "a", description: "Advisory", qty: 1, unitPrice: 333.33, amount: 333.33, accountId: tag("sales_default").id, taxCode: "none" as const },
    { id: "b", description: "Filing", qty: 1, unitPrice: 333.33, amount: 333.33, accountId: code("4-1300").id, taxCode: "none" as const },
    { id: "c", description: "Other", qty: 1, unitPrice: 333.34, amount: 333.34, accountId: code("4-1300").id, taxCode: "none" as const },
  ];
  const inv = makeInvoice({ currency: "USD", fxRate: 16_333.33, lines });
  assert.equal(inv.total, 1000);
  const jls = invoiceJournalLines(inv, accounts);
  assert.equal(validateLines(jls), null);
  assert.equal(on(jls, tag("ar_trade"))[0].debit, 16_333_330);
  assert.equal(on(jls, tag("ar_trade"))[0].fxAmount, 1000);
  assert.equal(on(jls, tag("ar_trade"))[0].currency, "USD");
});

test("bill with PPh 23 withholding: expense gross, AP net of withholding, PPh 23 payable", () => {
  const t = billTotals([{ amount: 10_000_000, taxCode: "none", withholding: "pph23" }], { ppnRate: 0.11 });
  assert.equal(t.lines[0].withholdingRate, 0.02);
  assert.equal(t.withholdingTotal, 200_000);
  assert.equal(t.amountPayable, 9_800_000);
  const bill: Bill = {
    id: "b1", entityId: ENTITY, number: "BILL-2026-0001", vendor: { type: "vendor", name: "Notary Agung" }, date: "2026-03-05", dueDate: "2026-03-20", currency: "IDR", fxRate: 1,
    lines: [{ id: "l1", description: "Notary services", amount: 10_000_000, accountId: code("6-1300").id, taxCode: "none", withholding: "pph23", withholdingRate: 0.02, withholdingAmount: 200_000 }],
    subtotal: t.subtotal, ppnInput: t.ppnInput, withholdingTotal: t.withholdingTotal, total: t.total, amountPayable: t.amountPayable, amountPaid: 0, status: "draft", createdAt: "2026-03-05",
  };
  const lines = billJournalLines(bill, accounts, { ppnCreditable: false });
  assert.equal(validateLines(lines), null);
  assert.equal(on(lines, code("6-1300"))[0].debit, 10_000_000);
  assert.equal(on(lines, tag("pph23_payable"))[0].credit, 200_000);
  assert.equal(on(lines, tag("ap_trade"))[0].credit, 9_800_000);
});

test("bill with vendor PPN: creditable → VAT input asset; not creditable → expensed", () => {
  const t = billTotals([{ amount: 1_000_000, taxCode: "ppn", withholding: "none" }, { amount: 500_000, taxCode: "none", withholding: "pph4_2" }], { ppnRate: 0.11 });
  assert.equal(t.ppnInput, 110_000);
  assert.equal(t.withholdingTotal, 50_000);
  assert.equal(t.total, 1_610_000);
  assert.equal(t.amountPayable, 1_560_000);
  const bill: Bill = {
    id: "b2", entityId: ENTITY, number: "BILL-2026-0002", vendor: { type: "other", name: "Landlord" }, date: "2026-03-05", dueDate: "2026-03-20", currency: "IDR", fxRate: 1,
    lines: [
      { id: "l1", description: "Software", amount: 1_000_000, accountId: code("6-1700").id, taxCode: "ppn", withholding: "none" },
      { id: "l2", description: "Rent", amount: 500_000, accountId: code("6-1100").id, taxCode: "none", withholding: "pph4_2", withholdingRate: 0.1, withholdingAmount: 50_000 },
    ],
    subtotal: t.subtotal, ppnInput: t.ppnInput, withholdingTotal: t.withholdingTotal, total: t.total, amountPayable: t.amountPayable, amountPaid: 0, status: "draft", createdAt: "2026-03-05",
  };
  const creditable = billJournalLines(bill, accounts, { ppnCreditable: true });
  assert.equal(validateLines(creditable), null);
  assert.equal(on(creditable, tag("ppn_input"))[0].debit, 110_000);
  assert.equal(on(creditable, code("6-1700"))[0].debit, 1_000_000);
  assert.equal(on(creditable, tag("pph4_2_payable"))[0].credit, 50_000);
  assert.equal(on(creditable, tag("ap_trade"))[0].credit, 1_560_000);
  const expensed = billJournalLines(bill, accounts, { ppnCreditable: false });
  assert.equal(validateLines(expensed), null);
  assert.equal(on(expensed, tag("ppn_input")).length, 0);
  assert.equal(on(expensed, code("6-1700"))[0].debit, 1_110_000);
});

test("receipt on a USD invoice books an FX gain when the rate rises, loss when it falls", () => {
  const inv = makeInvoice({ currency: "USD", fxRate: 16_000, lines: [{ id: "l", description: "Fee", qty: 1, unitPrice: 1000, amount: 1000, accountId: tag("sales_default").id, taxCode: "none" }] });
  const bank = code("1-1110");
  const gain = receiptJournalLines({ invoice: inv, amount: 1000, fxRate: 16_500, bankAccount: bank, accounts });
  assert.equal(validateLines(gain), null);
  assert.equal(on(gain, bank)[0].debit, 16_500_000);
  assert.equal(on(gain, tag("ar_trade"))[0].credit, 16_000_000);
  assert.equal(on(gain, tag("fx_gain"))[0].credit, 500_000);
  const loss = receiptJournalLines({ invoice: inv, amount: 400, fxRate: 15_800, bankAccount: bank, accounts });
  assert.equal(validateLines(loss), null);
  assert.equal(on(loss, tag("fx_loss"))[0].debit, 80_000);
  assert.equal(on(loss, tag("ar_trade"))[0].credit, 6_400_000);
  const idr = receiptJournalLines({ invoice: makeInvoice(), amount: 400_000, fxRate: 1, bankAccount: code("1-1100"), accounts });
  assert.equal(idr.length, 2);
  assert.equal(idr[0].currency, undefined);
});

test("disbursement, transfer and bank quick journals balance", () => {
  const bill = { number: "BILL-2026-0003", currency: "USD", fxRate: 16_000, vendor: { type: "other" as const, name: "AWS" } };
  const d = disbursementJournalLines({ bill, amount: 100, fxRate: 16_200, bankAccount: code("1-1100"), accounts });
  assert.equal(validateLines(d), null);
  assert.equal(on(d, tag("ap_trade"))[0].debit, 1_600_000);
  assert.equal(on(d, code("1-1100"))[0].credit, 1_620_000);
  assert.equal(on(d, tag("fx_loss"))[0].debit, 20_000);
  const t = transferJournalLines({ from: code("1-1100"), to: code("1-1110"), amountIDR: 16_050_000, toAmountIDR: 16_000_000, feeIDR: 25_000, feeAccount: code("6-2000"), accounts });
  assert.equal(validateLines(t), null);
  assert.equal(on(t, code("6-2000"))[0].debit, 25_000);
  assert.equal(on(t, tag("fx_loss"))[0].debit, 25_000);
  const charge = bankJournalLines({ bankAccount: code("1-1100"), counterAccount: code("6-2000"), amountIDR: -15_000, description: "Admin fee" });
  assert.equal(validateLines(charge), null);
  assert.equal(charge[0].accountId, code("6-2000").id);
  assert.equal(charge[1].credit, 15_000);
});

const assetBase: FixedAsset = {
  id: "fa1", entityId: ENTITY, name: "MacBook", assetAccountId: code("1-2300").id, accumDeprAccountId: code("1-2310").id, deprExpenseAccountId: code("6-2100").id,
  acquisitionDate: "2026-01-15", cost: 48_000_000, salvageValue: 0, fiscalGroup: "group1", method: "straight_line", usefulLifeMonths: 48, accumulatedDepreciation: 0, status: "active", createdAt: "2026-01-15",
};

test("straight-line schedule: group I asset over 48 months, 1,000,000 per month, ends at salvage", () => {
  const rows = depreciationSchedule(assetBase);
  assert.equal(rows.length, 48);
  assert.equal(rows[0].period, "2026-01");
  assert.equal(rows[0].amount, 1_000_000);
  assert.equal(rows[47].period, "2029-12");
  assert.equal(rows[47].accumulated, 48_000_000);
  assert.equal(rows[47].nbv, 0);
  const odd = depreciationSchedule({ ...assetBase, cost: 10_000_000, salvageValue: 1_000_000, usefulLifeMonths: 36 });
  assert.equal(odd.length, 36);
  assert.equal(odd[35].accumulated, 9_000_000);
  assert.equal(odd[35].nbv, 1_000_000);
  assert.equal(odd.reduce((s, r) => s + r.amount, 0), 9_000_000);
});

test("declining-balance schedule: 50% of opening NBV per fiscal year, remainder written off in the last year", () => {
  const rows = depreciationSchedule({ ...assetBase, method: "declining_balance" });
  assert.equal(rows.length, 48);
  assert.equal(rows[0].amount, 2_000_000); // 48M × 50% / 12
  assert.equal(rows[11].accumulated, 24_000_000);
  assert.equal(rows[12].amount, 1_000_000); // 24M × 50% / 12
  assert.equal(rows[23].accumulated, 36_000_000);
  assert.equal(rows[24].amount, 500_000);
  assert.equal(rows[36].amount, 500_000); // final year: 6M remaining / 12
  assert.equal(rows[47].accumulated, 48_000_000);
  // Mid-year acquisition: first fiscal year pro rata, final year spreads the remainder over the months left.
  const mid = depreciationSchedule({ ...assetBase, method: "declining_balance", acquisitionDate: "2026-07-01" });
  assert.equal(mid.length, 48);
  assert.equal(mid[5].accumulated, 12_000_000);
  assert.equal(mid[6].amount, 1_500_000); // (48M − 12M) × 50% / 12
  assert.equal(mid[47].period, "2030-06");
  assert.equal(mid[47].accumulated, 48_000_000);
  assert.equal(depreciationSchedule({ ...assetBase, fiscalGroup: "land", usefulLifeMonths: 0 }).length, 0);
});

test("depreciation due catches up unposted months and is idempotent", () => {
  const due = depreciationDue({ ...assetBase, depreciatedThrough: "2026-02" }, "2026-05");
  assert.deepEqual(due.periods, ["2026-03", "2026-04", "2026-05"]);
  assert.equal(due.amount, 3_000_000);
  assert.equal(depreciationDue({ ...assetBase, depreciatedThrough: "2026-05" }, "2026-05").amount, 0);
  assert.equal(depreciationDue({ ...assetBase, status: "disposed" }, "2026-05").amount, 0);
  const jl = depreciationJournalLines([{ asset: assetBase, amount: due.amount }], accounts);
  assert.equal(validateLines(jl), null);
  assert.equal(jl[0].accountId, code("6-2100").id);
  assert.equal(jl[1].credit, 3_000_000);
  const disposal = disposalJournalLines({ asset: { ...assetBase, accumulatedDepreciation: 30_000_000 }, proceedsIDR: 20_000_000, proceedsAccount: code("1-1100"), gainAccount: code("7-1200"), lossAccount: code("8-1200"), accounts });
  assert.equal(validateLines(disposal), null);
  assert.equal(on(disposal, code("7-1200"))[0].credit, 2_000_000);
});

function sampleLedger(): JournalEntry[] {
  const bank = code("1-1100"), ar = tag("ar_trade"), sales = tag("sales_default"), rent = code("6-1100"), capital = code("3-1000"), ap = tag("ap_trade");
  return [
    entry("2025-01-05", [dr(bank, 100_000_000), cr(capital, 100_000_000)]),
    entry("2025-06-30", [dr(ar, 30_000_000), cr(sales, 30_000_000)]),
    entry("2025-07-15", [dr(bank, 30_000_000), cr(ar, 30_000_000)]),
    entry("2025-12-01", [dr(rent, 12_000_000), cr(ap, 12_000_000)]), // prior-year profit 18M
    entry("2026-02-10", [dr(ar, 20_000_000), cr(sales, 20_000_000)]),
    entry("2026-03-01", [dr(rent, 5_000_000), cr(bank, 5_000_000)]),
    entry("2026-03-15", [dr(rent, 999_000_000), cr(bank, 999_000_000)], "void"),
  ];
}

test("trial balance: debits equal credits, void entries ignored", () => {
  const tb = trialBalance(accounts, sampleLedger(), "2026-03-31");
  assert.ok(tb.balanced);
  assert.equal(tb.totalDebit, tb.totalCredit);
  const bankRow = tb.rows.find((r) => r.account.code === "1-1100")!;
  assert.equal(bankRow.debit, 125_000_000);
  assert.ok(!tb.rows.some((r) => r.debit === 999_000_000));
  const early = trialBalance(accounts, sampleLedger(), "2025-01-31");
  assert.equal(early.rows.length, 2);
});

test("P&L for a range and balance sheet with current-year earnings balance", () => {
  const entries = sampleLedger();
  const pl2026 = profitAndLoss(accounts, entries, { from: "2026-01-01", to: "2026-12-31" });
  assert.equal(pl2026.revenue, 20_000_000);
  assert.equal(pl2026.opex, 5_000_000);
  assert.equal(pl2026.netProfit, 15_000_000);
  const pl2025 = profitAndLoss(accounts, entries, { from: "2025-01-01", to: "2025-12-31" });
  assert.equal(pl2025.netProfit, 18_000_000);
  const bs = balanceSheet(accounts, entries, "2026-03-31", 1);
  assert.equal(bs.fiscalYearStart, "2026-01-01");
  assert.equal(bs.retainedEarnings, 18_000_000);
  assert.equal(bs.currentYearEarnings, 15_000_000);
  assert.equal(bs.totalAssets, 145_000_000); // bank 125M + AR 20M
  assert.equal(bs.totalLiabilities, 12_000_000);
  assert.equal(bs.totalEquity, 133_000_000); // capital 100M + RE 18M + CYE 15M
  assert.ok(bs.balanced);
  assert.equal(bs.totalAssets, bs.totalLiabilities + bs.totalEquity);
  // Fiscal year starting in July: 2025-07..2026-06 is the current year.
  const bsJuly = balanceSheet(accounts, entries, "2026-03-31", 7);
  assert.equal(bsJuly.fiscalYearStart, "2025-07-01");
  assert.equal(bsJuly.retainedEarnings, 30_000_000);
  assert.equal(bsJuly.currentYearEarnings, 3_000_000);
  assert.ok(bsJuly.balanced);
  assert.equal(fiscalYearStartOf("2026-03-31", 4), "2025-04-01");
});

test("general ledger carries an opening balance and a running balance", () => {
  const gl = generalLedger(code("1-1100"), sampleLedger(), { from: "2026-01-01", to: "2026-12-31" });
  assert.equal(gl.opening, 130_000_000);
  assert.equal(gl.rows.length, 1);
  assert.equal(gl.rows[0].credit, 5_000_000);
  assert.equal(gl.rows[0].balance, 125_000_000);
  assert.equal(gl.closing, 125_000_000);
  const apGl = generalLedger(tag("ap_trade"), sampleLedger());
  assert.equal(apGl.opening, 0);
  assert.equal(apGl.closing, 12_000_000); // natural sign for a credit account
  const bal = accountBalances(sampleLedger());
  assert.equal(naturalBalance(tag("ap_trade"), bal.get(tag("ap_trade").id)), 12_000_000);
});

test("AR aging buckets open invoices by days past due in IDR", () => {
  const base = makeInvoice({ status: "sent" });
  const invoices: Invoice[] = [
    { ...base, id: "i1", number: "INV-1", dueDate: "2026-04-10" }, // not yet due
    { ...base, id: "i2", number: "INV-2", dueDate: "2026-03-20" }, // 11 days
    { ...base, id: "i3", number: "INV-3", dueDate: "2026-01-15", status: "partial", amountPaid: 400_000 }, // 75 days, 600k left
    { ...base, id: "i4", number: "INV-4", dueDate: "2025-10-01", currency: "USD", fxRate: 16_000, total: 100, customer: { type: "other", name: "Alice" } }, // 182 days
    { ...base, id: "i5", number: "INV-5", status: "paid", amountPaid: 1_000_000 },
    { ...base, id: "i6", number: "INV-6", status: "draft" },
  ];
  const r = arAging(invoices, "2026-03-31");
  assert.equal(r.rows.length, 4);
  assert.equal(r.totals.current, 1_000_000);
  assert.equal(r.totals["1-30"], 1_000_000);
  assert.equal(r.totals["61-90"], 600_000);
  assert.equal(r.totals["90+"], 1_600_000);
  assert.equal(r.total, 4_200_000);
  assert.equal(r.groups[0].name, "PT Demo Villa");
  assert.equal(r.groups[0].total, 2_600_000);
  assert.equal(agingBucket(0), "current");
  assert.equal(agingBucket(30), "1-30");
  assert.equal(agingBucket(31), "31-60");
  assert.equal(agingBucket(91), "90+");
  assert.equal(docDisplayStatus({ status: "sent", dueDate: "2026-03-20" }, "2026-03-31"), "overdue");
  assert.equal(docDisplayStatus({ status: "paid", dueDate: "2026-03-20" }, "2026-03-31"), "paid");
  const bills: Bill[] = [{ id: "b", entityId: ENTITY, number: "BILL-1", vendor: { type: "other", name: "V" }, date: "2026-03-01", dueDate: "2026-03-15", currency: "IDR", fxRate: 1, lines: [], subtotal: 0, ppnInput: 0, withholdingTotal: 200_000, total: 10_000_000, amountPayable: 9_800_000, amountPaid: 4_800_000, status: "partial", createdAt: "2026-03-01" }];
  const ap = apAging(bills, "2026-03-31");
  assert.equal(ap.total, 5_000_000);
  assert.equal(ap.rows[0].bucket, "1-30");
});
