/**
 * Books services: everything that reads or writes the database for the accounting module. Pure arithmetic and
 * posting templates live in lib/ledger.ts; journal persistence goes through lib/posting.ts (which enforces
 * period locks and balanced entries).
 */
import { db } from "./db";
import { postJournal, voidJournal, postedEntries } from "./posting";
import { accountBalances, findByTag, findByCode } from "./balances";
import { normalBalanceOf } from "./coa";
import { addWorkingDays, periodOf, todayISO } from "./dates";
import { roundMoney, toIDR } from "./money";
import { sha256 } from "./util";
import {
  invoiceTotals, billTotals, invoiceJournalLines, billJournalLines, receiptJournalLines, disbursementJournalLines, transferJournalLines,
  bankJournalLines, depreciationJournalLines, depreciationDue, disposalJournalLines, invoiceOutstanding, billOutstanding, requireTag, accountById, defaultUsefulLifeMonths,
  type ParsedBankRow,
} from "./ledger";
export { parseStatementDate, mapBankRows, type CsvMapping, type DateFormat, type ParsedBankRow } from "./ledger";
import type {
  Account, AccountSubtype, AccountType, Bill, BillLine, BankAccount, BankTransaction, Entity, FixedAsset, ImportBatch, Invoice, InvoiceLine, JournalEntry, Payment, TaxCode, TaxTag, WithholdingType,
} from "./types";

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

export interface InvoiceLineInput { description: string; qty: number; unitPrice: number; accountId: string; taxCode: TaxCode; serviceId?: string; projectId?: string }
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
  projectId?: string;
  quoteId?: string;
  dealId?: string;
  fakturNumber?: string;
}

