/**
 * Pure accounting logic for the Books module. No Next.js and no database imports so it can be unit-tested and
 * reused by the Tax module: document totals (PPN, withholding), posting templates that turn documents into
 * balanced JournalLine[] sets, fiscal depreciation schedules, and report builders (trial balance, P&L, balance
 * sheet, general ledger, AR/AP aging) computed from an entity's accounts and posted journal entries.
 *
 * All ledger amounts are IDR integers; documents keep their currency + fxRate and are converted with toIDR().
 */
import type { Account, AccountSubtype, Bill, BillLine, DocStatus, FixedAsset, Invoice, InvoiceLine, JournalEntry, JournalLine, TaxTag, WithholdingType } from "./types";
import { FISCAL_ASSET_GROUPS } from "./types";
import { roundMoney, toIDR, parseMoney } from "./money";
import { addDays, daysBetween, nextPeriod, periodOf } from "./dates";
import { accountBalances, findByCode, findByTag, naturalBalance, netProfit, type Balance } from "./balances";

// ---------- Withholding defaults ----------

export const WITHHOLDING_TYPES: WithholdingType[] = ["none", "pph23", "pph4_2", "pph26", "pph21", "pph15", "pph22"];
export const WITHHOLDING_RATES: Record<WithholdingType, number> = { none: 0, pph21: 0.05, pph23: 0.02, pph26: 0.2, pph4_2: 0.1, pph15: 0.012, pph22: 0.015 };
export const WITHHOLDING_LABELS: Record<WithholdingType, string> = {
  none: "No withholding", pph23: "PPh 23 (services, 2%)", pph4_2: "PPh 4(2) final (land/building rent, 10%)", pph26: "PPh 26 (foreign vendor, 20%)",
  pph21: "PPh 21 (individual, non-employee)", pph15: "PPh 15 (shipping/air, 1.2%)", pph22: "PPh 22 (imports/goods, 1.5%)",
};
/** Tax tag of the payable account per withholding type (pph15/pph22 have no dedicated tag in the chart). */
export const WITHHOLDING_TAGS: Partial<Record<WithholdingType, TaxTag>> = { pph21: "pph21_payable", pph23: "pph23_payable", pph26: "pph26_payable", pph4_2: "pph4_2_payable" };

export function defaultWithholdingRate(type: WithholdingType): number {
  return WITHHOLDING_RATES[type] ?? 0;
}

// ---------- Document totals ----------

export interface InvoiceTotals { lineAmounts: number[]; subtotal: number; discount: number; taxableBase: number; ppnAmount: number; total: number }

/**
 * Invoice totals in the document currency. PPN is charged only when the entity is PKP and the line's taxCode is
 * "ppn"; a discount reduces the PPN base pro rata.
 */
export function invoiceTotals(lines: Array<Pick<InvoiceLine, "qty" | "unitPrice" | "taxCode">>, opts: { discount?: number; pkp: boolean; ppnRate: number; currency?: string }): InvoiceTotals {
  const ccy = opts.currency ?? "IDR";
  const lineAmounts = lines.map((l) => roundMoney((Number(l.qty) || 0) * (Number(l.unitPrice) || 0), ccy));
  const subtotal = roundMoney(lineAmounts.reduce((s, a) => s + a, 0), ccy);
  const discount = Math.min(Math.max(roundMoney(opts.discount ?? 0, ccy), 0), subtotal);
  const taxable = lineAmounts.reduce((s, a, i) => s + (lines[i].taxCode === "ppn" ? a : 0), 0);
  const taxableBase = opts.pkp && subtotal > 0 ? roundMoney(taxable * (1 - discount / subtotal), ccy) : 0;
  const ppnAmount = opts.pkp ? roundMoney(taxableBase * opts.ppnRate, ccy) : 0;
  const total = roundMoney(subtotal - discount + ppnAmount, ccy);
  return { lineAmounts, subtotal, discount, taxableBase, ppnAmount, total };
}

export interface BillLineTotals { amount: number; ppn: number; withholdingRate: number; withholdingAmount: number }
export interface BillTotals { lines: BillLineTotals[]; subtotal: number; ppnInput: number; withholdingTotal: number; total: number; amountPayable: number }

/**
 * Bill totals in the document currency. PPN input is what the vendor charged (lines with taxCode "ppn");
 * withholding is computed on the line amount excluding PPN (the DPP) and reduces what is paid to the vendor.
 */
export function billTotals(lines: Array<Pick<BillLine, "amount" | "taxCode" | "withholding"> & { withholdingRate?: number }>, opts: { ppnRate: number; currency?: string }): BillTotals {
  const ccy = opts.currency ?? "IDR";
  const out: BillLineTotals[] = lines.map((l) => {
    const amount = roundMoney(Number(l.amount) || 0, ccy);
    const ppn = l.taxCode === "ppn" ? roundMoney(amount * opts.ppnRate, ccy) : 0;
    const type = l.withholding ?? "none";
    const withholdingRate = type === "none" ? 0 : (l.withholdingRate ?? defaultWithholdingRate(type));
    const withholdingAmount = type === "none" ? 0 : roundMoney(amount * withholdingRate, ccy);
    return { amount, ppn, withholdingRate, withholdingAmount };
  });
  const subtotal = roundMoney(out.reduce((s, l) => s + l.amount, 0), ccy);
  const ppnInput = roundMoney(out.reduce((s, l) => s + l.ppn, 0), ccy);
  const withholdingTotal = roundMoney(out.reduce((s, l) => s + l.withholdingAmount, 0), ccy);
  const total = roundMoney(subtotal + ppnInput, ccy);
  return { lines: out, subtotal, ppnInput, withholdingTotal, total, amountPayable: roundMoney(total - withholdingTotal, ccy) };
}

