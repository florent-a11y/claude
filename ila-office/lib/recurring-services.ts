/**
 * Recurring transactions, the posting side (lib/recurring.ts holds the dates and the template builders): templates
 * are stored in `recurring_templates`; `runTemplate` creates one occurrence through the ordinary Books services, so
 * numbering, period locks, PPN and withholding arithmetic stay in one place.
 *
 * - An invoice or bill is created dated the occurrence (`createInvoice` / `createBill`) and posted when `autoPost`;
 *   its due date is the occurrence plus `dueDays`. An expense or deposit always posts (`recordMoneyMove`); a journal
 *   posts with the payload's memo and lines. A foreign-currency document takes Bank Indonesia's mid rate of the
 *   occurrence date (lib/fx.ts) and falls back to the rate stored in the payload when BI gives nothing.
 * - Every attempt is appended to `runs`: the number and ids on success, the message on failure (locked period,
 *   inactive account, missing bank…). The template advances either way, so one bad month does not block the next.
 * - `runDue` is the daily cron (app/api/recurring/run) over every entity; `runDueForEntity` the "Run due now" button.
 */
import { db } from "./db";
import { BooksError, createBill, createInvoice, entityAccounts, errorMessage, postBill, postInvoice } from "./books";
import { recordMoneyMove } from "./money-moves";
import { assertPeriodOpen, postJournal } from "./posting";
import { accountById } from "./ledger";
import { getFxRate } from "./fx";
import { addDays, todayISO } from "./dates";
import { advance, dayOfMonthOf, isEnded, occurrencesDue, payloadOf, RECURRING_FREQUENCIES, type RecurringDraft } from "./recurring";
import type { JournalLine, RecurringRun, RecurringTemplate } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Templates ----------

/** Every template of an entity, active first, then by name. */
export async function listTemplates(entityId: string): Promise<RecurringTemplate[]> {
  const rows = await db.list("recurring_templates", { where: { entityId } });
  const rank = { active: 0, paused: 1, ended: 2 };
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || a.nextDate.localeCompare(b.nextDate) || a.name.localeCompare(b.name));
}

export async function getTemplate(entityId: string, id: string): Promise<RecurringTemplate> {
  const t = await db.get("recurring_templates", id);
  if (!t || t.entityId !== entityId) throw new BooksError("Recurring transaction not found.");
  return t;
}

/** The fields a user sets on the form; the payload comes from the source document. */
export type TemplateFields = Pick<RecurringTemplate, "name" | "frequency" | "dayOfMonth" | "startDate" | "endDate" | "autoPost" | "dueDays"> & { nextDate?: string };

function checkFields(f: Partial<TemplateFields>): void {
  if (f.name !== undefined && !f.name.trim()) throw new BooksError("Give the recurring transaction a name.");
  if (f.frequency !== undefined && !RECURRING_FREQUENCIES.includes(f.frequency)) throw new BooksError("Pick a frequency.");
  if (f.dayOfMonth !== undefined && (!Number.isInteger(f.dayOfMonth) || f.dayOfMonth < 1 || f.dayOfMonth > 31)) throw new BooksError("Day of month must be between 1 and 31.");
  if (f.startDate !== undefined && !ISO_DATE.test(f.startDate)) throw new BooksError("Start date is required.");
  if (f.nextDate !== undefined && !ISO_DATE.test(f.nextDate)) throw new BooksError("Next date must be a date.");
  if (f.endDate !== undefined && !ISO_DATE.test(f.endDate)) throw new BooksError("End date must be a date.");
  if (f.dueDays !== undefined && (!Number.isInteger(f.dueDays) || f.dueDays < 0 || f.dueDays > 365)) throw new BooksError("Due days must be between 0 and 365.");
}

export async function createTemplate(entityId: string, draft: RecurringDraft, userId?: string): Promise<RecurringTemplate> {
  checkFields(draft);
  if (draft.endDate && draft.endDate < draft.startDate) throw new BooksError("The end date is before the start date.");
  const nextDate = draft.nextDate || draft.startDate;
  const t: RecurringTemplate = {
    id: db.newId(), entityId, kind: draft.kind, name: draft.name.trim(), frequency: draft.frequency, dayOfMonth: draft.frequency === "weekly" ? undefined : draft.dayOfMonth ?? dayOfMonthOf(draft.startDate),
    startDate: draft.startDate, nextDate, endDate: draft.endDate, status: isEnded({ nextDate, endDate: draft.endDate }) ? "ended" : "active",
    autoPost: draft.kind === "invoice" || draft.kind === "bill" ? draft.autoPost : true, dueDays: draft.kind === "invoice" || draft.kind === "bill" ? draft.dueDays : undefined,
    payload: draft.payload, sourceDocId: draft.sourceDocId, runs: [], createdByUserId: userId, createdAt: new Date().toISOString(),
  };
  await db.insert("recurring_templates", t);
  return t;
}

