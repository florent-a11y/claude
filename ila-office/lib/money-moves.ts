/**
 * Expenses and deposits: money paid or received straight from a bank or cash account with no bill or invoice
 * behind it. Expenses are bank charges, loan repayments, tax payments, owner drawings…; deposits are capital
 * contributions, loans received, interest income, refunds…
 *
 * - An expense posts Dr each line's account / Cr the bank GL account; a deposit posts Dr bank / Cr each line.
 * - Each one is a `Payment` row (kind "disbursement" for an expense, "receipt" for a deposit, no billId/invoiceId)
 *   that carries its own `lines`, plus a journal with `source: "bank"` and `sourceId` = the payment id.
 * - Voiding voids the journal, keeps the payment row as `status: "void"` for the audit trail and releases any
 *   statement line that was matched to the journal.
 *
 * Everything above `recordMoneyMove` is pure (no database) so it can be unit-tested; see tests/money-moves.test.ts.
 */
import { db } from "./db";
import { assertPeriodOpen, postJournal, voidJournal } from "./posting";
import { accountById, jl } from "./ledger";
import { roundMoney, toIDR } from "./money";
import { BooksError, entityAccounts, linkBankTransaction } from "./books";
import type { Account, BankAccount, BankTransaction, JournalEntry, JournalLine, Payment } from "./types";

export type MoneyMoveKind = "expense" | "deposit";
export const MONEY_MOVE_LABEL: Record<MoneyMoveKind, string> = { expense: "Expense", deposit: "Deposit" };

export interface MoneyMoveLineInput { accountId: string; description?: string; amount: number }

export interface MoneyMoveInput {
  kind: MoneyMoveKind;
  bankAccountId: string;
  date: string;
  /** The other party: payee of an expense, payer of a deposit. Free text. */
  payee?: string;
  memo: string;
  reference?: string;
  method?: Payment["method"];
  /** IDR per 1 unit of the bank account's currency; ignored for IDR accounts. */
  fxRate?: number;
  /** Amounts in the bank account's currency. */
  lines: MoneyMoveLineInput[];
  /** Statement line this entry explains: it is matched to the new journal. */
  bankTransactionId?: string;
}

/** A payment recorded through the Expenses or Deposits menu, as opposed to a bill payment, invoice receipt or transfer. */
export function isMoneyMove(p: Pick<Payment, "kind" | "billId" | "invoiceId">): boolean {
  return (p.kind === "disbursement" || p.kind === "receipt") && !p.billId && !p.invoiceId;
}

export function moneyMoveKindOf(p: Pick<Payment, "kind">): MoneyMoveKind {
  return p.kind === "receipt" ? "deposit" : "expense";
}

export interface MoneyMoveLinesInput {
  kind: MoneyMoveKind;
  /** The bank account's GL account. */
  bankGl: Account;
  lines: Array<{ account: Account; description?: string; amount: number }>;
  currency: string;
  fxRate: number;
  payee?: string;
  memo: string;
}

/**
 * Expense: Dr each line / Cr bank. Deposit: Dr bank / Cr each line. Amounts are in `currency`; each line is
 * converted to IDR on its own and the bank line carries the sum of the rounded lines, so the entry always balances
 * even when converting the total would round differently.
 */
export function moneyMoveJournalLines(p: MoneyMoveLinesInput): JournalLine[] {
  const ccy = p.currency;
  const fx = (amount: number) => (ccy === "IDR" ? {} : { currency: ccy, fxAmount: roundMoney(amount, ccy), fxRate: p.fxRate });
  const cp = p.payee ? { counterpartyName: p.payee } : {};
  const counter: JournalLine[] = [];
  let total = 0;
  let totalIDR = 0;
  for (const l of p.lines) {
    const amount = roundMoney(l.amount, ccy);
    const idr = toIDR(amount, ccy, p.fxRate);
    total += amount;
    totalIDR += idr;
    const extra = { description: l.description?.trim() || p.memo, ...cp, ...fx(amount) };
    counter.push(p.kind === "expense" ? jl(l.account, idr, 0, extra) : jl(l.account, 0, idr, extra));
  }
  const bankExtra = { description: p.memo, ...cp, ...fx(total) };
  const bank = p.kind === "expense" ? jl(p.bankGl, 0, totalIDR, bankExtra) : jl(p.bankGl, totalIDR, 0, bankExtra);
  return p.kind === "expense" ? [...counter, bank] : [bank, ...counter];
}

/** Describes the first problem with the input, or returns null when it can be posted. */
export function validateMoneyMove(input: Pick<MoneyMoveInput, "kind" | "lines" | "fxRate">, accounts: Account[], bank: Pick<BankAccount, "accountId" | "currency">): string | null {
  if (!input.lines || input.lines.length === 0) return "Add at least one line.";
  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i];
    const n = i + 1;
    if (!l.accountId) return `Line ${n}: pick an account.`;
    const a = accounts.find((x) => x.id === l.accountId);
    if (!a) return `Line ${n}: account not found.`;
    if (!a.active) return `Line ${n}: account ${a.code} ${a.name} is inactive.`;
    if (a.id === bank.accountId) return `Line ${n}: ${a.code} ${a.name} is the bank account's own GL account; pick the ${input.kind === "expense" ? "expense, liability or asset" : "income, liability or equity"} account instead.`;
    if (typeof l.amount !== "number" || !Number.isFinite(l.amount) || l.amount <= 0) return `Line ${n}: the amount must be greater than zero.`;
  }
  if (bank.currency !== "IDR" && !(typeof input.fxRate === "number" && Number.isFinite(input.fxRate) && input.fxRate > 0)) return `An FX rate (IDR per 1 ${bank.currency}) is required for a ${bank.currency} account.`;
  return null;
}

