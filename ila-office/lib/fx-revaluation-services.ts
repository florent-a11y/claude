/**
 * Posting side of the month-end FX revaluation (lib/fx-revaluation.ts holds the arithmetic): loads a month's
 * data, makes sure the unrealised gain/loss accounts exist, posts the entry and voids it again.
 */
import { db } from "./db";
import { BooksError, createAccount, entityAccounts, entityEntries } from "./books";
import { findByTag } from "./balances";
import { periodLabel } from "./dates";
import { postJournal, voidJournal } from "./posting";
import { buildRevaluation, existingRevaluation, revaluationJournalLines, revaluationSourceId, type Revaluation, type RevaluationInput } from "./fx-revaluation";
import type { Account, BankAccount, JournalEntry } from "./types";

export interface RevaluationData { banks: BankAccount[]; accounts: Account[]; entries: JournalEntry[] }

/** Active foreign-currency bank accounts, the chart and the posted entries of an entity. */
export async function loadRevaluationData(entityId: string): Promise<RevaluationData> {
  const [banks, accounts, entries] = await Promise.all([db.list("bank_accounts", { where: { entityId } }), entityAccounts(entityId), entityEntries(entityId)]);
  return { banks: banks.filter((b) => b.active && b.currency !== "IDR"), accounts, entries };
}

/** The first free code starting from `code` ("7-1110", then 7-1111, …). */
function freeCode(accounts: Account[], code: string): string {
  const [group, n] = code.split("-");
  let num = Number(n);
  while (accounts.some((a) => a.code === `${group}-${num}`)) num++;
  return `${group}-${num}`;
}

/**
 * Unrealised FX gain (revenue, fx_gain) and loss (expense, fx_loss) accounts, created on first use in books opened
 * before they were part of the chart template (the realised 7-1100 / 8-1100 accounts stay for receipts and payments).
 */
export async function ensureUnrealisedAccounts(entityId: string, accounts: Account[]): Promise<{ gain: Account; loss: Account; accounts: Account[] }> {
  let list = accounts;
  let gain = findByTag(list, "fx_unrealised_gain");
  if (!gain) {
    gain = await createAccount(entityId, { code: freeCode(list, "7-1110"), name: "Unrealised foreign exchange gain", nameId: "Laba selisih kurs belum direalisasi", type: "revenue", subtype: "fx_gain", taxTag: "fx_unrealised_gain" });
    list = [...list, gain];
  }
  let loss = findByTag(list, "fx_unrealised_loss");
  if (!loss) {
    loss = await createAccount(entityId, { code: freeCode(list, "8-1110"), name: "Unrealised foreign exchange loss", nameId: "Rugi selisih kurs belum direalisasi", type: "expense", subtype: "fx_loss", taxTag: "fx_unrealised_loss" });
    list = [...list, loss];
  }
  return { gain, loss, accounts: list };
}

export interface PostRevaluationInput { period: string; rates: RevaluationInput["rates"]; overrides?: RevaluationInput["overrides"] }

/** Posts the month's revaluation entry (one per month: void the existing one first to redo it). */
export async function postRevaluation(entityId: string, input: PostRevaluationInput, userId?: string): Promise<{ journal: JournalEntry; revaluation: Revaluation }> {
  if (!/^\d{4}-\d{2}$/.test(input.period)) throw new BooksError("Period must be YYYY-MM.");
  const data = await loadRevaluationData(entityId);
  const existing = existingRevaluation(data.entries, input.period);
  if (existing) throw new BooksError(`${periodLabel(input.period)} was already revalued (${existing.number}); void that entry first to post it again.`);
  const rev = buildRevaluation({ period: input.period, banks: data.banks, accounts: data.accounts, entries: data.entries, rates: input.rates, overrides: input.overrides });
  if (rev.rows.length === 0) throw new BooksError("No active foreign-currency bank or cash account to revalue.");
  if (rev.missingRates.length) throw new BooksError(`Enter the closing rate for ${rev.missingRates.join(", ")}.`);
  if (rev.postable.length === 0) throw new BooksError("Nothing to post: every account already stands at the closing rate.");
  const { gain, loss } = await ensureUnrealisedAccounts(entityId, data.accounts);
  const journal = await postJournal(entityId, {
    date: rev.endDate, memo: `FX revaluation ${periodLabel(input.period)} at Bank Indonesia closing rates`, source: "fx", sourceId: revaluationSourceId(input.period),
    lines: revaluationJournalLines(rev, gain, loss), createdByUserId: userId,
  });
  return { journal, revaluation: rev };
}

/** Voids the month's revaluation entry so it can be posted again (e.g. after a late bank entry). */
export async function voidRevaluation(entityId: string, period: string): Promise<JournalEntry> {
  const entries = await entityEntries(entityId);
  const existing = existingRevaluation(entries, period);
  if (!existing) throw new BooksError(`No revaluation entry for ${periodLabel(period)}.`);
  return voidJournal(entityId, existing.id);
}