export function invoiceOutstanding(inv: Pick<Invoice, "total" | "amountPaid" | "currency">): number {
  return roundMoney(inv.total - inv.amountPaid, inv.currency);
}

export function billOutstanding(bill: Pick<Bill, "amountPayable" | "amountPaid" | "currency">): number {
  return roundMoney(bill.amountPayable - bill.amountPaid, bill.currency);
}

/** Display status: "overdue" for sent/partial documents past their due date. */
export function docDisplayStatus(doc: { status: DocStatus; dueDate: string }, today: string): DocStatus | "overdue" {
  if ((doc.status === "sent" || doc.status === "partial") && doc.dueDate < today) return "overdue";
  return doc.status;
}

export function isOpenDoc(status: DocStatus): boolean {
  return status === "sent" || status === "partial";
}

// ---------- Posting templates ----------

export function requireTag(accounts: Account[], tag: TaxTag): Account {
  const a = findByTag(accounts, tag);
  if (!a) throw new Error(`No active account tagged "${tag}" in this chart of accounts.`);
  return a;
}

export function accountById(accounts: Account[], id: string): Account {
  const a = accounts.find((x) => x.id === id);
  if (!a) throw new Error(`Account ${id} not found.`);
  return a;
}

type LineExtra = Partial<Omit<JournalLine, "accountId" | "accountCode" | "debit" | "credit">>;

export function jl(account: Account, debit: number, credit: number, extra: LineExtra = {}): JournalLine {
  return { accountId: account.id, accountCode: account.code, debit: roundMoney(debit), credit: roundMoney(credit), ...extra };
}

/** Removes zero lines and merges nothing: callers keep one line per document line for the audit trail. */
function compact(lines: JournalLine[]): JournalLine[] {
  return lines.filter((l) => l.debit !== 0 || l.credit !== 0);
}

function fxInfo(doc: { currency: string; fxRate: number }, amount: number): LineExtra {
  return doc.currency === "IDR" ? {} : { currency: doc.currency, fxAmount: amount, fxRate: doc.fxRate };
}

/** Dr AR (total) / Cr revenue per line / Cr PPN output; discount is debited to the sales-discount account. */
export function invoiceJournalLines(inv: Invoice, accounts: Account[]): JournalLine[] {
  const ar = requireTag(accounts, "ar_trade");
  const cp = { counterpartyId: inv.customer.id, counterpartyName: inv.customer.name };
  const conv = (x: number) => toIDR(x, inv.currency, inv.fxRate);
  const lines: JournalLine[] = [];
  const totalIDR = conv(inv.total);
  lines.push(jl(ar, totalIDR, 0, { description: `Invoice ${inv.number}`, ...cp, ...fxInfo(inv, inv.total) }));
  const revenueLines: JournalLine[] = inv.lines.map((l) => jl(accountById(accounts, l.accountId), 0, conv(l.amount), { description: l.description, ...cp, taxCode: l.taxCode, projectId: l.projectId ?? inv.projectId, ...fxInfo(inv, l.amount) }));
  lines.push(...revenueLines);
  if (inv.discount > 0) {
    const disc = findByCode(accounts, "4-1900") ?? findByTag(accounts, "sales_default") ?? accountById(accounts, inv.lines[0].accountId);
    lines.push(jl(disc, conv(inv.discount), 0, { description: `Discount on ${inv.number}`, ...cp, ...fxInfo(inv, inv.discount) }));
  }
  if (inv.ppnAmount > 0) lines.push(jl(requireTag(accounts, "ppn_output"), 0, conv(inv.ppnAmount), { description: `PPN output ${inv.number}`, ...cp, ...fxInfo(inv, inv.ppnAmount) }));
  balanceInto(lines, revenueLines[revenueLines.length - 1]);
  return compact(lines);
}

/** Pushes any rounding difference from currency conversion into `target` so the entry balances. */
function balanceInto(lines: JournalLine[], target: JournalLine | undefined) {
  if (!target) return;
  const d = lines.reduce((s, l) => s + l.debit, 0);
  const c = lines.reduce((s, l) => s + l.credit, 0);
  const diff = roundMoney(d - c);
  if (diff === 0) return;
  if (target.credit > 0) target.credit = roundMoney(target.credit + diff);
  else target.debit = roundMoney(target.debit - diff);
}

export function withholdingPayableAccount(accounts: Account[], type: WithholdingType): Account {
  const tag = WITHHOLDING_TAGS[type];
  if (tag) return requireTag(accounts, tag);
  const label = type === "pph15" ? "pph 15" : "pph 22";
  const a = accounts.find((x) => x.active && x.subtype === "tax_payable" && x.name.toLowerCase().includes(label));
  if (!a) throw new Error(`No payable account for ${WITHHOLDING_LABELS[type]}: add a liability account named "PPh ${type.slice(3)} payable".`);
  return a;
}

