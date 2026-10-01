import { db } from "./db";
import { periodOf } from "./dates";
import { validateLines } from "./balances";
import type { JournalEntry, JournalLine, JournalSource } from "./types";

/**
 * Posts a journal entry: validates it balances, refuses locked periods, allocates JE-YYYY-NNNN and stores it as
 * `posted`. Used by Books (invoices, bills, payments, bank, depreciation) and Tax/Payroll (payroll runs, withholding).
 */
export interface PostJournalInput {
  date: string;
  memo: string;
  source: JournalSource;
  sourceId?: string;
  lines: JournalLine[];
  createdByUserId?: string;
  /** Store as draft instead of posting. */
  draft?: boolean;
}

export async function assertPeriodOpen(entityId: string, date: string): Promise<void> {
  const period = periodOf(date);
  const lock = await db.get("periods", `${entityId}:${period}`);
  if (lock?.locked) throw new Error(`Period ${period} is locked for this entity.`);
}

export async function postJournal(entityId: string, input: PostJournalInput): Promise<JournalEntry> {
  const lines = input.lines.map((l) => ({ ...l, debit: Math.round(l.debit || 0), credit: Math.round(l.credit || 0) })).filter((l) => l.debit !== 0 || l.credit !== 0);
  const problem = validateLines(lines);
  if (problem) throw new Error(problem);
  await assertPeriodOpen(entityId, input.date);
  const now = new Date().toISOString();
  const entry: JournalEntry = {
    id: db.newId(), entityId, number: await db.nextNumber(entityId, "JE", new Date(input.date)), date: input.date, period: periodOf(input.date),
    memo: input.memo, source: input.source, sourceId: input.sourceId, lines, status: input.draft ? "draft" : "posted",
    postedAt: input.draft ? undefined : now, createdByUserId: input.createdByUserId, createdAt: now,
  };
  await db.insert("journal_entries", entry);
  return entry;
}

/** Voids a posted entry (kept for the audit trail; reports ignore it). */
export async function voidJournal(entityId: string, id: string): Promise<JournalEntry> {
  const entry = await db.get("journal_entries", id);
  if (!entry || entry.entityId !== entityId) throw new Error("Journal entry not found");
  await assertPeriodOpen(entityId, entry.date);
  const updated = await db.update("journal_entries", id, { status: "void", voidedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  return updated!;
}

/** Loads the entity's posted entries (the usual input for reports and tax computations). */
export async function postedEntries(entityId: string): Promise<JournalEntry[]> {
  return db.list("journal_entries", { where: { entityId, status: "posted" }, orderBy: "date" });
}
