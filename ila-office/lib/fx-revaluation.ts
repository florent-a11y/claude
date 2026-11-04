/**
 * Month-end revaluation of foreign-currency bank and cash accounts (PSAK 10 / IAS 21 monetary items at the
 * closing rate). Pure: the page previews with it and the action posts its lines; see tests/fx-revaluation.test.ts.
 *
 * For every bank account whose currency is not IDR:
 *   foreign balance   = sum of the account's movements in its currency up to the period end (each journal line's
 *                       `fxAmount` when it carries one, else converted from IDR at the line's rate — flagged ≈),
 *                       or the balance typed by the accountant (the statement balance) when given;
 *   book value (IDR)  = sum of the account's IDR debits − credits up to the period end;
 *   revalued (IDR)    = foreign balance × closing rate (Bank Indonesia mid rate of the last day of the month);
 *   difference        = revalued − book value → Dr bank / Cr unrealised FX gain, or Dr unrealised FX loss / Cr bank.
 * The entry is dated the last day of the month with source "fx" and sourceId `fx-revaluation:<period>`, one per
 * month. It is not reversed: the account now stands at the closing rate and the next month revalues from there, so
 * realised differences on later payments are measured against the latest closing rate. Receivables and payables in
 * foreign currency are not revalued here (their gain or loss is booked on receipt or payment against the document rate).
 */
import { bankLineAmount } from "./reconciliation";
import { jl } from "./ledger";
import { lastDayOfMonth } from "./dates";
import { roundMoney } from "./money";
import type { Account, BankAccount, JournalEntry, JournalLine } from "./types";

export const REVALUATION_SOURCE_PREFIX = "fx-revaluation:";
export function revaluationSourceId(period: string): string { return `${REVALUATION_SOURCE_PREFIX}${period}`; }

export interface RevaluationRow {
  bank: BankAccount;
  account: Account;
  currency: string;
  /** Balance in the account's currency at the period end. */
  fcBalance: number;
  /** Some movements had no foreign amount and were converted from IDR at their journal rate. */
  fcApproximate: boolean;
  /** The foreign balance was typed (statement balance) rather than taken from the ledger. */
  fcOverridden: boolean;
  /** Ledger balance in IDR before revaluation. */
  bookIDR: number;
  /** Closing rate, IDR per 1 unit; null when none is known yet. */
  rate: number | null;
  revaluedIDR: number | null;
  /** revalued − book: positive = unrealised gain. */
  difference: number | null;
  /** Implied rate the account currently stands at (book / foreign balance). */
  bookRate: number | null;
}

export interface RevaluationInput {
  period: string;
  banks: BankAccount[];
  accounts: Account[];
  entries: JournalEntry[];
  /** Closing rate per currency (IDR per unit). */
  rates: Record<string, number | undefined>;
  /** Foreign balance per bank account id, when the accountant types the statement balance. */
  overrides?: Record<string, number | undefined>;
}

export interface Revaluation {
  period: string;
  endDate: string;
  rows: RevaluationRow[];
  /** Sum of the positive differences / of the negative ones (as a positive number). */
  unrealisedGain: number;
  unrealisedLoss: number;
  /** Rows with a rate and a difference of at least one rupiah: what the entry will carry. */
  postable: RevaluationRow[];
  /** Currencies in use without a closing rate. */
  missingRates: string[];
}

/** Foreign and IDR balance of a bank account from the ledger up to a date. */
export function bankBalances(bank: BankAccount, entries: JournalEntry[], endDate: string): { fc: number; approximate: boolean; idr: number } {
  let fc = 0, idr = 0, approximate = false;
  for (const e of entries) {
    if (e.status !== "posted" || e.entityId !== bank.entityId || e.date > endDate) continue;
    for (const l of e.lines) {
      if (l.accountId !== bank.accountId) continue;
      idr += l.debit - l.credit;
      const a = bankLineAmount(l, bank.currency);
      fc += a.amount;
      approximate ||= a.approximate;
    }
  }
  return { fc: roundMoney(fc, bank.currency), approximate, idr: roundMoney(idr) };
}

export function buildRevaluation(input: RevaluationInput): Revaluation {
  const endDate = lastDayOfMonth(input.period);
  const rows: RevaluationRow[] = [];
  for (const bank of [...input.banks].sort((a, b) => a.name.localeCompare(b.name))) {
    if (bank.currency === "IDR") continue;
    const account = input.accounts.find((a) => a.id === bank.accountId);
    if (!account) continue;
    const bal = bankBalances(bank, input.entries, endDate);
    const override = input.overrides?.[bank.id];
    const fcOverridden = typeof override === "number" && Number.isFinite(override);
    const fcBalance = fcOverridden ? roundMoney(override as number, bank.currency) : bal.fc;
    const rate = input.rates[bank.currency];
    const hasRate = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
    const revaluedIDR = hasRate ? roundMoney(fcBalance * (rate as number)) : null;
    rows.push({
      bank, account, currency: bank.currency, fcBalance, fcApproximate: !fcOverridden && bal.approximate, fcOverridden, bookIDR: bal.idr,
      rate: hasRate ? (rate as number) : null, revaluedIDR, difference: revaluedIDR === null ? null : roundMoney(revaluedIDR - bal.idr),
      bookRate: fcBalance !== 0 ? Math.round((bal.idr / fcBalance) * 10000) / 10000 : null,
    });
  }
  const postable = rows.filter((r) => r.difference !== null && Math.abs(r.difference) >= 1);
  const unrealisedGain = roundMoney(postable.filter((r) => (r.difference as number) > 0).reduce((s, r) => s + (r.difference as number), 0));
  const unrealisedLoss = roundMoney(postable.filter((r) => (r.difference as number) < 0).reduce((s, r) => s - (r.difference as number), 0));
  const missingRates = [...new Set(rows.filter((r) => r.rate === null).map((r) => r.currency))];
  return { period: input.period, endDate, rows, unrealisedGain, unrealisedLoss, postable, missingRates };
}

/**
 * Journal lines of the revaluation. The bank leg carries the account's currency with a zero foreign amount at the
 * closing rate, so the bank reconciliation sees no movement in the account's currency, only the IDR step.
 */
export function revaluationJournalLines(rev: Revaluation, gainAccount: Account, lossAccount: Account): JournalLine[] {
  const lines: JournalLine[] = [];
  for (const r of rev.postable) {
    const diff = r.difference as number;
    const memo = `Revaluation ${r.bank.name} ${r.currency} ${r.fcBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} at ${r.rate}`;
    const fx = { currency: r.currency, fxAmount: 0, fxRate: r.rate as number };
    if (diff > 0) {
      lines.push(jl(r.account, diff, 0, { description: memo, ...fx }));
      lines.push(jl(gainAccount, 0, diff, { description: `Unrealised FX gain ${r.bank.name}` }));
    } else {
      lines.push(jl(lossAccount, -diff, 0, { description: `Unrealised FX loss ${r.bank.name}` }));
      lines.push(jl(r.account, 0, -diff, { description: memo, ...fx }));
    }
  }
  return lines;
}

/** The revaluation entry already posted for a month, if any. */
export function existingRevaluation(entries: JournalEntry[], period: string): JournalEntry | undefined {
  const id = revaluationSourceId(period);
  return entries.find((e) => e.status === "posted" && e.source === "fx" && e.sourceId === id);
}
