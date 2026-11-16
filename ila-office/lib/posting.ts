import { db } from "./db";
import { periodOf } from "./dates";
import { validateLines } from "./balances";
import { roundMoney } from "./money";
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
  const lines = input.lines.map((l) => ({ ...l, debit: roundMoney(l.debit || 0), credit: roundMoney(l.credit || 0) })).filter((l) => l.debit !== 0 || l.credit !== 0);
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

// ---------- Editing in place ----------

/** Sources a user may edit in place: hand-written entries. Document-generated entries are corrected on their document. */
export const EDITABLE_SOURCES: readonly JournalSource[] = ["manual", "adjustment", "opening", "closing", "fx"];

/** Why an entry cannot be edited in place, or null when it can (posted and draft manual entries). */
export function editProblem(entry: Pick<JournalEntry, "source" | "status">): string | null {
  if (!EDITABLE_SOURCES.includes(entry.source)) return "Only manual entries can be edited; edit the invoice/bill/payment instead";
  if (entry.status === "void") return "Voided entries cannot be edited";
  return null;
}

export interface JournalEditInput { date: string; memo: string; source: JournalSource; lines: JournalLine[] }
export interface JournalEditMeta { at: string; byUserId?: string; byName?: string }
export interface JournalEditOptions {
  /**
   * GL account ids of the entity's bank and cash accounts. A change to a line on one of them drops the entry's
   * reconciliation ticks (`bankCleared`), since the tick no longer describes the same statement movement. When
   * omitted every line counts as a bank line (the conservative choice).
   */
  bankAccountIds?: Iterable<string>;
}

const LINE_EXTRAS = ["description", "currency", "fxAmount", "fxRate", "counterpartyId", "counterpartyName", "taxCode"] as const;
const lineKey = (l: Pick<JournalLine, "accountId" | "debit" | "credit">) => `${l.accountId}|${l.debit}|${l.credit}`;

/** Whole-rupiah amounts, empty lines dropped. Lines that match a previous line (account + amounts) inherit the details the editor did not set. */
function normaliseEditedLines(lines: JournalLine[], previous: JournalLine[]): JournalLine[] {
  const pool = new Map<string, JournalLine[]>();
  for (const p of previous) { const k = lineKey(p); pool.set(k, [...(pool.get(k) ?? []), p]); }
  return lines
    .map((l) => ({ ...l, debit: roundMoney(l.debit || 0), credit: roundMoney(l.credit || 0) }))
    .filter((l) => l.debit !== 0 || l.credit !== 0)
    .map((l) => {
      const old = pool.get(lineKey(l))?.shift();
      const merged: Record<string, unknown> = { ...l };
      if (old) for (const k of LINE_EXTRAS) if (merged[k] === undefined && old[k] !== undefined) merged[k] = old[k];
      for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
      return merged as unknown as JournalLine;
    });
}

/**
 * Pure: the entry as it looks after an in-place edit. Same id and number; new date, period, memo, source and
 * lines (validated with `validateLines`); the previous version appended to `revisions` (newest last); `updatedAt`
 * set to `meta.at`; `bankCleared` kept only when no bank/cash line changed. Throws with a user-facing message when
 * the entry cannot be edited or the input is invalid. Never mutates `entry`.
 */
export function applyJournalEdit(entry: JournalEntry, input: JournalEditInput, meta: JournalEditMeta, opts: JournalEditOptions = {}): JournalEntry {
  const problem = editProblem(entry);
  if (problem) throw new Error(problem);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Date is required (YYYY-MM-DD).");
  const memo = (input.memo ?? "").trim();
  if (!memo) throw new Error("Memo is required.");
  if (!EDITABLE_SOURCES.includes(input.source)) throw new Error(`Source "${input.source}" is reserved for generated entries.`);
  const lines = normaliseEditedLines(input.lines, entry.lines);
  const lineProblem = validateLines(lines);
  if (lineProblem) throw new Error(lineProblem);

  const { bankCleared, revisions, ...rest } = entry;
  const previous: NonNullable<JournalEntry["revisions"]>[number] = { at: meta.at, date: entry.date, memo: entry.memo, source: entry.source, lines: entry.lines };
  if (meta.byUserId) previous.byUserId = meta.byUserId;
  if (meta.byName) previous.byName = meta.byName;
  const next: JournalEntry = { ...rest, date: input.date, period: periodOf(input.date), memo, source: input.source, lines, updatedAt: meta.at, revisions: [...(revisions ?? []), previous] };
  if (bankCleared) {
    const bankIds = opts.bankAccountIds ? new Set(opts.bankAccountIds) : null;
    const onBank = (l: JournalLine) => !bankIds || bankIds.has(l.accountId);
    const before = entry.lines.filter(onBank).map(lineKey).sort().join("\n");
    const after = lines.filter(onBank).map(lineKey).sort().join("\n");
    if (before === after) next.bankCleared = bankCleared;
  }
  return next;
}

