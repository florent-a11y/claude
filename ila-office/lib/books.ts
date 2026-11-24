/**
 * Books services: everything that reads or writes the database for the accounting module. Pure arithmetic and
 * posting templates live in lib/ledger.ts; journal persistence goes through lib/posting.ts (which enforces
 * period locks and balanced entries).
 */
import { db } from "./db";
import { assertPeriodOpen, postJournal, voidJournal, postedEntries } from "./posting";
import { accountBalances, findByTag, findByCode } from "./balances";
import { normalBalanceOf } from "./coa";
import { lastDayOfMonth, periodOf, todayISO } from "./dates";
import { dueDateFor, resolveInvoiceSettings } from "./invoice-settings";
import { fmtMoney, roundMoney, toIDR } from "./money";
import { sha256 } from "./util";
import {
  invoiceTotals, billTotals, invoiceJournalLines, billJournalLines, receiptJournalLines, disbursementJournalLines, transferJournalLines,
  bankJournalLines, depreciationJournalLines, depreciationDue, disposalJournalLines, disposalPreview, invoiceOutstanding, billOutstanding, requireTag, accountById, defaultUsefulLifeMonths,
  type ParsedBankRow, type TransferFxLeg,
} from "./ledger";
export { parseStatementDate, mapBankRows, type CsvMapping, type DateFormat, type ParsedBankRow } from "./ledger";
import type {
  Account, AccountSubtype, AccountType, Bill, BillLine, BankAccount, BankTransaction, Entity, FixedAsset, ImportBatch, Invoice, InvoiceLine, JournalEntry, Payment, TaxCode, TaxTag, WithholdingType,
} from "./types";
import { FISCAL_ASSET_GROUPS } from "./types";