/**
 * Dr expense/asset per line (+ PPN when not creditable) / Dr PPN input when creditable / Cr withholding payable
 * per type / Cr AP for the amount payable.
 */
export function billJournalLines(bill: Bill, accounts: Account[], opts: { ppnCreditable: boolean }): JournalLine[] {
  const ap = requireTag(accounts, "ap_trade");
  const cp = { counterpartyId: bill.vendor.id, counterpartyName: bill.vendor.name };
  const conv = (x: number) => toIDR(x, bill.currency, bill.fxRate);
  const lines: JournalLine[] = [];
  // The vendor's PPN is stored on the bill; allocate it pro rata to the "ppn" lines when it is not creditable.
  const taxable = bill.lines.filter((l) => l.taxCode === "ppn").reduce((s, l) => s + l.amount, 0);
  const expenseLines: JournalLine[] = bill.lines.map((l) => {
    const ppn = l.taxCode === "ppn" && taxable > 0 ? roundMoney((l.amount / taxable) * bill.ppnInput, bill.currency) : 0;
    const amount = l.amount + (opts.ppnCreditable ? 0 : ppn);
    return jl(accountById(accounts, l.accountId), conv(amount), 0, { description: l.description, ...cp, taxCode: l.taxCode, projectId: l.projectId ?? bill.projectId, ...fxInfo(bill, amount) });
  });
  lines.push(...expenseLines);
  if (opts.ppnCreditable && bill.ppnInput > 0) lines.push(jl(requireTag(accounts, "ppn_input"), conv(bill.ppnInput), 0, { description: `PPN input ${bill.number}`, ...cp, ...fxInfo(bill, bill.ppnInput) }));
  const byType = new Map<WithholdingType, number>();
  bill.lines.forEach((l) => { if (l.withholding !== "none" && (l.withholdingAmount ?? 0) > 0) byType.set(l.withholding, (byType.get(l.withholding) ?? 0) + (l.withholdingAmount ?? 0)); });
  for (const [type, amt] of byType) lines.push(jl(withholdingPayableAccount(accounts, type), 0, conv(amt), { description: `${WITHHOLDING_LABELS[type].split(" (")[0]} withheld on ${bill.number}`, ...cp, ...fxInfo(bill, amt) }));
  lines.push(jl(ap, 0, conv(bill.amountPayable), { description: `Bill ${bill.number}${bill.vendorInvoiceNumber ? ` (${bill.vendorInvoiceNumber})` : ""}`, ...cp, ...fxInfo(bill, bill.amountPayable) }));
  balanceInto(lines, expenseLines[0]);
  return compact(lines);
}

export interface ReceiptInput {
  invoice: Pick<Invoice, "number" | "currency" | "fxRate" | "customer">;
  /** Amount received, in the invoice currency. */
  amount: number;
  /** IDR per unit of the invoice currency on the receipt date (1 for IDR). */
  fxRate: number;
  bankAccount: Account;
  accounts: Account[];
  reference?: string;
}

/** Dr bank (at receipt rate) / Cr AR (at invoice rate); the difference is an FX gain or loss. */
export function receiptJournalLines(p: ReceiptInput): JournalLine[] {
  const ar = requireTag(p.accounts, "ar_trade");
  const cp = { counterpartyId: p.invoice.customer.id, counterpartyName: p.invoice.customer.name };
  const ccy = p.invoice.currency;
  const fx = (amount: number, rate: number): LineExtra => (ccy === "IDR" ? {} : { currency: ccy, fxAmount: amount, fxRate: rate });
  const bankIDR = toIDR(p.amount, ccy, p.fxRate);
  const arIDR = toIDR(p.amount, ccy, p.invoice.fxRate);
  const memo = `Receipt ${p.invoice.number}${p.reference ? ` ${p.reference}` : ""}`;
  const lines = [jl(p.bankAccount, bankIDR, 0, { description: memo, ...cp, ...fx(p.amount, p.fxRate) }), jl(ar, 0, arIDR, { description: memo, ...cp, ...fx(p.amount, p.invoice.fxRate) })];
  const diff = roundMoney(bankIDR - arIDR);
  if (diff > 0) lines.push(jl(requireTag(p.accounts, "fx_gain"), 0, diff, { description: `FX gain on ${p.invoice.number}`, ...cp }));
  if (diff < 0) lines.push(jl(requireTag(p.accounts, "fx_loss"), -diff, 0, { description: `FX loss on ${p.invoice.number}`, ...cp }));
  return compact(lines);
}

export interface DisbursementInput {
  bill: Pick<Bill, "number" | "currency" | "fxRate" | "vendor">;
  amount: number;
  fxRate: number;
  bankAccount: Account;
  accounts: Account[];
  reference?: string;
}

