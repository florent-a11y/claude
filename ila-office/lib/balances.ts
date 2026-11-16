import type { Account, JournalEntry } from "./types";
import { roundMoney } from "./money";

/**
 * Pure ledger arithmetic shared by Books (reports) and Tax (CIT, PPN, LKPM). No I/O: callers load the
 * entity's accounts and posted journal entries, then slice by date range here.
 */

export interface Balance { debit: number; credit: number; /** debit − credit */ net: number }

export function emptyBalance(): Balance {
  return { debit: 0, credit: 0, net: 0 };
}

/** Sums posted lines per account id within [from, to] (inclusive, ISO dates; omit either bound to open it). */
export function accountBalances(entries: JournalEntry[], range: { from?: string; to?: string } = {}): Map<string, Balance> {
  const out = new Map<string, Balance>();
  for (const e of entries) {
    if (e.status !== "posted") continue;
    if (range.from && e.date < range.from) continue;
    if (range.to && e.date > range.to) continue;
    for (const l of e.lines) {
      const b = out.get(l.accountId) ?? emptyBalance();
      b.debit += l.debit;
      b.credit += l.credit;
      b.net = b.debit - b.credit;
      out.set(l.accountId, b);
    }
  }
  // Amounts carry cents: round the sums once so float dust never shows as a balance (0.1 + 0.2 !== 0.3).
  for (const b of out.values()) { b.debit = roundMoney(b.debit); b.credit = roundMoney(b.credit); b.net = roundMoney(b.debit - b.credit); }
  return out;
}

/** Balance in the account's natural sign (assets/expenses positive when debit, the rest positive when credit). */
export function naturalBalance(account: Account, b: Balance | undefined): number {
  if (!b) return 0;
  return account.normalBalance === "debit" ? b.net : -b.net;
}

export interface TypeTotals { asset: number; liability: number; equity: number; revenue: number; expense: number }

/** Natural-sign totals by account type for a range (revenue/expense over the range, balance-sheet types cumulative when `from` is omitted). */
export function totalsByType(accounts: Account[], balances: Map<string, Balance>): TypeTotals {
  const t: TypeTotals = { asset: 0, liability: 0, equity: 0, revenue: 0, expense: 0 };
  for (const a of accounts) t[a.type] += naturalBalance(a, balances.get(a.id));
  for (const k of Object.keys(t) as Array<keyof TypeTotals>) t[k] = roundMoney(t[k]);
  return t;
}

/** Net profit for a range = revenue − expense (natural signs). */
export function netProfit(accounts: Account[], entries: JournalEntry[], range: { from?: string; to?: string }): number {
  const t = totalsByType(accounts, accountBalances(entries, range));
  return roundMoney(t.revenue - t.expense);
}

export function findByTag(accounts: Account[], tag: Account["taxTag"]): Account | undefined {
  return accounts.find((a) => a.taxTag === tag && a.active);
}

export function findByCode(accounts: Account[], code: string): Account | undefined {
  return accounts.find((a) => a.code === code);
}

/** Validates a set of journal lines: at least two, each with exactly one side, debits equal credits to the cent. */
export function validateLines(lines: Array<{ debit: number; credit: number; accountId: string }>): string | null {
  if (lines.length < 2) return "A journal entry needs at least two lines.";
  let d = 0, c = 0;
  for (const l of lines) {
    if (!l.accountId) return "Every line needs an account.";
    if (!Number.isFinite(l.debit) || !Number.isFinite(l.credit) || l.debit < 0 || l.credit < 0) return "Amounts must be non-negative numbers.";
    if ((l.debit > 0) === (l.credit > 0)) return "Each line must have either a debit or a credit, not both or neither.";
    d += l.debit; c += l.credit;
  }
  if (Math.round(d * 100) !== Math.round(c * 100)) return `Debits (${roundMoney(d)}) and credits (${roundMoney(c)}) do not balance.`;
  return null;
}