function buildInvoice(entity: Entity, accounts: Account[], input: InvoiceInput, base: Pick<Invoice, "id" | "number" | "createdAt" | "amountPaid" | "status" | "journalId">): Invoice {
  if (input.lines.length === 0) throw new BooksError("An invoice needs at least one line.");
  const totals = invoiceTotals(input.lines, { discount: input.discount, pkp: entity.tax.pkp, ppnRate: entity.tax.ppnRate, currency: input.currency });
  const lines: InvoiceLine[] = input.lines.map((l, i) => {
    accountById(accounts, l.accountId);
    return { id: db.newId(), serviceId: l.serviceId, description: l.description, qty: l.qty, unitPrice: l.unitPrice, amount: totals.lineAmounts[i], accountId: l.accountId, taxCode: l.taxCode, projectId: l.projectId };
  });
  return {
    ...base, entityId: entity.id, customer: input.customer, date: input.date, dueDate: input.dueDate ?? addWorkingDays(input.date, 3), currency: input.currency, fxRate: input.currency === "IDR" ? 1 : input.fxRate,
    lines, subtotal: totals.subtotal, discount: totals.discount, ppnAmount: totals.ppnAmount, total: totals.total, notes: input.notes, paymentInstructions: input.paymentInstructions,
    projectId: input.projectId, quoteId: input.quoteId, dealId: input.dealId, fakturNumber: input.fakturNumber, updatedAt: new Date().toISOString(),
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

export interface BillLineInput { description: string; amount: number; accountId: string; taxCode: TaxCode; withholding: WithholdingType; withholdingRate?: number; projectId?: string }
export interface BillInput {
  vendor: Bill["vendor"];
  vendorInvoiceNumber?: string;
  date: string;
  dueDate?: string;
  currency: string;
  fxRate: number;
  lines: BillLineInput[];
  notes?: string;
  projectId?: string;
  fakturNumber?: string;
}

function buildBill(entity: Entity, accounts: Account[], input: BillInput, base: Pick<Bill, "id" | "number" | "createdAt" | "amountPaid" | "status" | "journalId">): Bill {
  if (input.lines.length === 0) throw new BooksError("A bill needs at least one line.");
  const totals = billTotals(input.lines, { ppnRate: entity.tax.ppnRate, currency: input.currency });
  const lines: BillLine[] = input.lines.map((l, i) => {
    accountById(accounts, l.accountId);
    const t = totals.lines[i];
    return { id: db.newId(), description: l.description, amount: t.amount, accountId: l.accountId, taxCode: l.taxCode, withholding: l.withholding, withholdingRate: l.withholding === "none" ? undefined : t.withholdingRate, withholdingAmount: l.withholding === "none" ? undefined : t.withholdingAmount, projectId: l.projectId };
  });
  return {
    ...base, entityId: entity.id, vendor: input.vendor, vendorInvoiceNumber: input.vendorInvoiceNumber, date: input.date, dueDate: input.dueDate ?? input.date, currency: input.currency, fxRate: input.currency === "IDR" ? 1 : input.fxRate,
    lines, subtotal: totals.subtotal, ppnInput: totals.ppnInput, withholdingTotal: totals.withholdingTotal, total: totals.total, amountPayable: totals.amountPayable,
    notes: input.notes, projectId: input.projectId, fakturNumber: input.fakturNumber, updatedAt: new Date().toISOString(),
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
  return (await db.update("bills", id, { status: bill.amountPayable <= 0 ? "paid" : "sent", journalId: journal.id, updatedAt: now }))!;
}

export async function voidBill(entityId: string, id: string): Promise<Bill> {
  const bill = await db.get("bills", id);
  if (!bill || bill.entityId !== entityId) throw new BooksError("Bill not found.");
  if (bill.status === "void") return bill;
  if (bill.amountPaid > 0) throw new BooksError("This bill has payments; void the payments first.");
  if (bill.journalId) await voidJournal(entityId, bill.journalId);
  return (await db.update("bills", id, { status: "void", updatedAt: new Date().toISOString() }))!;
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

export interface TransferInput { fromBankAccountId: string; toBankAccountId: string; date: string; amount: number; currency: string; fxRate?: number; toAmountIDR?: number; feeIDR?: number; reference?: string; bankTransactionId?: string }

export async function transfer(entityId: string, input: TransferInput, userId?: string): Promise<{ payment: Payment; journal: JournalEntry }> {
  const [accounts, from, to] = await Promise.all([entityAccounts(entityId), db.get("bank_accounts", input.fromBankAccountId), db.get("bank_accounts", input.toBankAccountId)]);
  if (!from || from.entityId !== entityId || !to || to.entityId !== entityId) throw new BooksError("Bank account not found.");
  if (from.id === to.id) throw new BooksError("Choose two different bank accounts.");
  const fxRate = input.currency === "IDR" ? 1 : (input.fxRate ?? 0);
  if (input.currency !== "IDR" && fxRate <= 0) throw new BooksError("An FX rate is required for a non-IDR transfer.");
  const amountIDR = toIDR(input.amount, input.currency, fxRate);
  if (amountIDR <= 0) throw new BooksError("Amount must be positive.");
  const feeAccount = findByCode(accounts, "6-2000");
  const lines = transferJournalLines({ from: accountById(accounts, from.accountId), to: accountById(accounts, to.accountId), amountIDR, toAmountIDR: input.toAmountIDR, feeIDR: input.feeIDR, feeAccount, accounts, memo: `Transfer ${from.name} → ${to.name}${input.reference ? ` ${input.reference}` : ""}` });
  const journal = await postJournal(entityId, { date: input.date, memo: `Transfer ${from.name} → ${to.name}`, source: "bank", lines, createdByUserId: userId });
  const payment: Payment = { id: db.newId(), entityId, kind: "transfer", date: input.date, amount: input.amount, currency: input.currency, fxRate, bankAccountId: from.id, toBankAccountId: to.id, journalId: journal.id, bankTransactionId: input.bankTransactionId, reference: input.reference, method: "transfer", createdAt: new Date().toISOString() };
  await db.insert("payments", payment);
  if (input.bankTransactionId) await db.update("bank_transactions", input.bankTransactionId, { status: "matched", matchedJournalId: journal.id, matchedDocument: { type: "transfer", id: payment.id } });
  return { payment, journal };
}

export function bankTransactionHash(bankAccountId: string, row: Pick<ParsedBankRow, "date" | "amount" | "description">): string {
  return sha256(`${bankAccountId}|${row.date}|${row.amount}|${row.description.trim().toLowerCase()}`);
}

/** Stores parsed statement lines, skipping duplicates (same account, date, amount and description), and records an ImportBatch. */
export async function importBankCsv(entityId: string, input: { bankAccountId: string; fileName: string; rows: ParsedBankRow[]; errors?: string[] }, userId?: string): Promise<ImportBatch> {
  const bank = await db.get("bank_accounts", input.bankAccountId);
  if (!bank || bank.entityId !== entityId) throw new BooksError("Bank account not found.");
  const existing = await db.list("bank_transactions", { where: { entityId, bankAccountId: bank.id } });
  const seen = new Set(existing.map((t) => t.hash));
  const batch: ImportBatch = { id: db.newId(), kind: "bank_csv", entityId, fileName: input.fileName, rows: input.rows.length + (input.errors?.length ?? 0), inserted: 0, skipped: 0, errors: [...(input.errors ?? [])], byUserId: userId, createdAt: new Date().toISOString() };
  const toInsert: BankTransaction[] = [];
  // Duplicate lines within one statement (two identical charges on the same day) are kept apart with a sequence suffix.
  const dupCounter = new Map<string, number>();
  for (const r of input.rows) {
    let hash = bankTransactionHash(bank.id, r);
    const n = (dupCounter.get(hash) ?? 0) + 1;
    dupCounter.set(hash, n);
    if (n > 1) hash = sha256(`${hash}|${n}`);
    if (seen.has(hash)) { batch.skipped++; continue; }
    seen.add(hash);
    toInsert.push({ id: db.newId(), entityId, bankAccountId: bank.id, date: r.date, description: r.description, amount: roundMoney(r.amount, bank.currency), balance: r.balance, reference: r.reference, hash, importBatchId: batch.id, status: "unmatched", createdAt: batch.createdAt });
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
    if (j && j.status === "posted" && j.sourceId === tx.id) await voidJournal(entityId, j.id);
  }
  await db.update("bank_transactions", txId, { status: "unmatched", matchedJournalId: undefined, matchedDocument: undefined });
}

// ---------- Fixed assets ----------

export interface AssetInput {
  name: string; assetAccountId: string; accumDeprAccountId: string; deprExpenseAccountId: string; acquisitionDate: string; cost: number; salvageValue?: number;
  fiscalGroup: FixedAsset["fiscalGroup"]; method?: FixedAsset["method"]; usefulLifeMonths?: number; billId?: string;
}

export async function createAsset(entityId: string, input: AssetInput): Promise<FixedAsset> {
  const accounts = await entityAccounts(entityId);
  for (const id of [input.assetAccountId, input.accumDeprAccountId, input.deprExpenseAccountId]) accountById(accounts, id);
  if (input.cost <= 0) throw new BooksError("Cost must be positive.");
  const usefulLifeMonths = input.fiscalGroup === "land" ? 0 : (input.usefulLifeMonths && input.usefulLifeMonths > 0 ? input.usefulLifeMonths : defaultUsefulLifeMonths(input.fiscalGroup));
  const asset: FixedAsset = {
    id: db.newId(), entityId, name: input.name, assetAccountId: input.assetAccountId, accumDeprAccountId: input.accumDeprAccountId, deprExpenseAccountId: input.deprExpenseAccountId,
    acquisitionDate: input.acquisitionDate, cost: roundMoney(input.cost), salvageValue: roundMoney(input.salvageValue ?? 0), fiscalGroup: input.fiscalGroup,
    method: input.method ?? "straight_line", usefulLifeMonths, accumulatedDepreciation: 0, status: "active", billId: input.billId, createdAt: new Date().toISOString(),
  };
  await db.insert("fixed_assets", asset);
  return asset;
}

/**
 * Posts depreciation for every active asset up to and including `period` (one journal dated the period's last
 * day). Idempotent: assets already depreciated through that period are skipped; skipped months are caught up.
 */
export async function runDepreciation(entityId: string, period: string, userId?: string): Promise<{ journal?: JournalEntry; runs: Array<{ asset: FixedAsset; amount: number; periods: string[] }> }> {
  const [entity, accounts, assets] = await Promise.all([loadEntity(entityId), entityAccounts(entityId), db.list("fixed_assets", { where: { entityId, status: "active" } })]);
  if (!entity) throw new BooksError("Entity not found.");
  if (!/^\d{4}-\d{2}$/.test(period)) throw new BooksError("Period must be YYYY-MM.");
  const runs: Array<{ asset: FixedAsset; amount: number; periods: string[] }> = [];
  for (const asset of assets) {
    const due = depreciationDue(asset, period, { fiscalYearStartMonth: entity.fiscalYearStartMonth });
    if (due.amount > 0) runs.push({ asset, amount: due.amount, periods: due.periods });
  }
  if (runs.length === 0) return { runs };
  const [y, m] = period.split("-").map(Number);
  const date = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const lines = depreciationJournalLines(runs, accounts);
  const journal = await postJournal(entityId, { date, memo: `Depreciation ${period}`, source: "depreciation", sourceId: period, lines, createdByUserId: userId });
  for (const r of runs) {
    const accumulated = roundMoney(r.asset.accumulatedDepreciation + r.amount);
    const done = accumulated >= roundMoney(r.asset.cost - r.asset.salvageValue);
    await db.update("fixed_assets", r.asset.id, { accumulatedDepreciation: accumulated, depreciatedThrough: period, status: done ? "fully_depreciated" : "active" });
  }
  return { journal, runs };
}

export async function disposeAsset(entityId: string, assetId: string, input: { date: string; proceeds?: number; bankAccountId?: string }, userId?: string): Promise<JournalEntry> {
  const [accounts, asset] = await Promise.all([entityAccounts(entityId), db.get("fixed_assets", assetId)]);
  if (!asset || asset.entityId !== entityId) throw new BooksError("Asset not found.");
  if (asset.status === "disposed") throw new BooksError("Asset already disposed.");
  const proceeds = roundMoney(input.proceeds ?? 0);
  let proceedsAccount: Account | undefined;
  if (proceeds > 0) {
    if (input.bankAccountId) {
      const bank = await db.get("bank_accounts", input.bankAccountId);
      if (!bank || bank.entityId !== entityId) throw new BooksError("Bank account not found.");
      proceedsAccount = accountById(accounts, bank.accountId);
    } else proceedsAccount = findByCode(accounts, "1-1210") ?? requireTag(accounts, "ar_trade");
  }
  const gain = findByCode(accounts, "7-1200") ?? accounts.find((a) => a.subtype === "other_income" && a.active);
  const loss = findByCode(accounts, "8-1200") ?? accounts.find((a) => a.subtype === "other_expense" && a.active);
  if (!gain || !loss) throw new BooksError("Add an 'Other income' and an 'Other expenses' account before disposing assets.");
  const lines = disposalJournalLines({ asset, proceedsIDR: proceeds, proceedsAccount, gainAccount: gain, lossAccount: loss, accounts });
  const journal = await postJournal(entityId, { date: input.date, memo: `Disposal of ${asset.name}`, source: "adjustment", sourceId: asset.id, lines, createdByUserId: userId });
  await db.update("fixed_assets", assetId, { status: "disposed", disposedAt: input.date, disposalProceeds: proceeds });
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