/** Dr AP (at bill rate) / Cr bank (at payment rate); difference to FX gain/loss. */
export function disbursementJournalLines(p: DisbursementInput): JournalLine[] {
  const ap = requireTag(p.accounts, "ap_trade");
  const cp = { counterpartyId: p.bill.vendor.id, counterpartyName: p.bill.vendor.name };
  const ccy = p.bill.currency;
  const fx = (amount: number, rate: number): LineExtra => (ccy === "IDR" ? {} : { currency: ccy, fxAmount: amount, fxRate: rate });
  const apIDR = toIDR(p.amount, ccy, p.bill.fxRate);
  const bankIDR = toIDR(p.amount, ccy, p.fxRate);
  const memo = `Payment ${p.bill.number}${p.reference ? ` ${p.reference}` : ""}`;
  const lines = [jl(ap, apIDR, 0, { description: memo, ...cp, ...fx(p.amount, p.bill.fxRate) }), jl(p.bankAccount, 0, bankIDR, { description: memo, ...cp, ...fx(p.amount, p.fxRate) })];
  const diff = roundMoney(apIDR - bankIDR);
  if (diff > 0) lines.push(jl(requireTag(p.accounts, "fx_gain"), 0, diff, { description: `FX gain on ${p.bill.number}`, ...cp }));
  if (diff < 0) lines.push(jl(requireTag(p.accounts, "fx_loss"), -diff, 0, { description: `FX loss on ${p.bill.number}`, ...cp }));
  return compact(lines);
}

export interface TransferInput {
  from: Account;
  to: Account;
  /** IDR leaving the source account. */
  amountIDR: number;
  /** IDR arriving on the destination (defaults to amountIDR; a difference is an FX gain/loss or a bank fee). */
  toAmountIDR?: number;
  feeIDR?: number;
  feeAccount?: Account;
  accounts: Account[];
  memo?: string;
}

/** Dr destination bank / Cr source bank, optional fee line, FX difference to fx_gain/fx_loss. */
export function transferJournalLines(p: TransferInput): JournalLine[] {
  const out = roundMoney(p.amountIDR);
  const fee = roundMoney(p.feeIDR ?? 0);
  const inAmt = roundMoney(p.toAmountIDR ?? out - fee);
  const lines = [jl(p.to, inAmt, 0, { description: p.memo ?? "Transfer in" }), jl(p.from, 0, out, { description: p.memo ?? "Transfer out" })];
  if (fee > 0 && p.feeAccount) lines.push(jl(p.feeAccount, fee, 0, { description: "Transfer fee" }));
  const diff = roundMoney(out - inAmt - fee);
  if (diff > 0) lines.push(jl(requireTag(p.accounts, "fx_loss"), diff, 0, { description: "FX difference on transfer" }));
  if (diff < 0) lines.push(jl(requireTag(p.accounts, "fx_gain"), 0, -diff, { description: "FX difference on transfer" }));
  return compact(lines);
}

/** Bank transaction posted straight against a counter account (bank charges, interest, owner contribution…). */
export function bankJournalLines(p: { bankAccount: Account; counterAccount: Account; amountIDR: number; description: string; counterpartyName?: string; currency?: string; fxAmount?: number; fxRate?: number }): JournalLine[] {
  const amt = Math.abs(roundMoney(p.amountIDR));
  const extra: LineExtra = { description: p.description, counterpartyName: p.counterpartyName, ...(p.currency && p.currency !== "IDR" ? { currency: p.currency, fxAmount: Math.abs(p.fxAmount ?? 0), fxRate: p.fxRate } : {}) };
  return p.amountIDR >= 0
    ? [jl(p.bankAccount, amt, 0, extra), jl(p.counterAccount, 0, amt, extra)]
    : [jl(p.counterAccount, amt, 0, extra), jl(p.bankAccount, 0, amt, extra)];
}

/** One Dr depreciation expense / Cr accumulated depreciation pair per asset. */
export function depreciationJournalLines(runs: Array<{ asset: Pick<FixedAsset, "name" | "deprExpenseAccountId" | "accumDeprAccountId">; amount: number }>, accounts: Account[]): JournalLine[] {
  const lines: JournalLine[] = [];
  for (const r of runs) {
    if (r.amount <= 0) continue;
    lines.push(jl(accountById(accounts, r.asset.deprExpenseAccountId), r.amount, 0, { description: `Depreciation ${r.asset.name}` }));
    lines.push(jl(accountById(accounts, r.asset.accumDeprAccountId), 0, r.amount, { description: `Depreciation ${r.asset.name}` }));
  }
  return lines;
}

/** Disposal: Dr accumulated depreciation, Dr proceeds (bank or receivable), Cr asset cost; gain/loss to other income/expense. */
export function disposalJournalLines(p: { asset: FixedAsset; proceedsIDR: number; proceedsAccount?: Account; gainAccount: Account; lossAccount: Account; accounts: Account[] }): JournalLine[] {
  const cost = roundMoney(p.asset.cost);
  const accum = roundMoney(p.asset.accumulatedDepreciation);
  const proceeds = roundMoney(p.proceedsIDR);
  const lines: JournalLine[] = [];
  if (accum > 0) lines.push(jl(accountById(p.accounts, p.asset.accumDeprAccountId), accum, 0, { description: `Disposal ${p.asset.name}` }));
  if (proceeds > 0 && p.proceedsAccount) lines.push(jl(p.proceedsAccount, proceeds, 0, { description: `Proceeds ${p.asset.name}` }));
  lines.push(jl(accountById(p.accounts, p.asset.assetAccountId), 0, cost, { description: `Disposal ${p.asset.name}` }));
  const result = roundMoney(proceeds - (cost - accum));
  if (result > 0) lines.push(jl(p.gainAccount, 0, result, { description: `Gain on disposal ${p.asset.name}` }));
  if (result < 0) lines.push(jl(p.lossAccount, -result, 0, { description: `Loss on disposal ${p.asset.name}` }));
  return compact(lines);
}