export class BooksError extends Error {}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "issues" in e && Array.isArray((e as { issues: unknown }).issues)) {
    return (e as { issues: Array<{ path?: Array<string | number>; message: string }> }).issues.map((i) => `${i.path?.length ? i.path.join(".") + ": " : ""}${i.message}`).join("; ");
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

// ---------- Loading ----------

export async function loadEntity(entityId: string): Promise<Entity | null> {
  return db.get("entities", entityId);
}

export async function entityAccounts(entityId: string): Promise<Account[]> {
  return db.list("accounts", { where: { entityId }, orderBy: "code" });
}

export async function entityEntries(entityId: string): Promise<JournalEntry[]> {
  return postedEntries(entityId);
}

export function periodKey(entityId: string, period: string): string {
  return `${entityId}:${period}`;
}

// ---------- Accounts ----------

export interface AccountInput { code: string; name: string; nameId?: string; type: AccountType; subtype: AccountSubtype; taxTag?: TaxTag; parentCode?: string; deductible?: boolean }

export async function createAccount(entityId: string, input: AccountInput): Promise<Account> {
  const accounts = await entityAccounts(entityId);
  if (accounts.some((a) => a.code === input.code)) throw new BooksError(`Account code ${input.code} already exists.`);
  if (input.taxTag && accounts.some((a) => a.taxTag === input.taxTag && a.active)) throw new BooksError(`Another active account already carries the tag ${input.taxTag}.`);
  const account: Account = {
    id: db.newId(), entityId, code: input.code, name: input.name, nameId: input.nameId, type: input.type, subtype: input.subtype, normalBalance: normalBalanceOf(input.type),
    taxTag: input.taxTag, parentCode: input.parentCode, deductible: input.deductible ?? (input.type === "expense" ? true : undefined), isSystem: false, active: true,
  };
  await db.insert("accounts", account);
  return account;
}

export async function updateAccount(entityId: string, id: string, patch: { name?: string; nameId?: string; active?: boolean; deductible?: boolean; code?: string }): Promise<Account> {
  const account = await db.get("accounts", id);
  if (!account || account.entityId !== entityId) throw new BooksError("Account not found.");
  if (patch.active === false && account.isSystem) throw new BooksError("System accounts (tagged for tax) cannot be deactivated.");
  if (patch.code && patch.code !== account.code) {
    const accounts = await entityAccounts(entityId);
    if (accounts.some((a) => a.code === patch.code)) throw new BooksError(`Account code ${patch.code} already exists.`);
  }
  const updated = await db.update("accounts", id, patch);
  return updated!;
}

export async function deleteAccount(entityId: string, id: string): Promise<void> {
  const account = await db.get("accounts", id);
  if (!account || account.entityId !== entityId) throw new BooksError("Account not found.");
  if (account.isSystem) throw new BooksError("System accounts cannot be deleted.");
  const used = await db.list("journal_entries", { where: (e) => e.entityId === entityId && e.lines.some((l) => l.accountId === id), limit: 1 });
  if (used.length) throw new BooksError("This account has journal lines; deactivate it instead.");
  const banks = await db.list("bank_accounts", { where: { entityId, accountId: id }, limit: 1 });
  if (banks.length) throw new BooksError("This account is linked to a bank account.");
  await db.remove("accounts", id);
}

// ---------- Invoices ----------

export interface InvoiceLineInput { description: string; qty: number; unitPrice: number; accountId: string; taxCode: TaxCode; serviceId?: string }
export interface InvoiceInput {
  customer: Invoice["customer"];
  date: string;
  dueDate?: string;
  currency: string;
  fxRate: number;
  lines: InvoiceLineInput[];
  discount?: number;
  notes?: string;
  paymentInstructions?: string;
  fakturNumber?: string;
  /** The unit prices and the discount include PPN (PKP entities only; see `invoiceTotals`). Exclusive when absent. */
  pricesIncludeTax?: boolean;
}

function buildInvoice(entity: Entity, accounts: Account[], input: InvoiceInput, base: Pick<Invoice, "id" | "number" | "createdAt" | "amountPaid" | "status" | "journalId">): Invoice {
  if (input.lines.length === 0) throw new BooksError("An invoice needs at least one line.");
  const totals = invoiceTotals(input.lines, { discount: input.discount, pkp: entity.tax.pkp, ppnRate: entity.tax.ppnRate, currency: input.currency, pricesIncludeTax: input.pricesIncludeTax });
  const inclusive = totals.pricesIncludeTax;
  const lines: InvoiceLine[] = input.lines.map((l, i) => {
    accountById(accounts, l.accountId);
    return { id: db.newId(), serviceId: l.serviceId, description: l.description, qty: l.qty, unitPrice: l.unitPrice, amount: totals.lineAmounts[i], grossAmount: inclusive ? totals.lineGross[i] : undefined, accountId: l.accountId, taxCode: l.taxCode };
  });
  return {
    // Without a due date the entity's payment term applies (invoice settings; 3 working days when none is set).
    ...base, entityId: entity.id, customer: input.customer, date: input.date, dueDate: input.dueDate ?? dueDateFor(input.date, resolveInvoiceSettings(entity)), currency: input.currency, fxRate: input.currency === "IDR" ? 1 : input.fxRate,
    lines, subtotal: totals.subtotal, discount: totals.discount, ppnAmount: totals.ppnAmount, total: totals.total,
    pricesIncludeTax: inclusive || undefined, grossSubtotal: inclusive ? totals.grossSubtotal : undefined, grossDiscount: inclusive ? totals.grossDiscount : undefined,
    taxableBase: entity.tax.pkp ? totals.taxableBase : undefined,
    notes: input.notes, paymentInstructions: input.paymentInstructions,
    fakturNumber: input.fakturNumber, updatedAt: new Date().toISOString(),
  };
}

export async function createInvoice(entityId: string, input: InvoiceInput): Promise<Invoice> {
  const [entity, accounts] = await Promise.all([loadEntity(entityId), entityAccounts(entityId)]);
  if (!entity) throw new BooksError("Entity not found.");
  const number = await db.nextNumber(entityId, "INV", new Date(input.date));
  const invoice = buildInvoice(entity, accounts, input, { id: db.newId(), number, createdAt: new Date().toISOString(), amountPaid: 0, status: "draft", journalId: undefined });
  await db.insert("invoices", invoice);
  return invoice;
}

export async function updateInvoice(entityId: string, id: string, input: InvoiceInput): Promise<Invoice> {
  const [entity, accounts, current] = await Promise.all([loadEntity(entityId), entityAccounts(entityId), db.get("invoices", id)]);
  if (!entity) throw new BooksError("Entity not found.");
  if (!current || current.entityId !== entityId) throw new BooksError("Invoice not found.");
  if (current.status !== "draft") throw new BooksError("Only draft invoices can be edited; void it and create a new one.");
  const invoice = buildInvoice(entity, accounts, input, { id: current.id, number: current.number, createdAt: current.createdAt, amountPaid: 0, status: "draft", journalId: undefined });
  await db.upsert("invoices", invoice);
  return invoice;
}

export async function postInvoice(entityId: string, id: string, userId?: string): Promise<Invoice> {
  const [entity, accounts, invoice] = await Promise.all([loadEntity(entityId), entityAccounts(entityId), db.get("invoices", id)]);
  if (!entity) throw new BooksError("Entity not found.");
  if (!invoice || invoice.entityId !== entityId) throw new BooksError("Invoice not found.");
  if (invoice.status !== "draft") throw new BooksError("Invoice is already posted.");
  if (invoice.total <= 0) throw new BooksError("Invoice total must be positive.");
  const lines = invoiceJournalLines(invoice, accounts);
  const journal = await postJournal(entityId, { date: invoice.date, memo: `Invoice ${invoice.number} — ${invoice.customer.name}`, source: "invoice", sourceId: invoice.id, lines, createdByUserId: userId });
  const now = new Date().toISOString();
  return (await db.update("invoices", id, { status: "sent", journalId: journal.id, sentAt: now, updatedAt: now }))!;
}

export async function voidInvoice(entityId: string, id: string): Promise<Invoice> {
  const invoice = await db.get("invoices", id);
  if (!invoice || invoice.entityId !== entityId) throw new BooksError("Invoice not found.");
  if (invoice.status === "void") return invoice;
  if (invoice.amountPaid > 0) throw new BooksError("This invoice has receipts; void the receipts first.");
  if (invoice.journalId) await voidJournal(entityId, invoice.journalId);
  return (await db.update("invoices", id, { status: "void", updatedAt: new Date().toISOString() }))!;
}

export interface ReceiptInput { invoiceId: string; bankAccountId: string; date: string; amount: number; fxRate?: number; reference?: string; notes?: string; bankTransactionId?: string; method?: Payment["method"] }

/** Records money received against an invoice: Dr bank / Cr AR (+ FX difference), updates amountPaid and status. */
export async function recordReceipt(entityId: string, input: ReceiptInput, userId?: string): Promise<{ payment: Payment; invoice: Invoice; journal: JournalEntry }> {
  const [accounts, invoice, bank] = await Promise.all([entityAccounts(entityId), db.get("invoices", input.invoiceId), db.get("bank_accounts", input.bankAccountId)]);
  if (!invoice || invoice.entityId !== entityId) throw new BooksError("Invoice not found.");
  if (!bank || bank.entityId !== entityId) throw new BooksError("Bank account not found.");
  if (invoice.status !== "sent" && invoice.status !== "partial") throw new BooksError(`Invoice is ${invoice.status}; post it before recording a receipt.`);
  const amount = roundMoney(input.amount, invoice.currency);
  if (amount <= 0) throw new BooksError("Amount must be positive.");
  const outstanding = invoiceOutstanding(invoice);
  if (amount > outstanding + 0.005) throw new BooksError(`Amount exceeds the outstanding balance (${outstanding}).`);
  const fxRate = invoice.currency === "IDR" ? 1 : (input.fxRate && input.fxRate > 0 ? input.fxRate : invoice.fxRate);
  const lines = receiptJournalLines({ invoice, amount, fxRate, bankAccount: accountById(accounts, bank.accountId), accounts, reference: input.reference });
  const journal = await postJournal(entityId, { date: input.date, memo: `Receipt ${invoice.number} — ${invoice.customer.name}`, source: "receipt", sourceId: invoice.id, lines, createdByUserId: userId });
  const payment: Payment = {
    id: db.newId(), entityId, kind: "receipt", date: input.date, amount, currency: invoice.currency, fxRate, bankAccountId: bank.id, invoiceId: invoice.id, journalId: journal.id,
    bankTransactionId: input.bankTransactionId, reference: input.reference, method: input.method ?? "transfer", notes: input.notes, createdAt: new Date().toISOString(),
  };
  await db.insert("payments", payment);
  const amountPaid = roundMoney(invoice.amountPaid + amount, invoice.currency);
  const updated = (await db.update("invoices", invoice.id, { amountPaid, status: amountPaid >= invoice.total ? "paid" : "partial", updatedAt: new Date().toISOString() }))!;
  if (input.bankTransactionId) await db.update("bank_transactions", input.bankTransactionId, { status: "matched", matchedJournalId: journal.id, matchedDocument: { type: "invoice", id: invoice.id } });
  return { payment, invoice: updated, journal };
}

/** Reverses a receipt/disbursement: voids its journal, restores the document balance and unmatches the bank line. */
export async function voidPayment(entityId: string, paymentId: string): Promise<void> {
  const p = await db.get("payments", paymentId);
  if (!p || p.entityId !== entityId) throw new BooksError("Payment not found.");
  // Expenses and deposits (no bill or invoice) keep their row as "void" and release their statement line themselves.
  const moneyMoves = await import("./money-moves");
  if (moneyMoves.isMoneyMove(p)) { await moneyMoves.voidMoneyMove(entityId, p.id); return; }
  if (p.journalId) await voidJournal(entityId, p.journalId);
  if (p.invoiceId) {
    const inv = await db.get("invoices", p.invoiceId);
    if (inv) {
      const amountPaid = Math.max(0, roundMoney(inv.amountPaid - p.amount, inv.currency));
      await db.update("invoices", inv.id, { amountPaid, status: inv.status === "void" ? "void" : amountPaid <= 0 ? "sent" : "partial", updatedAt: new Date().toISOString() });
    }
  }
  if (p.billId) {
    const bill = await db.get("bills", p.billId);
    if (bill) {
      const amountPaid = Math.max(0, roundMoney(bill.amountPaid - p.amount, bill.currency));
      await db.update("bills", bill.id, { amountPaid, status: bill.status === "void" ? "void" : amountPaid <= 0 ? "sent" : "partial", updatedAt: new Date().toISOString() });
    }
  }
  if (p.bankTransactionId) await db.update("bank_transactions", p.bankTransactionId, { status: "unmatched", matchedJournalId: undefined, matchedDocument: undefined });
  await db.remove("payments", paymentId);
}

// ---------- Bills ----------

export interface BillLineInput { description: string; amount: number; accountId: string; taxCode: TaxCode; withholding: WithholdingType; withholdingRate?: number }
export interface BillInput {
  vendor: Bill["vendor"];
  vendorInvoiceNumber?: string;
  date: string;
  dueDate?: string;
  currency: string;
  fxRate: number;
  lines: BillLineInput[];
  notes?: string;
  fakturNumber?: string;
}

function buildBill(entity: Entity, accounts: Account[], input: BillInput, base: Pick<Bill, "id" | "number" | "createdAt" | "amountPaid" | "status" | "journalId">): Bill {
  if (input.lines.length === 0) throw new BooksError("A bill needs at least one line.");
  const totals = billTotals(input.lines, { ppnRate: entity.tax.ppnRate, currency: input.currency });
  const lines: BillLine[] = input.lines.map((l, i) => {
    accountById(accounts, l.accountId);
    const t = totals.lines[i];
    return { id: db.newId(), description: l.description, amount: t.amount, accountId: l.accountId, taxCode: l.taxCode, withholding: l.withholding, withholdingRate: l.withholding === "none" ? undefined : t.withholdingRate, withholdingAmount: l.withholding === "none" ? undefined : t.withholdingAmount };
  });
  return {
    ...base, entityId: entity.id, vendor: input.vendor, vendorInvoiceNumber: input.vendorInvoiceNumber, date: input.date, dueDate: input.dueDate ?? input.date, currency: input.currency, fxRate: input.currency === "IDR" ? 1 : input.fxRate,
    lines, subtotal: totals.subtotal, ppnInput: totals.ppnInput, withholdingTotal: totals.withholdingTotal, total: totals.total, amountPayable: totals.amountPayable,
    notes: input.notes, fakturNumber: input.fakturNumber, updatedAt: new Date().toISOString(),
  };
}

export async function createBill(entityId: string, input: BillInput): Promise<Bill> {
  const [entity, accounts] = await Promise.all([loadEntity(entityId), entityAccounts(entityId)]);
  if (!entity) throw new BooksError("Entity not found.");
  const number = await db.nextNumber(entityId, "BILL", new Date(input.date));
  const bill = buildBill(entity, accounts, input, { id: db.newId(), number, createdAt: new Date().toISOString(), amountPaid: 0, status: "draft", journalId: undefined });
  await db.insert("bills", bill);
  return bill;
}

export async function updateBill(entityId: string, id: string, input: BillInput): Promise<Bill> {
  const [entity, accounts, current] = await Promise.all([loadEntity(entityId), entityAccounts(entityId), db.get("bills", id)]);
  if (!entity) throw new BooksError("Entity not found.");
  if (!current || current.entityId !== entityId) throw new BooksError("Bill not found.");
  if (current.status !== "draft") throw new BooksError("Only draft bills can be edited.");
  const bill = buildBill(entity, accounts, input, { id: current.id, number: current.number, createdAt: current.createdAt, amountPaid: 0, status: "draft", journalId: undefined });
  await db.upsert("bills", bill);
  return bill;
}

export async function postBill(entityId: string, id: string, userId?: string): Promise<Bill> {
  const [entity, accounts, bill] = await Promise.all([loadEntity(entityId), entityAccounts(entityId), db.get("bills", id)]);
  if (!entity) throw new BooksError("Entity not found.");
  if (!bill || bill.entityId !== entityId) throw new BooksError("Bill not found.");
  if (bill.status !== "draft") throw new BooksError("Bill is already posted.");
  if (bill.total <= 0) throw new BooksError("Bill total must be positive.");
  const lines = billJournalLines(bill, accounts, { ppnCreditable: entity.tax.pkp });
  const journal = await postJournal(entityId, { date: bill.date, memo: `Bill ${bill.number} — ${bill.vendor.name}`, source: "bill", sourceId: bill.id, lines, createdByUserId: userId });
  const now = new Date().toISOString();
  const posted = (await db.update("bills", id, { status: bill.amountPayable <= 0 ? "paid" : "sent", journalId: journal.id, updatedAt: now }))!;
  // A line on a fixed-asset account registers the asset for review (lib/asset-auto.ts); a problem there never undoes the posting.
  await (await import("./asset-auto")).autoRegisterAssets(entityId, journal, { billId: bill.id }, accounts);
  return posted;
}

export async function voidBill(entityId: string, id: string): Promise<Bill> {
  const bill = await db.get("bills", id);
  if (!bill || bill.entityId !== entityId) throw new BooksError("Bill not found.");
  if (bill.status === "void") return bill;
  if (bill.amountPaid > 0) throw new BooksError("This bill has payments; void the payments first.");
  if (bill.journalId) await voidJournal(entityId, bill.journalId);
  const voided = (await db.update("bills", id, { status: "void", updatedAt: new Date().toISOString() }))!;
  // Assets registered from this bill leave the register, or are flagged when depreciation was already posted.
  if (bill.journalId) await (await import("./asset-auto")).releaseAssetsOfJournal(entityId, bill.journalId, `bill ${bill.number}`);
  return voided;
}

export interface DisbursementInput { billId: string; bankAccountId: string; date: string; amount: number; fxRate?: number; reference?: string; notes?: string; bankTransactionId?: string; method?: Payment["method"] }

/** Pays a bill: Dr AP / Cr bank (+ FX difference), updates amountPaid and status. */
export async function recordDisbursement(entityId: string, input: DisbursementInput, userId?: string): Promise<{ payment: Payment; bill: Bill; journal: JournalEntry }> {
  const [accounts, bill, bank] = await Promise.all([entityAccounts(entityId), db.get("bills", input.billId), db.get("bank_accounts", input.bankAccountId)]);
  if (!bill || bill.entityId !== entityId) throw new BooksError("Bill not found.");
  if (!bank || bank.entityId !== entityId) throw new BooksError("Bank account not found.");
  if (bill.status !== "sent" && bill.status !== "partial") throw new BooksError(`Bill is ${bill.status}; post it before recording a payment.`);
  const amount = roundMoney(input.amount, bill.currency);
  if (amount <= 0) throw new BooksError("Amount must be positive.");
  const outstanding = billOutstanding(bill);
  if (amount > outstanding + 0.005) throw new BooksError(`Amount exceeds the outstanding balance (${outstanding}).`);
  const fxRate = bill.currency === "IDR" ? 1 : (input.fxRate && input.fxRate > 0 ? input.fxRate : bill.fxRate);
  const lines = disbursementJournalLines({ bill, amount, fxRate, bankAccount: accountById(accounts, bank.accountId), accounts, reference: input.reference });
  const journal = await postJournal(entityId, { date: input.date, memo: `Payment ${bill.number} — ${bill.vendor.name}`, source: "disbursement", sourceId: bill.id, lines, createdByUserId: userId });
  const payment: Payment = {
    id: db.newId(), entityId, kind: "disbursement", date: input.date, amount, currency: bill.currency, fxRate, bankAccountId: bank.id, billId: bill.id, journalId: journal.id,
    bankTransactionId: input.bankTransactionId, reference: input.reference, method: input.method ?? "transfer", notes: input.notes, createdAt: new Date().toISOString(),
  };
  await db.insert("payments", payment);
  const amountPaid = roundMoney(bill.amountPaid + amount, bill.currency);
  const updated = (await db.update("bills", bill.id, { amountPaid, status: amountPaid >= bill.amountPayable ? "paid" : "partial", updatedAt: new Date().toISOString() }))!;
  if (input.bankTransactionId) await db.update("bank_transactions", input.bankTransactionId, { status: "matched", matchedJournalId: journal.id, matchedDocument: { type: "bill", id: bill.id } });
  return { payment, bill: updated, journal };
}

// ---------- Bank accounts, transfers, CSV import, matching ----------

export interface BankAccountInput {
  name: string; bankName?: string; accountNumber?: string; currency: string; openingBalance?: number; openingDate?: string;
  /** Existing GL account id, or omit and give `newAccount` to create one. */
  accountId?: string;
  newAccount?: { code: string; name: string; subtype: "bank" | "cash" };
}

export async function createBankAccount(entityId: string, input: BankAccountInput): Promise<BankAccount> {
  const accounts = await entityAccounts(entityId);
  let accountId = input.accountId;
  if (!accountId) {
    if (!input.newAccount) throw new BooksError("Choose a GL account or create a new one.");
    const gl = await createAccount(entityId, { code: input.newAccount.code, name: input.newAccount.name, type: "asset", subtype: input.newAccount.subtype });
    accountId = gl.id;
  } else {
    const gl = accountById(accounts, accountId);
    if (gl.subtype !== "bank" && gl.subtype !== "cash") throw new BooksError("The GL account must be a bank or cash account.");
  }
  const bank: BankAccount = { id: db.newId(), entityId, accountId, name: input.name, bankName: input.bankName, accountNumber: input.accountNumber, currency: input.currency, openingBalance: input.openingBalance, openingDate: input.openingDate, active: true };
  await db.insert("bank_accounts", bank);
  return bank;
}

export interface TransferInput {
  fromBankAccountId: string; toBankAccountId: string; date: string;
  /** Amount sent, in `currency` (usually the source account's currency), converted at `fxRate` (IDR per unit). */
  amount: number; currency: string; fxRate?: number;
  /** Cross-currency transfers: what arrived on the destination, in IDR and/or in the destination account's own currency. */
  toAmountIDR?: number; toAmount?: number;
  feeIDR?: number; reference?: string; bankTransactionId?: string;
}

/**
 * Foreign-currency legs of a transfer (the bank lines' `currency` / `fxAmount` / `fxRate`, shown by the reconciliation). The source
 * amount is known only when the money was sent in the source account's currency; the destination amount is the amount sent when both
 * sides are in the same currency, else `toAmount` when given. The destination rate is derived from the IDR that reached it, 4 decimals.
 */
export function transferFxLegs(p: { fromCurrency: string; toCurrency: string; amount: number; currency: string; fxRate: number; amountIDR: number; toAmountIDR?: number; toAmount?: number; feeIDR?: number }): { fromFx?: TransferFxLeg; toFx?: TransferFxLeg } {
  const rate4 = (idr: number, amt: number) => Math.round((idr / amt) * 10000) / 10000;
  const inIDR = roundMoney(p.toAmountIDR ?? p.amountIDR - (p.feeIDR ?? 0));
  const fromFx = p.fromCurrency !== "IDR" && p.currency === p.fromCurrency && p.amount > 0 ? { currency: p.fromCurrency, amount: p.amount, rate: p.fxRate } : undefined;
  const toAmount = p.toCurrency === p.currency ? p.toAmount ?? p.amount : p.toAmount;
  const toFx = p.toCurrency !== "IDR" && toAmount && toAmount > 0 && inIDR > 0 ? { currency: p.toCurrency, amount: toAmount, rate: rate4(inIDR, toAmount) } : undefined;
  return { fromFx, toFx };
}

export async function transfer(entityId: string, input: TransferInput, userId?: string): Promise<{ payment: Payment; journal: JournalEntry }> {
  const [accounts, from, to] = await Promise.all([entityAccounts(entityId), db.get("bank_accounts", input.fromBankAccountId), db.get("bank_accounts", input.toBankAccountId)]);
  if (!from || from.entityId !== entityId || !to || to.entityId !== entityId) throw new BooksError("Bank account not found.");
  if (from.id === to.id) throw new BooksError("Choose two different bank accounts.");
  const fxRate = input.currency === "IDR" ? 1 : (input.fxRate ?? 0);
  if (input.currency !== "IDR" && fxRate <= 0) throw new BooksError("An FX rate is required for a non-IDR transfer.");
  const amountIDR = toIDR(input.amount, input.currency, fxRate);
  if (amountIDR <= 0) throw new BooksError("Amount must be positive.");
  const feeAccount = findByCode(accounts, "6-2000");
  const legs = transferFxLegs({ fromCurrency: from.currency, toCurrency: to.currency, amount: input.amount, currency: input.currency, fxRate, amountIDR, toAmountIDR: input.toAmountIDR, toAmount: input.toAmount, feeIDR: input.feeIDR });
  const lines = transferJournalLines({ from: accountById(accounts, from.accountId), to: accountById(accounts, to.accountId), amountIDR, toAmountIDR: input.toAmountIDR, feeIDR: input.feeIDR, feeAccount, accounts, memo: `Transfer ${from.name} → ${to.name}${input.reference ? ` ${input.reference}` : ""}`, ...legs });
  const journal = await postJournal(entityId, { date: input.date, memo: `Transfer ${from.name} → ${to.name}`, source: "bank", lines, createdByUserId: userId });
  const payment: Payment = { id: db.newId(), entityId, kind: "transfer", date: input.date, amount: input.amount, currency: input.currency, fxRate, bankAccountId: from.id, toBankAccountId: to.id, journalId: journal.id, bankTransactionId: input.bankTransactionId, reference: input.reference, method: "transfer", createdAt: new Date().toISOString() };
  await db.insert("payments", payment);
  if (input.bankTransactionId) await db.update("bank_transactions", input.bankTransactionId, { status: "matched", matchedJournalId: journal.id, matchedDocument: { type: "transfer", id: payment.id } });
  return { payment, journal };
}

export function bankTransactionHash(bankAccountId: string, row: Pick<ParsedBankRow, "date" | "amount" | "description">): string {
  return sha256(`${bankAccountId}|${row.date}|${row.amount}|${row.description.trim().toLowerCase()}`);
}

/**
 * Stores parsed statement lines and records an ImportBatch. A line already stored is skipped: the same account,
 * date, amount and description, or, for a statement that prints its running balance, the same date and balance
 * with the same amount to the rupiah. The second rule recognises a statement imported before the reader improved
 * (its descriptions were shorter, so the first rule alone would store every line twice) and before rupiah cents were
 * kept: such a line gets the statement's exact amount back while it is not matched to anything
 * (`ImportBatch.updated`); a matched line is left as booked.
 */
export async function importBankCsv(entityId: string, input: { bankAccountId: string; fileName: string; rows: ParsedBankRow[]; errors?: string[] }, userId?: string): Promise<ImportBatch> {
  const bank = await db.get("bank_accounts", input.bankAccountId);
  if (!bank || bank.entityId !== entityId) throw new BooksError("Bank account not found.");
  const existing = await db.list("bank_transactions", { where: { entityId, bankAccountId: bank.id } });
  const seen = new Set(existing.map((t) => t.hash));
  const byHash = new Map(existing.map((t) => [t.hash, t]));
  const balanceKey = (date: string, balance: number) => `${date}|${roundMoney(balance, bank.currency)}`;
  const byBalance = new Map(existing.filter((t) => typeof t.balance === "number").map((t) => [balanceKey(t.date, t.balance as number), t]));
  /** An amount stored in whole rupiah by an earlier import gets its cents back, unless the line is already matched. */
  const restore = async (stored: BankTransaction | undefined, exact: number) => {
    if (!stored || stored.status === "matched" || stored.amount === exact || Math.abs(stored.amount - exact) >= 1) return;
    await db.update("bank_transactions", stored.id, { amount: exact });
    stored.amount = exact;
    batch.updated = (batch.updated ?? 0) + 1;
  };
  const batch: ImportBatch = { id: db.newId(), kind: "bank_csv", entityId, fileName: input.fileName, rows: input.rows.length + (input.errors?.length ?? 0), inserted: 0, skipped: 0, errors: [...(input.errors ?? [])], byUserId: userId, createdAt: new Date().toISOString() };
  const toInsert: BankTransaction[] = [];
  // Duplicate lines within one statement (two identical charges on the same day) are kept apart with a sequence suffix.
  const dupCounter = new Map<string, number>();
  for (const r of input.rows) {
    let hash = bankTransactionHash(bank.id, r);
    const n = (dupCounter.get(hash) ?? 0) + 1;
    dupCounter.set(hash, n);
    if (n > 1) hash = sha256(`${hash}|${n}`);
    const amount = roundMoney(r.amount, bank.currency);
    if (seen.has(hash)) { batch.skipped++; await restore(byHash.get(hash), amount); continue; }
    const twin = typeof r.balance === "number" ? byBalance.get(balanceKey(r.date, r.balance)) : undefined;
    if (twin && Math.abs(twin.amount - amount) < 1) { batch.skipped++; await restore(twin, amount); continue; }
    seen.add(hash);
    toInsert.push({ id: db.newId(), entityId, bankAccountId: bank.id, date: r.date, description: r.description, amount, balance: r.balance, reference: r.reference, hash, importBatchId: batch.id, status: "unmatched", createdAt: batch.createdAt });
  }
  batch.inserted = await db.insertMany("bank_transactions", toInsert);
  await db.insert("import_batches", batch);
  return batch;
}

export interface MatchInput { type: "invoice" | "bill"; id: string; /** Amount in the document currency (defaults to the bank line amount when currencies match). */ amount?: number; fxRate?: number }

/** Matches a bank line to an open invoice (money in) or bill (money out) by recording the receipt/disbursement. */
export async function matchBankTransaction(entityId: string, txId: string, input: MatchInput, userId?: string): Promise<JournalEntry> {
  const tx = await db.get("bank_transactions", txId);
  if (!tx || tx.entityId !== entityId) throw new BooksError("Bank transaction not found.");
  if (tx.status === "matched") throw new BooksError("This bank line is already matched.");
  const bank = await db.get("bank_accounts", tx.bankAccountId);
  if (!bank) throw new BooksError("Bank account not found.");
  const bankAmount = Math.abs(tx.amount);
  if (input.type === "invoice") {
    if (tx.amount <= 0) throw new BooksError("Only money in can be matched to an invoice.");
    const inv = await db.get("invoices", input.id);
    if (!inv || inv.entityId !== entityId) throw new BooksError("Invoice not found.");
    const sameCcy = inv.currency === bank.currency;
    const amount = input.amount && input.amount > 0 ? input.amount : sameCcy ? Math.min(bankAmount, invoiceOutstanding(inv)) : invoiceOutstanding(inv);
    const fxRate = inv.currency === "IDR" ? 1 : bank.currency === "IDR" ? bankAmount / amount : (input.fxRate ?? inv.fxRate);
    const r = await recordReceipt(entityId, { invoiceId: inv.id, bankAccountId: bank.id, date: tx.date, amount, fxRate, reference: tx.reference ?? tx.description.slice(0, 80), bankTransactionId: tx.id }, userId);
    return r.journal;
  }
  if (tx.amount >= 0) throw new BooksError("Only money out can be matched to a bill.");
  const bill = await db.get("bills", input.id);
  if (!bill || bill.entityId !== entityId) throw new BooksError("Bill not found.");
  const sameCcy = bill.currency === bank.currency;
  const amount = input.amount && input.amount > 0 ? input.amount : sameCcy ? Math.min(bankAmount, billOutstanding(bill)) : billOutstanding(bill);
  const fxRate = bill.currency === "IDR" ? 1 : bank.currency === "IDR" ? bankAmount / amount : (input.fxRate ?? bill.fxRate);
  const r = await recordDisbursement(entityId, { billId: bill.id, bankAccountId: bank.id, date: tx.date, amount, fxRate, reference: tx.reference ?? tx.description.slice(0, 80), bankTransactionId: tx.id }, userId);
  return r.journal;
}

/** Posts a bank line directly against a counter account (bank charges, interest, capital injection, owner drawings…). */
export async function postBankTransaction(entityId: string, txId: string, input: { counterAccountId: string; description?: string; fxRate?: number; counterpartyName?: string }, userId?: string): Promise<JournalEntry> {
  const tx = await db.get("bank_transactions", txId);
  if (!tx || tx.entityId !== entityId) throw new BooksError("Bank transaction not found.");
  if (tx.status === "matched") throw new BooksError("This bank line is already matched.");
  const [bank, accounts] = await Promise.all([db.get("bank_accounts", tx.bankAccountId), entityAccounts(entityId)]);
  if (!bank) throw new BooksError("Bank account not found.");
  const counter = accountById(accounts, input.counterAccountId);
  if (counter.id === bank.accountId) throw new BooksError("Pick a counter account other than the bank's own GL account.");
  const fxRate = bank.currency === "IDR" ? 1 : (input.fxRate ?? 0);
  if (bank.currency !== "IDR" && fxRate <= 0) throw new BooksError("An FX rate is required for a foreign-currency bank account.");
  const amountIDR = tx.amount >= 0 ? toIDR(tx.amount, bank.currency, fxRate) : -toIDR(-tx.amount, bank.currency, fxRate);
  const description = input.description?.trim() || tx.description;
  const lines = bankJournalLines({ bankAccount: accountById(accounts, bank.accountId), counterAccount: counter, amountIDR, description, counterpartyName: input.counterpartyName, currency: bank.currency, fxAmount: tx.amount, fxRate });
  const journal = await postJournal(entityId, { date: tx.date, memo: description, source: "bank", sourceId: tx.id, lines, createdByUserId: userId });
  await db.update("bank_transactions", tx.id, { status: "matched", matchedJournalId: journal.id, matchedDocument: { type: "journal", id: journal.id } });
  // A statement line booked straight to a fixed-asset account is a purchase: the asset is registered for review
  // (lib/asset-auto.ts); a problem there never undoes the posting.
  await (await import("./asset-auto")).autoRegisterAssets(entityId, journal, {}, accounts);
  return journal;
}

/** Links a bank line to an existing journal entry (e.g. a transfer or payroll journal already posted) without creating anything. */
export async function linkBankTransaction(entityId: string, txId: string, journalId: string): Promise<void> {
  const [tx, journal] = await Promise.all([db.get("bank_transactions", txId), db.get("journal_entries", journalId)]);
  if (!tx || tx.entityId !== entityId) throw new BooksError("Bank transaction not found.");
  if (!journal || journal.entityId !== entityId || journal.status !== "posted") throw new BooksError("Journal entry not found or not posted.");
  await db.update("bank_transactions", txId, { status: "matched", matchedJournalId: journal.id, matchedDocument: { type: "journal", id: journal.id } });
}

export async function setBankTransactionStatus(entityId: string, txId: string, status: "excluded" | "unmatched"): Promise<void> {
  const tx = await db.get("bank_transactions", txId);
  if (!tx || tx.entityId !== entityId) throw new BooksError("Bank transaction not found.");
  if (tx.status === "matched") throw new BooksError("Unmatch by voiding the linked journal or payment first.");
  await db.update("bank_transactions", txId, { status });
}

/** Unmatches a line whose journal has since been voided, or voids the quick journal that was created from the line. */
export async function unmatchBankTransaction(entityId: string, txId: string): Promise<void> {
  const tx = await db.get("bank_transactions", txId);
  if (!tx || tx.entityId !== entityId) throw new BooksError("Bank transaction not found.");
  if (tx.status !== "matched") return;
  const payments = await db.list("payments", { where: { entityId, bankTransactionId: txId } });
  for (const p of payments) await voidPayment(entityId, p.id);
  if (tx.matchedDocument?.type === "journal" && tx.matchedJournalId) {
    const j = await db.get("journal_entries", tx.matchedJournalId);
    if (j && j.status === "posted" && j.sourceId === tx.id) {
      await voidJournal(entityId, j.id);
      // An asset registered from that quick journal leaves the register, or is flagged when depreciation was posted.
      await (await import("./asset-auto")).releaseAssetsOfJournal(entityId, j.id, `bank entry ${j.number}`);
    }
  }
  await db.update("bank_transactions", txId, { status: "unmatched", matchedJournalId: undefined, matchedDocument: undefined });
}

// ---------- Fixed assets ----------

export interface AssetInput {
  name: string; assetAccountId: string; accumDeprAccountId: string; deprExpenseAccountId: string; acquisitionDate: string; cost: number; salvageValue?: number;
  fiscalGroup: FixedAsset["fiscalGroup"]; method?: FixedAsset["method"]; usefulLifeMonths?: number; billId?: string;
  /** Set by lib/asset-auto.ts for an asset registered from a posted purchase: it waits for review and may still lack its depreciation accounts. */
  sourceJournalId?: string; sourceLineIndex?: number; paymentId?: string; needsReview?: boolean; notes?: string;
  /**
   * Set by lib/asset-takeon-services.ts for an asset the ledger already carried (QuickBooks history, opening balances):
   * the accumulated depreciation the previous books posted and the last month they covered. The register starts from
   * there (`accumulatedDepreciation`, `depreciatedThrough`) and posts only the months after it.
   */
  takeOn?: { accumulated: number; through?: string; mode: "line" | "account"; byUserId?: string };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

/**
 * What the previous books had depreciated on an asset brought in from the ledger, checked against the asset: the
 * amount between zero and cost less salvage value, the month not before the acquisition month, and no amount without
 * the month it runs through (the schedule could not continue from it).
 */
function checkedTakeOn(p: { accumulated: number; through?: string; cost: number; salvageValue: number; acquisitionDate: string }): { accumulated: number; through?: string } {
  const accumulated = roundMoney(p.accumulated || 0);
  const through = p.through?.trim() || undefined;
  const room = roundMoney(p.cost - p.salvageValue);
  if (accumulated < 0 || accumulated > room + 0.005) throw new BooksError(`The accumulated depreciation to date must be between zero and the cost less the salvage value (${fmtMoney(room)}).`);
  if (through && !ISO_MONTH.test(through)) throw new BooksError("“Depreciated through” must be a month (YYYY-MM).");
  if (through && through < periodOf(p.acquisitionDate)) throw new BooksError(`“Depreciated through” (${through}) cannot be before the acquisition month (${periodOf(p.acquisitionDate)}).`);
  if (!through && accumulated >= 0.005) throw new BooksError("Enter the month the asset was depreciated through, or set the accumulated depreciation to zero when it was never depreciated.");
  return { accumulated: Math.min(accumulated, room), through };
}

/** Nothing is left to depreciate: everything but land with a useful life whose accumulated depreciation reached cost less salvage value. */
function fullyDepreciated(a: Pick<FixedAsset, "fiscalGroup" | "usefulLifeMonths" | "cost" | "salvageValue">, accumulated: number): boolean {
  return a.fiscalGroup !== "land" && a.usefulLifeMonths > 0 && accumulated > roundMoney(a.cost - a.salvageValue) - 0.005;
}

export async function createAsset(entityId: string, input: AssetInput): Promise<FixedAsset> {
  const accounts = await entityAccounts(entityId);
  for (const id of [input.assetAccountId, input.accumDeprAccountId, input.deprExpenseAccountId]) if (id || !input.needsReview) accountById(accounts, id);
  if (input.cost <= 0) throw new BooksError("Cost must be positive.");
  const usefulLifeMonths = input.fiscalGroup === "land" ? 0 : (input.usefulLifeMonths && input.usefulLifeMonths > 0 ? input.usefulLifeMonths : defaultUsefulLifeMonths(input.fiscalGroup));
  const cost = roundMoney(input.cost);
  const salvageValue = roundMoney(input.salvageValue ?? 0);
  const now = new Date().toISOString();
  const carried = input.takeOn ? checkedTakeOn({ ...input.takeOn, cost, salvageValue, acquisitionDate: input.acquisitionDate }) : undefined;
  const asset: FixedAsset = {
    id: db.newId(), entityId, name: input.name, assetAccountId: input.assetAccountId, accumDeprAccountId: input.accumDeprAccountId, deprExpenseAccountId: input.deprExpenseAccountId,
    acquisitionDate: input.acquisitionDate, cost, salvageValue, fiscalGroup: input.fiscalGroup,
    method: input.method ?? "straight_line", usefulLifeMonths, accumulatedDepreciation: carried?.accumulated ?? 0, depreciatedThrough: carried?.through, status: "active", billId: input.billId,
    sourceJournalId: input.sourceJournalId, sourceLineIndex: input.sourceLineIndex, paymentId: input.paymentId, needsReview: input.needsReview || undefined, notes: input.notes?.trim() || undefined,
    takeOn: carried && input.takeOn ? { ...carried, mode: input.takeOn.mode, at: now, byUserId: input.takeOn.byUserId } : undefined,
    createdAt: now,
  };
  await db.insert("fixed_assets", asset);
  return asset;
}

/**
 * Depreciation has been posted on the asset from this register: its schedule and its name (printed on those entries)
 * are fixed from then on. An asset brought in from the ledger starts with what the previous books had posted
 * (`takeOn`): only what the register added since counts.
 */
export function depreciationStarted(asset: Pick<FixedAsset, "accumulatedDepreciation" | "depreciatedThrough" | "takeOn">): boolean {
  if (asset.takeOn) return asset.accumulatedDepreciation > asset.takeOn.accumulated + 0.005 || (asset.depreciatedThrough ?? "") > (asset.takeOn.through ?? "");
  return asset.accumulatedDepreciation > 0 || Boolean(asset.depreciatedThrough);
}

export interface AssetUpdate {
  name?: string; fiscalGroup?: FixedAsset["fiscalGroup"]; method?: FixedAsset["method"]; usefulLifeMonths?: number; salvageValue?: number;
  assetAccountId?: string; accumDeprAccountId?: string; deprExpenseAccountId?: string; notes?: string;
  /** The accountant has checked the fiscal group, the useful life and the accounts: clears `needsReview`, so depreciation starts. */
  confirm?: boolean;
  /**
   * Only for an asset brought in from the ledger (`takeOn`) that still waits for review: what came from the ledger can
   * be corrected before it is confirmed. The journal date is often the migration date, not the purchase date, and an
   * asset standing for a whole account may need its cost adjusted.
   */
  acquisitionDate?: string; cost?: number;
  /** Accumulated depreciation the previous books carried, and the last month they depreciated (YYYY-MM); `null` = never depreciated: the schedule starts at the acquisition month. */
  takeOnAccumulated?: number; takeOnThrough?: string | null;
}

/**
 * Corrects or confirms an asset. What drives the schedule (fiscal group, method, useful life, salvage value) and the
 * name carried by the depreciation entries can change only while nothing has been depreciated from the register; the
 * accounts and the notes until the asset is disposed of. Cost and acquisition date are not edited here: they come
 * from the purchase. The exception is an asset brought in from the ledger (`takeOn`) that waits for review: its cost,
 * acquisition date, accumulated depreciation to date and "depreciated through" month are confirmed here too, and
 * lock once it is confirmed.
 */
export async function updateAsset(entityId: string, id: string, patch: AssetUpdate): Promise<FixedAsset> {
  const [accounts, asset] = await Promise.all([entityAccounts(entityId), db.get("fixed_assets", id)]);
  if (!asset || asset.entityId !== entityId) throw new BooksError("Asset not found.");
  if (asset.status === "disposed") throw new BooksError("A disposed asset can no longer be changed.");
  const name = patch.name === undefined ? asset.name : patch.name.trim();
  if (!name) throw new BooksError("Name is required.");
  const fiscalGroup = patch.fiscalGroup ?? asset.fiscalGroup;
  const land = fiscalGroup === "land";
  const method = land || FISCAL_ASSET_GROUPS[fiscalGroup].decliningRate === 0 ? "straight_line" : patch.method ?? asset.method;
  // A new group brings its own default life unless one is given with it.
  const life = patch.usefulLifeMonths ?? (fiscalGroup === asset.fiscalGroup ? asset.usefulLifeMonths : 0);
  const usefulLifeMonths = land ? 0 : life > 0 ? Math.trunc(life) : defaultUsefulLifeMonths(fiscalGroup);
  const reviewing = asset.takeOn && asset.needsReview ? asset.takeOn : undefined;
  const cost = patch.cost === undefined ? asset.cost : roundMoney(patch.cost);
  const acquisitionDate = patch.acquisitionDate ?? asset.acquisitionDate;
  const carriedChange = (patch.takeOnAccumulated !== undefined && Math.abs(roundMoney(patch.takeOnAccumulated) - (asset.takeOn?.accumulated ?? 0)) >= 0.005) || (patch.takeOnThrough !== undefined && (patch.takeOnThrough || undefined) !== asset.takeOn?.through);
  if (!reviewing && (Math.abs(cost - asset.cost) >= 0.005 || acquisitionDate !== asset.acquisitionDate || carriedChange)) {
    throw new BooksError(asset.takeOn ? "This asset is confirmed: its cost, acquisition date and the depreciation taken over from the previous books can no longer change." : "Cost and acquisition date come from the purchase and are not edited here.");
  }
  if (cost <= 0) throw new BooksError("Cost must be positive.");
  if (!ISO_DAY.test(acquisitionDate)) throw new BooksError("Acquisition date is required.");
  const salvageValue = roundMoney(patch.salvageValue ?? asset.salvageValue);
  if (salvageValue < 0 || salvageValue > cost) throw new BooksError("The salvage value must be between zero and the cost.");
  // A confirmed take-on already carries depreciation before the register posts any: the salvage value must leave room for it.
  if (!reviewing && asset.takeOn && asset.accumulatedDepreciation > roundMoney(cost - salvageValue) + 0.005) throw new BooksError(`The salvage value cannot be more than the cost less what is already depreciated (${fmtMoney(roundMoney(cost - asset.accumulatedDepreciation))}).`);
  const fixed = name !== asset.name || fiscalGroup !== asset.fiscalGroup || method !== asset.method || usefulLifeMonths !== asset.usefulLifeMonths || Math.abs(salvageValue - asset.salvageValue) >= 0.005;
  if (fixed && depreciationStarted(asset)) throw new BooksError("Depreciation is already posted on this asset: its name, fiscal group, method, useful life and salvage value can no longer change.");
  const ids = { assetAccountId: patch.assetAccountId ?? asset.assetAccountId, accumDeprAccountId: patch.accumDeprAccountId ?? asset.accumDeprAccountId, deprExpenseAccountId: patch.deprExpenseAccountId ?? asset.deprExpenseAccountId };
  for (const [key, accountId] of Object.entries(ids)) {
    if (!accountId) throw new BooksError(`Choose the ${key === "assetAccountId" ? "asset (cost)" : key === "accumDeprAccountId" ? "accumulated depreciation" : "depreciation expense"} account.`);
    accountById(accounts, accountId);
  }
  // What the previous books had depreciated, as corrected on review: the register starts from it.
  let carried: Partial<FixedAsset> = {};
  if (reviewing) {
    const through = patch.takeOnThrough === undefined ? reviewing.through : patch.takeOnThrough || undefined;
    // "Never depreciated" (no month) without an amount given clears the amount taken over with it.
    const amount = patch.takeOnAccumulated ?? (patch.takeOnThrough === null ? 0 : reviewing.accumulated);
    const checked = checkedTakeOn({ accumulated: amount, through, cost, salvageValue, acquisitionDate });
    carried = {
      cost, acquisitionDate, takeOn: { ...reviewing, ...checked }, accumulatedDepreciation: checked.accumulated, depreciatedThrough: checked.through,
      status: fullyDepreciated({ fiscalGroup, usefulLifeMonths, cost, salvageValue }, checked.accumulated) ? "fully_depreciated" : "active",
    };
  }
  return (await db.update("fixed_assets", id, {
    name, fiscalGroup, method, usefulLifeMonths, salvageValue, ...ids, ...carried,
    notes: patch.notes === undefined ? asset.notes : patch.notes.trim() || undefined, needsReview: patch.confirm ? false : asset.needsReview,
  }))!;
}

/** Takes an asset out of the register (a line on a fixed-asset account that was not a new asset, a duplicate): only while nothing is posted or filed on it. */
export async function deleteAsset(entityId: string, id: string): Promise<void> {
  const asset = await db.get("fixed_assets", id);
  if (!asset || asset.entityId !== entityId) throw new BooksError("Asset not found.");
  if (asset.status === "disposed" || depreciationStarted(asset)) throw new BooksError("Depreciation or a disposal is already posted on this asset: sell or dispose of it instead.");
  if (asset.attachments?.length) throw new BooksError("Remove the asset's attachments first.");
  await db.remove("fixed_assets", id);
}

/**
 * Posts depreciation for every active asset up to and including `period` (one journal dated the period's last
 * day). Idempotent: assets already depreciated through that period are skipped; skipped months are caught up.
 * Assets waiting for review (`needsReview`) and assets acquired after the period are left out. The automatic
 * monthly run (`opts.automatic`, lib/asset-auto.ts) also holds back the hand-registered assets it must not start on
 * its own and returns them under `held`. An asset brought in from the ledger (`takeOn`) is posted only for the months
 * after the one the previous books depreciated it through (`depreciationSchedule` continues from there), and is never held.
 */
export async function runDepreciation(entityId: string, period: string, userId?: string, opts: { automatic?: boolean } = {}): Promise<{ journal?: JournalEntry; runs: Array<{ asset: FixedAsset; amount: number; periods: string[] }>; held: FixedAsset[] }> {
  const [entity, accounts, assets] = await Promise.all([loadEntity(entityId), entityAccounts(entityId), db.list("fixed_assets", { where: { entityId, status: "active" } })]);
  if (!entity) throw new BooksError("Entity not found.");
  if (!/^\d{4}-\d{2}$/.test(period)) throw new BooksError("Period must be YYYY-MM.");
  const runs: Array<{ asset: FixedAsset; amount: number; periods: string[] }> = [];
  const held: FixedAsset[] = [];
  const hold = opts.automatic ? (await import("./asset-auto")).heldForFirstRun : undefined;
  for (const asset of assets) {
    if (asset.needsReview || periodOf(asset.acquisitionDate) > period) continue;
    const due = depreciationDue(asset, period, { fiscalYearStartMonth: entity.fiscalYearStartMonth });
    if (due.amount <= 0) continue;
    if (hold?.(asset, period)) { held.push(asset); continue; }
    runs.push({ asset, amount: due.amount, periods: due.periods });
  }
  if (runs.length === 0) return { runs, held };
  const [y, m] = period.split("-").map(Number);
  const date = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const lines = depreciationJournalLines(runs, accounts);
  const journal = await postJournal(entityId, { date, memo: `Depreciation ${period}`, source: "depreciation", sourceId: period, lines, createdByUserId: userId });
  for (const r of runs) {
    const accumulated = roundMoney(r.asset.accumulatedDepreciation + r.amount);
    const done = accumulated >= roundMoney(r.asset.cost - r.asset.salvageValue);
    await db.update("fixed_assets", r.asset.id, { accumulatedDepreciation: accumulated, depreciatedThrough: period, status: done ? "fully_depreciated" : "active" });
  }
  return { journal, runs, held };
}

export interface DisposalInput {
  date: string;
  /** IDR; zero or omitted when the asset is scrapped or written off. */
  proceeds?: number;
  /** Bank or cash account that received the proceeds; without one they go to other receivables (sold on credit). */
  bankAccountId?: string;
  /** The statement line (money in) that is the sale: its bank account receives the proceeds and the line is matched to the disposal entry. */
  bankTransactionId?: string;
}

/**
 * Sells, scraps or writes off an asset, with the figures of `disposalPreview` (lib/ledger.ts):
 * 1. depreciation that is behind is posted through the month before the disposal month (one journal dated that
 *    month's last day, source "depreciation", sourceId `<assetId>:catchup`), so the net book value is right;
 * 2. the disposal entry takes out cost and accumulated depreciation, books the proceeds and sends the difference to
 *    the dedicated gain or loss account, created on first use (lib/asset-auto.ts `disposalResultAccount`);
 * 3. the asset stays in the register as "disposed" with the entry (`disposalJournalId`) and its result
 *    (`disposalGainLoss`, positive = gain); a statement line given with the sale is matched to the entry.
 * An asset still waiting for review must be confirmed first: the catch-up depends on its group and useful life.
 */
export async function disposeAsset(entityId: string, assetId: string, input: DisposalInput, userId?: string): Promise<JournalEntry> {
  const [entity, accounts, found] = await Promise.all([loadEntity(entityId), entityAccounts(entityId), db.get("fixed_assets", assetId)]);
  if (!entity) throw new BooksError("Entity not found.");
  if (!found || found.entityId !== entityId) throw new BooksError("Asset not found.");
  let asset = found;
  if (asset.status === "disposed") throw new BooksError("Asset already disposed.");
  if (asset.needsReview) throw new BooksError("Confirm this asset first: it was registered automatically, and the depreciation up to the disposal depends on its fiscal group and useful life.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new BooksError("Disposal date is required.");
  if (input.date < asset.acquisitionDate) throw new BooksError("The disposal date is before the acquisition date.");
  const proceeds = roundMoney(input.proceeds ?? 0);
  if (proceeds < 0) throw new BooksError("Proceeds cannot be negative.");
  let tx: BankTransaction | null = null;
  let bankAccountId = input.bankAccountId;
  if (input.bankTransactionId) {
    tx = await db.get("bank_transactions", input.bankTransactionId);
    if (!tx || tx.entityId !== entityId) throw new BooksError("Bank statement line not found.");
    if (tx.status !== "unmatched") throw new BooksError(`This bank statement line is already ${tx.status}.`);
    if (tx.amount <= 0) throw new BooksError("Only money in can be the sale of an asset.");
    if (proceeds <= 0) throw new BooksError("Enter the proceeds received on the statement line.");
    bankAccountId = tx.bankAccountId;
  }
  let bank: BankAccount | null = null;
  let proceedsAccount: Account | undefined;
  if (proceeds > 0) {
    if (bankAccountId) {
      bank = await db.get("bank_accounts", bankAccountId);
      if (!bank || bank.entityId !== entityId) throw new BooksError("Bank account not found.");
      proceedsAccount = accountById(accounts, bank.accountId);
    } else proceedsAccount = findByCode(accounts, "1-1210") ?? requireTag(accounts, "ar_trade");
  }
  // The entry's bank line must be the statement line, or the reconciliation would not close (a foreign-currency line carries its own amount below).
  if (tx && bank?.currency === "IDR" && Math.abs(tx.amount - proceeds) >= 0.005) throw new BooksError(`The proceeds must equal the statement line (${fmtMoney(tx.amount)}).`);
  await assertPeriodOpen(entityId, input.date);

  const preview = disposalPreview(asset, input.date, proceeds, { fiscalYearStartMonth: entity.fiscalYearStartMonth });
  if (preview.catchUp.amount > 0) {
    try {
      await postJournal(entityId, { date: lastDayOfMonth(preview.through), memo: `Depreciation of ${asset.name} up to its disposal`, source: "depreciation", sourceId: `${asset.id}:catchup`, lines: depreciationJournalLines([{ asset, amount: preview.catchUp.amount }], accounts), createdByUserId: userId });
    } catch (e) {
      throw new BooksError(`Depreciation through ${preview.through} has to be posted before the disposal and could not be: ${errorMessage(e)}`);
    }
    const done = preview.accumulated >= roundMoney(asset.cost - asset.salvageValue);
    asset = (await db.update("fixed_assets", asset.id, { accumulatedDepreciation: preview.accumulated, depreciatedThrough: preview.through, status: done ? "fully_depreciated" : "active" }))!;
  }

  const result = preview.gainLoss === 0 ? undefined : await (await import("./asset-auto")).disposalResultAccount(entityId, accounts, preview.gainLoss > 0 ? "gain" : "loss");
  // Without a gain or a loss the template writes no result line, so the stand-in account is never used.
  const resultAccount = result ?? accountById(accounts, asset.assetAccountId);
  const lines = disposalJournalLines({ asset, proceedsIDR: proceeds, proceedsAccount, gainAccount: resultAccount, lossAccount: resultAccount, accounts });
  if (tx && bank && bank.currency !== "IDR") {
    // Sold into a foreign-currency account: the bank line keeps the statement amount and the implied rate for the reconciliation.
    const bankLine = lines.find((l) => l.accountId === bank.accountId && l.debit > 0);
    if (bankLine) Object.assign(bankLine, { currency: bank.currency, fxAmount: roundMoney(tx.amount, bank.currency), fxRate: Number((proceeds / tx.amount).toFixed(4)) });
  }
  const journal = await postJournal(entityId, { date: input.date, memo: `Disposal of ${asset.name}`, source: "adjustment", sourceId: asset.id, lines, createdByUserId: userId });
  await db.update("fixed_assets", assetId, { status: "disposed", disposedAt: input.date, disposalProceeds: proceeds, disposalJournalId: journal.id, disposalGainLoss: preview.gainLoss });
  if (tx) await linkBankTransaction(entityId, tx.id, journal.id);
  return journal;
}

// ---------- Periods ----------

export async function setPeriodLock(entityId: string, period: string, locked: boolean, userId?: string): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new BooksError("Period must be YYYY-MM.");
  const now = new Date().toISOString();
  await db.upsert("periods", { id: periodKey(entityId, period), entityId, period, locked, lockedByUserId: locked ? userId : undefined, lockedAt: locked ? now : undefined });
}

export async function lockPeriod(entityId: string, period: string, userId?: string) { return setPeriodLock(entityId, period, true, userId); }
export async function unlockPeriod(entityId: string, period: string, userId?: string) { return setPeriodLock(entityId, period, false, userId); }

/** Locks every month of the fiscal year up to `throughPeriod`. */
export async function lockThrough(entityId: string, periods: string[], throughPeriod: string, userId?: string): Promise<void> {
  for (const p of periods) if (p <= throughPeriod) await setPeriodLock(entityId, p, true, userId);
}

/**
 * Year-end close: moves the year's net profit to retained earnings (Dr/Cr every revenue and expense account to
 * zero, Cr/Dr retained earnings) dated the last day of the fiscal year, then locks the year. Optional in this
 * app because the balance sheet already presents prior-year earnings in retained earnings.
 */
export async function closeYear(entityId: string, fiscalYearEnd: string, userId?: string): Promise<JournalEntry | null> {
  const [entity, accounts, entries] = await Promise.all([loadEntity(entityId), entityAccounts(entityId), entityEntries(entityId)]);
  if (!entity) throw new BooksError("Entity not found.");
  const re = requireTag(accounts, "retained_earnings");
  const bal = accountBalances(entries, { to: fiscalYearEnd });
  const lines = [];
  let net = 0;
  for (const a of accounts) {
    if (a.type !== "revenue" && a.type !== "expense") continue;
    const b = bal.get(a.id);
    if (!b || b.net === 0) continue;
    lines.push({ accountId: a.id, accountCode: a.code, debit: b.net < 0 ? -b.net : 0, credit: b.net > 0 ? b.net : 0, description: "Year-end close" });
    net += b.net;
  }
  if (lines.length === 0) return null;
  lines.push({ accountId: re.id, accountCode: re.code, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, description: "Year-end close" });
  return postJournal(entityId, { date: fiscalYearEnd, memo: `Year-end close ${fiscalYearEnd.slice(0, 4)}`, source: "closing", lines, createdByUserId: userId });
}

// ---------- Convenience lookups for pages ----------

export async function openInvoices(entityId: string): Promise<Invoice[]> {
  return db.list("invoices", { where: (i) => i.entityId === entityId && (i.status === "sent" || i.status === "partial"), orderBy: "dueDate" });
}

export async function openBills(entityId: string): Promise<Bill[]> {
  return db.list("bills", { where: (b) => b.entityId === entityId && (b.status === "sent" || b.status === "partial"), orderBy: "dueDate" });
}

export function today(): string {
  return todayISO();
}

export { periodOf, findByTag };