/**
 * Changes the schedule and options. The start date only moves the next date while nothing has run yet; afterwards
 * the next date is edited directly. An end date before the next date ends the template; clearing or extending it
 * revives an ended one.
 */
export async function updateTemplate(entityId: string, id: string, fields: Partial<TemplateFields>): Promise<RecurringTemplate> {
  const t = await getTemplate(entityId, id);
  checkFields(fields);
  const frequency = fields.frequency ?? t.frequency;
  const startDate = fields.startDate ?? t.startDate;
  let nextDate = fields.nextDate ?? t.nextDate;
  // A new start date before anything ran is the new first occurrence (unless the next date was moved on the same form).
  if (startDate !== t.startDate && t.runs.length === 0 && nextDate === t.nextDate) nextDate = startDate;
  if (nextDate < startDate) nextDate = startDate;
  // `endDate` is passed explicitly because db.update merges: an absent key would keep the old date.
  const endDate = "endDate" in fields ? fields.endDate : t.endDate;
  if (endDate && endDate < startDate) throw new BooksError("The end date is before the start date.");
  const ended = isEnded({ nextDate, endDate });
  const money = t.kind === "invoice" || t.kind === "bill";
  const patch: Partial<RecurringTemplate> = {
    name: fields.name?.trim() || t.name, frequency, dayOfMonth: frequency === "weekly" ? undefined : fields.dayOfMonth ?? t.dayOfMonth ?? dayOfMonthOf(nextDate), startDate, nextDate, endDate,
    status: ended ? "ended" : t.status === "ended" ? "active" : t.status,
    autoPost: money ? fields.autoPost ?? t.autoPost : true, dueDays: money ? ("dueDays" in fields ? fields.dueDays : t.dueDays) : undefined,
    updatedAt: new Date().toISOString(),
  };
  return (await db.update("recurring_templates", id, patch))!;
}

/** Pause stops the cron; resume keeps the next date, so occurrences skipped while paused are created on the next run. */
export async function setStatus(entityId: string, id: string, status: "active" | "paused"): Promise<RecurringTemplate> {
  const t = await getTemplate(entityId, id);
  if (status === "active" && isEnded(t)) throw new BooksError("This recurring transaction has reached its end date; extend or clear the end date to resume it.");
  return (await db.update("recurring_templates", id, { status, updatedAt: new Date().toISOString() }))!;
}

export async function deleteTemplate(entityId: string, id: string): Promise<void> {
  await getTemplate(entityId, id);
  await db.remove("recurring_templates", id);
}

// ---------- Running ----------

/** Bank Indonesia's mid rate of `date` for a foreign currency, else the payload's rate; a run without any rate is refused. */
async function rateFor(currency: string, date: string, fallback: number | undefined): Promise<number> {
  if (currency === "IDR") return 1;
  const q = await getFxRate(currency, date).catch(() => null);
  const rate = q?.rate.mid ?? fallback ?? 0;
  if (!(rate > 0)) throw new BooksError(`No exchange rate for ${currency} on ${date}: Bank Indonesia could not be reached and the template has none.`);
  return rate;
}