// ---------- Depreciation ----------

export interface DepreciationRow { period: string; amount: number; accumulated: number; nbv: number }
export type ScheduleInput = Pick<FixedAsset, "cost" | "salvageValue" | "acquisitionDate" | "method" | "usefulLifeMonths" | "fiscalGroup">;

export function fiscalYearStartOf(date: string, startMonth = 1): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const fy = m >= startMonth ? y : y - 1;
  return `${fy}-${String(startMonth).padStart(2, "0")}-01`;
}

/** The 12 periods of the fiscal year that contains `date`. */
export function fiscalYearPeriods(date: string, startMonth = 1): string[] {
  let p = periodOf(fiscalYearStartOf(date, startMonth));
  const out: string[] = [];
  for (let i = 0; i < 12; i++) { out.push(p); p = nextPeriod(p); }
  return out;
}

export function defaultUsefulLifeMonths(group: FixedAsset["fiscalGroup"]): number {
  return FISCAL_ASSET_GROUPS[group].usefulLifeYears * 12;
}

/**
 * Monthly depreciation schedule following UU PPh art. 11: starts in the month of acquisition; straight line
 * spreads (cost − salvage) evenly; declining balance applies the group rate to the opening net book value of each
 * fiscal year (pro rata by month) and writes the remainder off over the final fiscal year of the useful life.
 * Rounding is absorbed by the last month so the schedule ends exactly at the salvage value.
 */
export function depreciationSchedule(asset: ScheduleInput, opts: { fiscalYearStartMonth?: number } = {}): DepreciationRow[] {
  const n = Math.max(0, Math.round(asset.usefulLifeMonths));
  const cost = roundMoney(asset.cost);
  const salvage = roundMoney(asset.salvageValue ?? 0);
  const base = cost - salvage;
  if (n <= 0 || base <= 0 || asset.fiscalGroup === "land") return [];
  const rate = FISCAL_ASSET_GROUPS[asset.fiscalGroup]?.decliningRate ?? 0;
  const declining = asset.method === "declining_balance" && rate > 0;
  const fyStart = opts.fiscalYearStartMonth ?? 1;
  const rows: DepreciationRow[] = [];
  let period = periodOf(asset.acquisitionDate);
  let accumulated = 0;
  const slMonthly = roundMoney(base / n);
  // Fiscal year of the last month of the schedule (declining balance writes off the remainder within it).
  let lastPeriod = period;
  for (let i = 1; i < n; i++) lastPeriod = nextPeriod(lastPeriod);
  const lastFY = fiscalYearStartOf(`${lastPeriod}-01`, fyStart);
  let currentFY = "";
  let monthly = 0;
  for (let i = 0; i < n; i++) {
    let amount: number;
    if (!declining) amount = slMonthly;
    else {
      const fy = fiscalYearStartOf(`${period}-01`, fyStart);
      if (fy !== currentFY) { currentFY = fy; monthly = roundMoney(((cost - accumulated) * rate) / 12); }
      amount = fy === lastFY ? roundMoney((cost - accumulated - salvage) / (n - i)) : monthly;
    }
    if (i === n - 1) amount = base - accumulated;
    amount = Math.max(0, Math.min(amount, base - accumulated));
    accumulated = roundMoney(accumulated + amount);
    rows.push({ period, amount, accumulated, nbv: roundMoney(cost - accumulated) });
    period = nextPeriod(period);
  }
  return rows;
}

/** Depreciation still to post for an asset up to and including `throughPeriod` (catches up skipped months). */
export function depreciationDue(asset: ScheduleInput & Pick<FixedAsset, "depreciatedThrough" | "status">, throughPeriod: string, opts: { fiscalYearStartMonth?: number } = {}): { amount: number; periods: string[] } {
  if (asset.status !== "active") return { amount: 0, periods: [] };
  const after = asset.depreciatedThrough ?? "";
  const rows = depreciationSchedule(asset, opts).filter((r) => r.period > after && r.period <= throughPeriod);
  return { amount: roundMoney(rows.reduce((s, r) => s + r.amount, 0)), periods: rows.map((r) => r.period) };
}

export function netBookValue(asset: Pick<FixedAsset, "cost" | "accumulatedDepreciation">): number {
  return roundMoney(asset.cost - asset.accumulatedDepreciation);
}

// ---------- Reports ----------

export interface TrialBalanceRow { account: Account; debit: number; credit: number }
export interface TrialBalance { asOf?: string; rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number; balanced: boolean }