/**
 * Edits a manual entry in place: the entry must belong to the entity, be editable (`editProblem`), and both its
 * current period and the new one must be open. The previous version is kept under `revisions`.
 */
export async function updateJournal(entityId: string, id: string, input: JournalEditInput, meta: { byUserId?: string; byName?: string; at?: string } = {}): Promise<JournalEntry> {
  const entry = await db.get("journal_entries", id);
  if (!entry || entry.entityId !== entityId) throw new Error("Journal entry not found");
  const problem = editProblem(entry);
  if (problem) throw new Error(problem);
  const [accounts, banks] = await Promise.all([db.list("accounts", { where: { entityId } }), db.list("bank_accounts", { where: { entityId } })]);
  const bankAccountIds = new Set([...accounts.filter((a) => a.subtype === "bank" || a.subtype === "cash").map((a) => a.id), ...banks.map((b) => b.accountId)]);
  const next = applyJournalEdit(entry, input, { at: meta.at ?? new Date().toISOString(), byUserId: meta.byUserId, byName: meta.byName }, { bankAccountIds });
  await assertPeriodOpen(entityId, entry.date);
  if (next.period !== entry.period) await assertPeriodOpen(entityId, next.date);
  // `bankCleared` is passed explicitly: db.update merges patches, so a missing key would keep the old ticks.
  const updated = await db.update("journal_entries", id, { ...next, bankCleared: next.bankCleared });
  if (!updated) throw new Error("Journal entry not found");
  return updated;
}

// ---------- Bulk posting (migrations) ----------

/**
 * Posts many entries in a handful of round trips instead of three or more per entry (a QuickBooks journal history is
 * thousands of entries and must fit in one serverless request). Same rules as `postJournal`: every entry is checked
 * with `validateLines` and refused when its period is locked (the entity's locks are loaded once); the JE numbers of
 * a year are reserved in one counter update, in input order; the entries are stored with `insertMany` in chunks of
 * 500, built chunk by chunk so memory stays bounded. An entry that fails validation is reported by its index in
 * `inputs` and does not stop the others; a chunk the database refuses is reported for each of its entries.
 */
export async function postJournalsBulk(entityId: string, inputs: PostJournalInput[], opts: { createdByUserId?: string } = {}): Promise<{ posted: number; errors: Array<{ index: number; message: string }> }> {
  const CHUNK = 500;
  const errors: Array<{ index: number; message: string }> = [];
  if (inputs.length === 0) return { posted: 0, errors };
  const locked = new Set((await db.list("periods", { where: { entityId } })).filter((p) => p.locked).map((p) => p.period));
  // Pass 1: validate, and count the numbers needed per year (same year rule as postJournal → db.nextNumber).
  const valid: number[] = [];
  const perYear = new Map<number, number>();
  const yearOf = (date: string) => new Date(date).getFullYear();
  const linesOf = (input: PostJournalInput) => input.lines.map((l) => ({ ...l, debit: roundMoney(l.debit || 0), credit: roundMoney(l.credit || 0) })).filter((l) => l.debit !== 0 || l.credit !== 0);
  inputs.forEach((input, index) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "")) { errors.push({ index, message: "Date is required (YYYY-MM-DD)." }); return; }
    const problem = validateLines(linesOf(input));
    if (problem) { errors.push({ index, message: problem }); return; }
    const period = periodOf(input.date);
    if (locked.has(period)) { errors.push({ index, message: `Period ${period} is locked for this entity.` }); return; }
    valid.push(index);
    perYear.set(yearOf(input.date), (perYear.get(yearOf(input.date)) ?? 0) + 1);
  });
  // One counter update per year.
  const numbers = new Map<number, string[]>();
  for (const [year, count] of [...perYear].sort((a, b) => a[0] - b[0])) numbers.set(year, await db.reserveNumbers(entityId, "JE", year, count));
  const used = new Map<number, number>();
  let posted = 0;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const slice = valid.slice(i, i + CHUNK);
    const now = new Date().toISOString();
    const entries: JournalEntry[] = slice.map((index) => {
      const input = inputs[index];
      const year = yearOf(input.date);
      const n = used.get(year) ?? 0;
      used.set(year, n + 1);
      return {
        id: db.newId(), entityId, number: numbers.get(year)![n], date: input.date, period: periodOf(input.date), memo: input.memo, source: input.source, sourceId: input.sourceId,
        lines: linesOf(input), status: input.draft ? "draft" : "posted", postedAt: input.draft ? undefined : now, createdByUserId: input.createdByUserId ?? opts.createdByUserId, createdAt: now,
      };
    });
    try {
      await db.insertMany("journal_entries", entries);
      posted += entries.length;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      for (const index of slice) errors.push({ index, message });
    }
  }
  errors.sort((a, b) => a.index - b.index);
  return { posted, errors };
}