/** Posts the journal, stores the payment and, when a statement line was given, matches it to the new journal. */
export async function recordMoneyMove(entityId: string, input: MoneyMoveInput, userId?: string): Promise<{ payment: Payment; journal: JournalEntry }> {
  const [bank, accounts] = await Promise.all([db.get("bank_accounts", input.bankAccountId), entityAccounts(entityId)]);
  if (!bank || bank.entityId !== entityId) throw new BooksError("Bank account not found.");
  if (!bank.active) throw new BooksError(`${bank.name} is inactive; reactivate it under Bank first.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new BooksError("Date is required.");
  const memo = input.memo?.trim();
  if (!memo) throw new BooksError("A memo is required.");
  const problem = validateMoneyMove(input, accounts, bank);
  if (problem) throw new BooksError(problem);
  const currency = bank.currency;
  const fxRate = currency === "IDR" ? 1 : (input.fxRate as number);
  const bankGl = accountById(accounts, bank.accountId);
  const lines = input.lines.map((l) => ({ account: accountById(accounts, l.accountId), description: l.description?.trim() || undefined, amount: roundMoney(l.amount, currency) }));
  const amount = roundMoney(lines.reduce((s, l) => s + l.amount, 0), currency);
  if (amount <= 0) throw new BooksError("Amount must be positive.");
  const payee = input.payee?.trim() || undefined;
  let tx: BankTransaction | null = null;
  if (input.bankTransactionId) {
    tx = await db.get("bank_transactions", input.bankTransactionId);
    if (!tx || tx.entityId !== entityId) throw new BooksError("Bank statement line not found.");
    if (tx.status === "matched") throw new BooksError("This bank statement line is already matched.");
    if (tx.bankAccountId !== bank.id) throw new BooksError("The statement line belongs to another bank account; pick that account.");
    if (input.kind === "expense" ? tx.amount >= 0 : tx.amount <= 0) throw new BooksError(input.kind === "expense" ? "This statement line is money in; record it as a deposit." : "This statement line is money out; record it as an expense.");
  }
  const paymentId = db.newId();
  const label = MONEY_MOVE_LABEL[input.kind];
  const journal = await postJournal(entityId, {
    date: input.date, memo: `${label}: ${memo}${payee ? ` — ${payee}` : ""}`, source: "bank", sourceId: paymentId,
    lines: moneyMoveJournalLines({ kind: input.kind, bankGl, lines, currency, fxRate, payee, memo }), createdByUserId: userId,
  });
  const payment: Payment = {
    id: paymentId, entityId, kind: input.kind === "expense" ? "disbursement" : "receipt", date: input.date, amount, currency, fxRate, bankAccountId: bank.id, journalId: journal.id,
    bankTransactionId: tx?.id, reference: input.reference?.trim() || undefined, method: input.method ?? (bankGl.subtype === "cash" ? "cash" : "transfer"),
    payee, memo, lines: lines.map((l) => ({ accountId: l.account.id, description: l.description, amount: l.amount })), status: "posted", createdByUserId: userId, createdAt: new Date().toISOString(),
  };
  await db.insert("payments", payment);
  if (tx) await linkBankTransaction(entityId, tx.id, journal.id);
  return { payment, journal };
}

/**
 * Voids an expense or deposit: the journal is voided, the payment row stays as "void", and every statement line
 * matched to that journal goes back to "unmatched" so it can be explained again. The statement line is released
 * here directly rather than through `unmatchBankTransaction`, which voids the payments linked to a line and would
 * call back into this function.
 */
export async function voidMoneyMove(entityId: string, paymentId: string): Promise<Payment> {
  const p = await db.get("payments", paymentId);
  if (!p || p.entityId !== entityId) throw new BooksError("Payment not found.");
  if (!isMoneyMove(p)) throw new BooksError("This payment belongs to an invoice or bill; reverse it from that document.");
  if (p.status === "void") return p;
  await assertPeriodOpen(entityId, p.date);
  const journal = p.journalId ? await db.get("journal_entries", p.journalId) : null;
  if (journal && journal.status === "posted") await voidJournal(entityId, journal.id);
  const updated = (await db.update("payments", p.id, { status: "void", voidedAt: new Date().toISOString() }))!;
  if (p.journalId) {
    const linked = await db.list("bank_transactions", { where: { entityId, status: "matched", matchedJournalId: p.journalId } });
    for (const tx of linked) await db.update("bank_transactions", tx.id, { status: "unmatched", matchedJournalId: undefined, matchedDocument: undefined });
  }
  return updated;
}