/** Creates the document for one occurrence; the ids and number go on `run`, so a failure after creation still points at the document. */
async function createOccurrence(t: RecurringTemplate, date: string, run: RecurringRun, userId?: string): Promise<void> {
  const entityId = t.entityId;
  switch (t.kind) {
    case "invoice": {
      const p = payloadOf({ kind: "invoice", payload: t.payload });
      // Checked before creating: a draft left behind in a locked month would otherwise have to be voided by hand.
      if (t.autoPost) await assertPeriodOpen(entityId, date);
      const fxRate = await rateFor(p.currency, date, p.fxRate);
      const inv = await createInvoice(entityId, { ...p, fxRate, date, dueDate: t.dueDays !== undefined ? addDays(date, t.dueDays) : undefined });
      run.docId = inv.id; run.number = inv.number;
      if (t.autoPost) run.journalId = (await postInvoice(entityId, inv.id, userId)).journalId;
      return;
    }
    case "bill": {
      const p = payloadOf({ kind: "bill", payload: t.payload });
      if (t.autoPost) await assertPeriodOpen(entityId, date);
      const fxRate = await rateFor(p.currency, date, p.fxRate);
      const bill = await createBill(entityId, { ...p, fxRate, date, dueDate: addDays(date, t.dueDays ?? 0) });
      run.docId = bill.id; run.number = bill.number;
      if (t.autoPost) run.journalId = (await postBill(entityId, bill.id, userId)).journalId;
      return;
    }
    case "journal": {
      const p = payloadOf({ kind: "journal", payload: t.payload });
      const accounts = await entityAccounts(entityId);
      // Codes are refreshed from the chart (they can be renamed); an account closed since the template was made stops the run.
      const lines: JournalLine[] = p.lines.map((l) => {
        const a = accountById(accounts, l.accountId);
        if (!a.active) throw new BooksError(`Account ${a.code} ${a.name} is inactive.`);
        return { ...l, accountCode: a.code };
      });
      const j = await postJournal(entityId, { date, memo: p.memo, source: p.source ?? "manual", sourceId: t.id, lines, createdByUserId: userId });
      run.docId = j.id; run.journalId = j.id; run.number = j.number;
      return;
    }
    default: {
      const p = payloadOf({ kind: "expense", payload: t.payload });
      const bank = await db.get("bank_accounts", p.bankAccountId);
      if (!bank || bank.entityId !== entityId) throw new BooksError("Bank account not found.");
      const fxRate = bank.currency === "IDR" ? undefined : await rateFor(bank.currency, date, p.fxRate);
      const r = await recordMoneyMove(entityId, { ...p, kind: t.kind, fxRate, date }, userId);
      run.docId = r.payment.id; run.journalId = r.journal.id; run.number = r.journal.number;
    }
  }
}

/**
 * Creates the occurrence dated `date`, records the run (with the error message when the document could not be made)
 * and advances the template. Never throws for a document problem; a storage failure propagates.
 */
export async function runTemplate(template: RecurringTemplate, date: string, userId?: string): Promise<{ run: RecurringRun; template: RecurringTemplate }> {
  const run: RecurringRun = { date, at: new Date().toISOString() };
  try {
    await createOccurrence(template, date, run, userId);
  } catch (e) {
    run.error = errorMessage(e);
  }
  const next = advance(template, date);
  const updated = await db.update("recurring_templates", template.id, { runs: [...template.runs, run], lastRunAt: run.at, nextDate: next.nextDate, status: next.status, updatedAt: run.at });
  return { run, template: updated ?? { ...template, runs: [...template.runs, run], ...next } };
}

export interface RunSummary {
  today: string;
  /** Templates that had at least one occurrence due. */
  templates: number;
  created: number;
  failed: number;
  runs: Array<{ templateId: string; entityId: string; name: string } & RecurringRun>;
}

/** Runs every due occurrence of the given templates, oldest first, each template independently of the others. */
async function runAll(templates: RecurringTemplate[], today: string, userId?: string): Promise<RunSummary> {
  const summary: RunSummary = { today, templates: 0, created: 0, failed: 0, runs: [] };
  for (let t of templates) {
    if (t.status !== "active") continue;
    const dates = occurrencesDue(t, today);
    if (dates.length === 0) continue;
    summary.templates++;
    for (const date of dates) {
      let run: RecurringRun;
      try {
        const r = await runTemplate(t, date, userId);
        run = r.run; t = r.template;
      } catch (e) {
        run = { date, at: new Date().toISOString(), error: errorMessage(e) };
      }
      summary.runs.push({ templateId: t.id, entityId: t.entityId, name: t.name, ...run });
      if (run.error) summary.failed++; else summary.created++;
      if (t.status !== "active") break;
    }
  }
  return summary;
}

/** The daily cron: every active template of every entity whose next date is today or earlier. */
export async function runDue(today = todayISO(), userId?: string): Promise<RunSummary> {
  const due = await db.list("recurring_templates", { where: (t) => t.status === "active" && t.nextDate <= today });
  return runAll(due, today, userId);
}

/** "Run due now" on the Recurring tab: the same for one entity. */
export async function runDueForEntity(entityId: string, today = todayISO(), userId?: string): Promise<RunSummary> {
  const due = await db.list("recurring_templates", { where: (t) => t.entityId === entityId && t.status === "active" && t.nextDate <= today });
  return runAll(due, today, userId);
}

/** "Run due now" on one template. */
export async function runTemplateDue(entityId: string, id: string, today = todayISO(), userId?: string): Promise<RunSummary> {
  const t = await getTemplate(entityId, id);
  if (t.status !== "active") throw new BooksError(`This recurring transaction is ${t.status}.`);
  return runAll([t], today, userId);
}
