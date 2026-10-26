import type { BankAccount, BankTransaction, JournalEntry, JournalLine } from "./types";
import { lastDayOfMonth } from "./dates";

/**
 * Bank reconciliation for one account and one month, in the account's currency:
 *   balance per bank statement + ledger entries not yet on the statement = adjusted bank balance
 *   balance per books + statement lines not yet booked = adjusted book balance
 * Both must agree. Items dated on or before `bank.reconciledThrough` (the last sign-off) are settled and ignored.
 */

export interface ReconItem {
  id: string;
  date: string;
  ref: string;
  description: string;
  /** Signed from the bank's point of view: positive = money in. */
  amount: number;
  counterparty?: string;
  journalId?: string;
  txId?: string;
  approximate?: boolean;
}

export interface Reconciliation {
  period: string;
  endDate: string;
  currency: string;
  statementBalance: number | null;
  statementBalanceSource: "statement" | "manual" | "none";
  lastStatementDate?: string;
  ledgerBalance: number;
  ledgerApproximate: boolean;
  unbookedStatement: ReconItem[];
  unpresentedLedger: ReconItem[];
  clearedLedger: ReconItem[];
  sumUnbooked: number;
  sumUnpresented: number;
  adjustedBank: number | null;
  adjustedBooks: number;
  difference: number | null;
  balanced: boolean;
  matchedCount: number;
  excludedCount: number;
}

/** Movement of one journal line on the bank's GL account, in the bank account's currency. */
export function bankLineAmount(line: JournalLine, currency: string): { amount: number; approximate: boolean } {
  const idr = line.debit - line.credit;
  if (currency === "IDR") return { amount: idr, approximate: false };
  if (line.currency === currency && typeof line.fxAmount === "number") return { amount: (idr < 0 ? -1 : 1) * Math.abs(line.fxAmount), approximate: false };
  if (line.fxRate && line.fxRate > 0) return { amount: idr / line.fxRate, approximate: true };
  return { amount: idr, approximate: true };
}

export function roundMoney(n: number, currency: string): number {
  return currency === "IDR" ? Math.round(n) : Math.round(n * 100) / 100;
}

export function buildReconciliation(input: { bank: BankAccount; transactions: BankTransaction[]; entries: JournalEntry[]; period: string; statementBalance?: number }): Reconciliation {
  const { bank, period } = input;
  const ccy = bank.currency;
  const endDate = lastDayOfMonth(period);
  const settled = bank.reconciledThrough;
  const inWindow = (d: string) => d <= endDate && (!settled || d > settled);
  const round = (n: number) => roundMoney(n, ccy);

  // Books side: every posted movement on the bank's GL account up to the period end.
  const posted = input.entries.filter((e) => e.status === "posted" && e.entityId === bank.entityId && e.date <= endDate);
  let ledger = 0;
  let ledgerApproximate = false;
  const movement = (e: JournalEntry) => {
    let amount = 0; let approximate = false;
    for (const l of e.lines) if (l.accountId === bank.accountId) { const a = bankLineAmount(l, ccy); amount += a.amount; approximate ||= a.approximate; }
    return { amount: round(amount), approximate };
  };
  const touching = posted.filter((e) => e.lines.some((l) => l.accountId === bank.accountId));
  for (const e of touching) { const m = movement(e); ledger += m.amount; ledgerApproximate ||= m.approximate; }
  ledger = round(ledger);

  // Statement side.
  const txs = input.transactions.filter((t) => t.bankAccountId === bank.id);
  const upTo = txs.filter((t) => t.date <= endDate).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const lastWithBalance = [...upTo].reverse().find((t) => typeof t.balance === "number");
  let statementBalance: number | null = null;
  let statementBalanceSource: Reconciliation["statementBalanceSource"] = "none";
  if (typeof input.statementBalance === "number" && Number.isFinite(input.statementBalance)) { statementBalance = round(input.statementBalance); statementBalanceSource = "manual"; }
  else if (lastWithBalance) { statementBalance = round(lastWithBalance.balance as number); statementBalanceSource = "statement"; }

  const unbookedStatement: ReconItem[] = txs
    .filter((t) => t.status === "unmatched" && inWindow(t.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => ({ id: t.id, date: t.date, ref: t.reference ?? "", description: t.description, amount: round(t.amount), txId: t.id }));

  const matchedJournalIds = new Set(txs.filter((t) => t.status === "matched" && t.matchedJournalId).map((t) => t.matchedJournalId as string));
  const unpresentedLedger: ReconItem[] = [];
  const clearedLedger: ReconItem[] = [];
  for (const e of touching) {
    if (!inWindow(e.date) || matchedJournalIds.has(e.id)) continue;
    const m = movement(e);
    const item: ReconItem = { id: e.id, date: e.date, ref: e.number, description: e.memo, amount: m.amount, counterparty: e.lines.find((l) => l.counterpartyName)?.counterpartyName, journalId: e.id, approximate: m.approximate };
    (e.bankCleared?.[bank.id] ? clearedLedger : unpresentedLedger).push(item);
  }
  unpresentedLedger.sort((a, b) => a.date.localeCompare(b.date));
  clearedLedger.sort((a, b) => a.date.localeCompare(b.date));

  const sumUnbooked = round(unbookedStatement.reduce((s, i) => s + i.amount, 0));
  const sumUnpresented = round(unpresentedLedger.reduce((s, i) => s + i.amount, 0));
  const adjustedBooks = round(ledger + sumUnbooked);
  const adjustedBank = statementBalance === null ? null : round(statementBalance + sumUnpresented);
  const difference = adjustedBank === null ? null : round(adjustedBank - adjustedBooks);
  const tolerance = ccy === "IDR" ? 1 : 0.01;
  return {
    period, endDate, currency: ccy, statementBalance, statementBalanceSource, lastStatementDate: upTo.at(-1)?.date,
    ledgerBalance: ledger, ledgerApproximate, unbookedStatement, unpresentedLedger, clearedLedger, sumUnbooked, sumUnpresented,
    adjustedBank, adjustedBooks, difference, balanced: difference !== null && Math.abs(difference) <= tolerance,
    matchedCount: txs.filter((t) => t.status === "matched" && t.date <= endDate).length, excludedCount: txs.filter((t) => t.status === "excluded" && t.date <= endDate).length,
  };
}