/** Cumulative balances of every account with activity up to `asOf` (debit column when net > 0). */
export function trialBalance(accounts: Account[], entries: JournalEntry[], asOf?: string): TrialBalance {
  const bal = accountBalances(entries, { to: asOf });
  const rows: TrialBalanceRow[] = [];
  for (const a of [...accounts].sort((x, y) => x.code.localeCompare(y.code))) {
    const b = bal.get(a.id);
    if (!b || b.net === 0) continue;
    rows.push({ account: a, debit: b.net > 0 ? b.net : 0, credit: b.net < 0 ? -b.net : 0 });
  }
  const totalDebit = roundMoney(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = roundMoney(rows.reduce((s, r) => s + r.credit, 0));
  return { asOf, rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export interface ReportRow { account: Account; amount: number }
export interface ReportSection { key: string; label: string; subtypes: AccountSubtype[]; rows: ReportRow[]; total: number }

const PL_SECTIONS: Array<Pick<ReportSection, "key" | "label" | "subtypes">> = [
  { key: "revenue", label: "Revenue", subtypes: ["sales"] },
  { key: "cogs", label: "Cost of sales", subtypes: ["cogs"] },
  { key: "opex", label: "Operating expenses", subtypes: ["opex", "payroll", "depreciation"] },
  { key: "other_income", label: "Other income", subtypes: ["other_income", "fx_gain"] },
  { key: "other_expense", label: "Other expenses", subtypes: ["other_expense", "fx_loss"] },
  { key: "tax", label: "Income tax", subtypes: ["tax_expense"] },
];

export interface ProfitAndLoss {
  from?: string; to?: string;
  sections: ReportSection[];
  revenue: number; cogs: number; grossProfit: number; opex: number; operatingProfit: number;
  otherIncome: number; otherExpense: number; profitBeforeTax: number; tax: number; netProfit: number;
}

function buildSections(defs: Array<Pick<ReportSection, "key" | "label" | "subtypes">>, accounts: Account[], bal: Map<string, Balance>, keepZero = false): ReportSection[] {
  const sorted = [...accounts].sort((x, y) => x.code.localeCompare(y.code));
  return defs.map((d) => {
    const rows = sorted.filter((a) => d.subtypes.includes(a.subtype)).map((a) => ({ account: a, amount: naturalBalance(a, bal.get(a.id)) })).filter((r) => keepZero || r.amount !== 0);
    return { ...d, rows, total: roundMoney(rows.reduce((s, r) => s + r.amount, 0)) };
  });
}

/** Income statement for a date range (natural signs: revenue and expenses positive). */
export function profitAndLoss(accounts: Account[], entries: JournalEntry[], range: { from?: string; to?: string }): ProfitAndLoss {
  const bal = accountBalances(entries, range);
  const sections = buildSections(PL_SECTIONS, accounts.filter((a) => a.type === "revenue" || a.type === "expense"), bal);
  const t = (k: string) => sections.find((s) => s.key === k)?.total ?? 0;
  const revenue = t("revenue"), cogs = t("cogs"), opex = t("opex"), otherIncome = t("other_income"), otherExpense = t("other_expense"), tax = t("tax");
  const grossProfit = roundMoney(revenue - cogs);
  const operatingProfit = roundMoney(grossProfit - opex);
  const profitBeforeTax = roundMoney(operatingProfit + otherIncome - otherExpense);
  return { from: range.from, to: range.to, sections, revenue, cogs, grossProfit, opex, operatingProfit, otherIncome, otherExpense, profitBeforeTax, tax, netProfit: roundMoney(profitBeforeTax - tax) };
}

const BS_ASSET_SECTIONS: Array<Pick<ReportSection, "key" | "label" | "subtypes">> = [
  { key: "current_assets", label: "Current assets", subtypes: ["cash", "bank", "ar", "other_receivable", "inventory", "prepaid", "prepaid_tax"] },
  { key: "fixed_assets", label: "Fixed assets", subtypes: ["fixed_asset", "accum_depr"] },
  { key: "other_assets", label: "Other assets", subtypes: ["other_asset"] },
];
const BS_LIABILITY_SECTIONS: Array<Pick<ReportSection, "key" | "label" | "subtypes">> = [
  { key: "current_liabilities", label: "Current liabilities", subtypes: ["ap", "tax_payable", "accrued", "customer_deposit", "other_liability"] },
  { key: "loans", label: "Loans", subtypes: ["loan"] },
];

export interface BalanceSheet {
  asOf: string; fiscalYearStart: string;
  assets: ReportSection[]; liabilities: ReportSection[]; equity: ReportSection[];
  totalAssets: number; totalLiabilities: number; totalEquity: number;
  retainedEarnings: number; currentYearEarnings: number; balanced: boolean;
}

/**
 * Statement of financial position as of a date. Equity shows retained earnings (account balance + profit of all
 * prior fiscal years not yet closed) and current-year earnings (account balance + profit since the fiscal year
 * start), so assets = liabilities + equity even when no closing entries were posted.
 */
export function balanceSheet(accounts: Account[], entries: JournalEntry[], asOf: string, fiscalYearStartMonth = 1): BalanceSheet {
  const bal = accountBalances(entries, { to: asOf });
  const fiscalYearStart = fiscalYearStartOf(asOf, fiscalYearStartMonth);
  const plAccounts = accounts.filter((a) => a.type === "revenue" || a.type === "expense");
  const priorEarnings = netProfit(plAccounts, entries, { to: addDays(fiscalYearStart, -1) });
  const currentYearEarnings = netProfit(plAccounts, entries, { from: fiscalYearStart, to: asOf });
  const assets = buildSections(BS_ASSET_SECTIONS, accounts.filter((a) => a.type === "asset"), bal);
  const liabilities = buildSections(BS_LIABILITY_SECTIONS, accounts.filter((a) => a.type === "liability"), bal);
  const equityAccounts = [...accounts.filter((a) => a.type === "equity")].sort((x, y) => x.code.localeCompare(y.code));
  const reAccount = findByTag(accounts, "retained_earnings");
  const cyeAccount = findByTag(accounts, "current_earnings");
  const rows: ReportRow[] = [];
  let retainedEarnings = priorEarnings;
  let cye = currentYearEarnings;
  for (const a of equityAccounts) {
    let amount = naturalBalance(a, bal.get(a.id));
    if (a.id === reAccount?.id) { amount = roundMoney(amount + priorEarnings); retainedEarnings = amount; }
    if (a.id === cyeAccount?.id) { amount = roundMoney(amount + currentYearEarnings); cye = amount; }
    if (amount !== 0 || a.id === reAccount?.id || a.id === cyeAccount?.id) rows.push({ account: a, amount });
  }
  if (!reAccount && priorEarnings !== 0) rows.push({ account: syntheticAccount(accounts, "3-2000", "Retained earnings", "retained_earnings"), amount: priorEarnings });
  if (!cyeAccount) rows.push({ account: syntheticAccount(accounts, "3-2100", "Current year earnings", "current_earnings"), amount: currentYearEarnings });
  const equity: ReportSection[] = [{ key: "equity", label: "Equity", subtypes: ["share_capital", "retained_earnings", "current_earnings", "dividend"], rows, total: roundMoney(rows.reduce((s, r) => s + r.amount, 0)) }];
  const totalAssets = roundMoney(assets.reduce((s, x) => s + x.total, 0));
  const totalLiabilities = roundMoney(liabilities.reduce((s, x) => s + x.total, 0));
  const totalEquity = equity[0].total;
  return { asOf, fiscalYearStart, assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, retainedEarnings, currentYearEarnings: cye, balanced: totalAssets === roundMoney(totalLiabilities + totalEquity) };
}

function syntheticAccount(accounts: Account[], code: string, name: string, subtype: AccountSubtype): Account {
  return { id: `synthetic:${subtype}`, entityId: accounts[0]?.entityId ?? "", code, name, type: "equity", subtype, normalBalance: "credit", isSystem: true, active: true };
}

export interface GLRow { entryId: string; number: string; date: string; memo: string; description?: string; counterpartyName?: string; debit: number; credit: number; balance: number }
export interface GeneralLedger { account: Account; from?: string; to?: string; opening: number; rows: GLRow[]; totalDebit: number; totalCredit: number; closing: number }

/** Posted movements of one account in a range with an opening balance and a running balance (natural sign). */
export function generalLedger(account: Account, entries: JournalEntry[], range: { from?: string; to?: string } = {}): GeneralLedger {
  const sign = account.normalBalance === "debit" ? 1 : -1;
  const posted = entries.filter((e) => e.status === "posted").sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  let opening = 0;
  const rows: GLRow[] = [];
  let balance = 0;
  let totalDebit = 0, totalCredit = 0;
  for (const e of posted) {
    for (const l of e.lines) {
      if (l.accountId !== account.id) continue;
      const delta = sign * (l.debit - l.credit);
      if (range.from && e.date < range.from) { opening += delta; continue; }
      if (range.to && e.date > range.to) continue;
      if (rows.length === 0) balance = opening;
      balance = roundMoney(balance + delta);
      totalDebit += l.debit; totalCredit += l.credit;
      rows.push({ entryId: e.id, number: e.number, date: e.date, memo: e.memo, description: l.description, counterpartyName: l.counterpartyName, debit: l.debit, credit: l.credit, balance });
    }
  }
  opening = roundMoney(opening);
  return { account, from: range.from, to: range.to, opening, rows, totalDebit: roundMoney(totalDebit), totalCredit: roundMoney(totalCredit), closing: rows.length ? rows[rows.length - 1].balance : opening };
}

export const AGING_BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];
export interface AgingRow { id: string; number: string; name: string; date: string; dueDate: string; currency: string; outstanding: number; outstandingIDR: number; daysOverdue: number; bucket: AgingBucket }
export interface AgingGroup { name: string; buckets: Record<AgingBucket, number>; total: number; rows: AgingRow[] }
export interface AgingReport { asOf: string; rows: AgingRow[]; groups: AgingGroup[]; totals: Record<AgingBucket, number>; total: number }

export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

function emptyBuckets(): Record<AgingBucket, number> {
  return { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
}

function aging(docs: Array<{ id: string; number: string; name: string; date: string; dueDate: string; currency: string; fxRate: number; outstanding: number; status: DocStatus }>, asOf: string): AgingReport {
  const rows: AgingRow[] = [];
  for (const d of docs) {
    if (!isOpenDoc(d.status) || d.outstanding <= 0 || d.date > asOf) continue;
    const daysOverdue = daysBetween(d.dueDate, asOf);
    rows.push({ id: d.id, number: d.number, name: d.name, date: d.date, dueDate: d.dueDate, currency: d.currency, outstanding: d.outstanding, outstandingIDR: toIDR(d.outstanding, d.currency, d.fxRate), daysOverdue, bucket: agingBucket(daysOverdue) });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.dueDate.localeCompare(b.dueDate));
  const byName = new Map<string, AgingGroup>();
  const totals = emptyBuckets();
  for (const r of rows) {
    const g = byName.get(r.name) ?? { name: r.name, buckets: emptyBuckets(), total: 0, rows: [] };
    g.buckets[r.bucket] += r.outstandingIDR; g.total += r.outstandingIDR; g.rows.push(r);
    byName.set(r.name, g);
    totals[r.bucket] += r.outstandingIDR;
  }
  const groups = [...byName.values()].sort((a, b) => b.total - a.total);
  return { asOf, rows, groups, totals, total: roundMoney(rows.reduce((s, r) => s + r.outstandingIDR, 0)) };
}

/** Open invoices (sent/partial) bucketed by days past due, in IDR at the invoice rate. */
export function arAging(invoices: Invoice[], asOf: string): AgingReport {
  return aging(invoices.map((i) => ({ id: i.id, number: i.number, name: i.customer.name, date: i.date, dueDate: i.dueDate, currency: i.currency, fxRate: i.fxRate, outstanding: invoiceOutstanding(i), status: i.status })), asOf);
}

/** Open bills bucketed by days past due (outstanding = amount payable − paid). */
export function apAging(bills: Bill[], asOf: string): AgingReport {
  return aging(bills.map((b) => ({ id: b.id, number: b.number, name: b.vendor.name, date: b.date, dueDate: b.dueDate, currency: b.currency, fxRate: b.fxRate, outstanding: billOutstanding(b), status: b.status })), asOf);
}

// ---------- Bank statement CSV mapping ----------

export type DateFormat = "dd/mm/yyyy" | "yyyy-mm-dd" | "mm/dd/yyyy";
export interface CsvMapping { date: number; description: number; amount?: number; debit?: number; credit?: number; balance?: number; reference?: number; dateFormat: DateFormat; /** Debit column means money out (default true). */ debitIsOut?: boolean; /** Flip the sign of the single amount column (statements that show outflows as positive). */ invertAmount?: boolean }
export interface ParsedBankRow { date: string; description: string; amount: number; balance?: number; reference?: string }

/** Parses "31/12/2026", "2026-12-31", "12/31/2026", also tolerating "-" or "." separators and 2-digit years. */
export function parseStatementDate(raw: string, format: DateFormat): string | null {
  const s = raw.trim().replace(/\s.*$/, "");
  const m = s.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
  if (!m) return null;
  let y: number, mo: number, d: number;
  if (format === "yyyy-mm-dd") { y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]); }
  else if (format === "mm/dd/yyyy") { mo = Number(m[1]); d = Number(m[2]); y = Number(m[3]); }
  else { d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]); }
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** Applies a column mapping to raw CSV rows (header excluded). Rows that cannot be parsed are reported in `errors`. */
export function mapBankRows(rows: string[][], mapping: CsvMapping): { rows: ParsedBankRow[]; errors: string[] } {
  const out: ParsedBankRow[] = [];
  const errors: string[] = [];
  rows.forEach((r, i) => {
    const date = parseStatementDate(r[mapping.date] ?? "", mapping.dateFormat);
    if (!date) { if (r.some((c) => c.trim())) errors.push(`Row ${i + 2}: unreadable date "${r[mapping.date] ?? ""}"`); return; }
    let amount: number;
    if (mapping.amount !== undefined && mapping.amount >= 0) {
      amount = parseMoney(r[mapping.amount]);
      if (mapping.invertAmount) amount = -amount;
    } else {
      const debit = mapping.debit !== undefined && mapping.debit >= 0 ? Math.abs(parseMoney(r[mapping.debit])) : 0;
      const credit = mapping.credit !== undefined && mapping.credit >= 0 ? Math.abs(parseMoney(r[mapping.credit])) : 0;
      amount = (mapping.debitIsOut ?? true) ? credit - debit : debit - credit;
    }
    if (!Number.isFinite(amount) || amount === 0) { errors.push(`Row ${i + 2}: no amount`); return; }
    const description = (r[mapping.description] ?? "").trim() || "(no description)";
    const balanceRaw = mapping.balance !== undefined && mapping.balance >= 0 ? r[mapping.balance] : undefined;
    const reference = mapping.reference !== undefined && mapping.reference >= 0 ? (r[mapping.reference] ?? "").trim() || undefined : undefined;
    out.push({ date, description, amount, balance: balanceRaw && balanceRaw.trim() ? parseMoney(balanceRaw) : undefined, reference });
  });
  return { rows: out, errors };
}

// ---------- Small helpers used by pages ----------

/** Natural-sign balance of every account with the given subtypes, summed (e.g. cash + bank). */
export function sumBySubtype(accounts: Account[], bal: Map<string, Balance>, subtypes: AccountSubtype[]): number {
  return roundMoney(accounts.filter((a) => subtypes.includes(a.subtype)).reduce((s, a) => s + naturalBalance(a, bal.get(a.id)), 0));
}

export function entryTotal(entry: Pick<JournalEntry, "lines">): number {
  return roundMoney(entry.lines.reduce((s, l) => s + l.debit, 0));
}

export const ACCOUNT_TYPE_LABELS: Record<Account["type"], string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expenses" };
export const ACCOUNT_TYPE_ORDER: Account["type"][] = ["asset", "liability", "equity", "revenue", "expense"];
