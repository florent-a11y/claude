/**
 * Recurring transactions, the pure part: when the next occurrence falls, which occurrences are due, and how an
 * existing invoice, bill, expense, deposit or manual journal becomes a template. Posting lives in
 * lib/recurring-services.ts; the shapes are in lib/types.ts (`RecurringTemplate`).
 *
 * - Monthly, quarterly, six-monthly and annual templates are dated on `dayOfMonth`, clamped to the month: a rent
 *   dated the 31st falls on 28 February and back on 31 March. Weekly templates step 7 days from the start date.
 * - `occurrencesDue` lists every date from `nextDate` up to today (and the end date) so a month the cron missed is
 *   still created, capped at 24 so a forgotten template cannot flood the books.
 * - The payload is the matching input type without its dates: `InvoiceInput` / `BillInput` (lib/books.ts),
 *   `MoneyMoveInput` (lib/money-moves.ts) or `{ memo, source, lines }` for a journal. Per-document identifiers
 *   (e-Faktur number, vendor invoice number, statement line) are left out: they belong to one document only.
 */
import { addDays, daysBetween, lastDayOfMonth, parseISO, periodOf } from "./dates";
import { isMoneyMove, moneyMoveKindOf, type MoneyMoveInput, type MoneyMoveKind } from "./money-moves";
import { EDITABLE_SOURCES } from "./posting";
import type { BillInput, InvoiceInput } from "./books";
import type { Bill, Invoice, JournalEntry, JournalLine, JournalSource, Payment, RecurringFrequency, RecurringKind, RecurringTemplate } from "./types";

export const RECURRING_KIND_LABELS: Record<RecurringKind, string> = { invoice: "Invoice", bill: "Bill", expense: "Expense", deposit: "Deposit", journal: "Journal" };
export const RECURRING_FREQUENCIES: readonly RecurringFrequency[] = ["weekly", "monthly", "quarterly", "semiannual", "annual"];
/** Most occurrences one run creates for one template (two years of monthly, half a year of weekly). */
export const MAX_OCCURRENCES_PER_RUN = 24;

/** Months between two occurrences; 0 for weekly. */
export const FREQUENCY_MONTHS: Record<RecurringFrequency, number> = { weekly: 0, monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

// ---------- Payloads ----------

export type InvoicePayload = Omit<InvoiceInput, "date" | "dueDate" | "fakturNumber">;
export type BillPayload = Omit<BillInput, "date" | "dueDate" | "fakturNumber" | "vendorInvoiceNumber">;
export type MoneyMovePayload = Omit<MoneyMoveInput, "date" | "bankTransactionId">;
export interface JournalPayload { memo: string; source: JournalSource; lines: JournalLine[] }
export type PayloadByKind = { invoice: InvoicePayload; bill: BillPayload; expense: MoneyMovePayload; deposit: MoneyMovePayload; journal: JournalPayload };

/** The template's payload typed by its kind (the payload is stored as `unknown`). */
export function payloadOf<K extends RecurringKind>(t: { kind: K; payload: unknown }): PayloadByKind[K] {
  return t.payload as PayloadByKind[K];
}

// ---------- Dates ----------

function dayOf(date: string): number {
  return parseISO(date).getUTCDate();
}

/** The day of month of an ISO date (the default `dayOfMonth` of a template started on that date). */
export function dayOfMonthOf(date: string): number {
  return dayOf(date);
}

/** `period` (YYYY-MM) shifted by `months`. */
function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const idx = y * 12 + (m - 1) + months;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** `dayOfMonth` within `period`, clamped to the month's length. */
export function dateInPeriod(period: string, dayOfMonth: number): string {
  const last = dayOf(lastDayOfMonth(period));
  return `${period}-${String(Math.min(Math.max(1, Math.round(dayOfMonth)), last)).padStart(2, "0")}`;
}

/**
 * The occurrence after `date`. Monthly and longer: the same `dayOfMonth` (default: the day of `date`) in the month
 * 1, 3, 6 or 12 months later, clamped to that month (31 Jan → 28 Feb → 31 Mar when dayOfMonth is 31). Weekly: +7 days.
 */
export function nextOccurrence(date: string, frequency: RecurringFrequency, dayOfMonth?: number): string {
  if (frequency === "weekly") return addDays(date, 7);
  return dateInPeriod(shiftPeriod(periodOf(date), FREQUENCY_MONTHS[frequency]), dayOfMonth ?? dayOf(date));
}

export type Schedule = Pick<RecurringTemplate, "frequency" | "nextDate"> & Partial<Pick<RecurringTemplate, "dayOfMonth" | "endDate">>;

/** Every occurrence dated on or before `today` (and the end date), starting at `nextDate`; at most `MAX_OCCURRENCES_PER_RUN`. */
export function occurrencesDue(t: Schedule, today: string): string[] {
  const out: string[] = [];
  let d = t.nextDate;
  while (d <= today && (!t.endDate || d <= t.endDate) && out.length < MAX_OCCURRENCES_PER_RUN) {
    out.push(d);
    d = nextOccurrence(d, t.frequency, t.dayOfMonth);
  }
  return out;
}

/** The template after an occurrence dated `ranDate` was created: next date, and "ended" once the end date is passed. */
export function advance(t: Pick<RecurringTemplate, "frequency" | "dayOfMonth" | "endDate" | "status">, ranDate: string): { nextDate: string; status: RecurringTemplate["status"] } {
  const nextDate = nextOccurrence(ranDate, t.frequency, t.dayOfMonth);
  return { nextDate, status: t.endDate && nextDate > t.endDate ? "ended" : t.status };
}

/** Whether a template is finished: an end date before the next occurrence. */
export function isEnded(t: Pick<RecurringTemplate, "nextDate" | "endDate">): boolean {
  return Boolean(t.endDate && t.nextDate > t.endDate);
}

// ---------- Templates from documents ----------

/** Everything a new template needs apart from its id, entity, runs and audit fields. */
export type RecurringDraft = Pick<RecurringTemplate, "kind" | "name" | "frequency" | "dayOfMonth" | "startDate" | "nextDate" | "endDate" | "status" | "autoPost" | "dueDays" | "payload" | "sourceDocId">;

function draft(kind: RecurringKind, doc: { id: string; date: string }, name: string, payload: unknown, extra: Partial<Pick<RecurringDraft, "autoPost" | "dueDays">> = {}): RecurringDraft {
  const dayOfMonth = dayOf(doc.date);
  const startDate = nextOccurrence(doc.date, "monthly", dayOfMonth);
  return { kind, name: name.trim().slice(0, 160), frequency: "monthly", dayOfMonth, startDate, nextDate: startDate, status: "active", autoPost: extra.autoPost ?? true, dueDays: extra.dueDays, payload, sourceDocId: doc.id };
}

export function templateFromInvoice(inv: Invoice): RecurringDraft {
  const payload: InvoicePayload = {
    customer: inv.customer, currency: inv.currency, fxRate: inv.fxRate,
    lines: inv.lines.map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, accountId: l.accountId, taxCode: l.taxCode, serviceId: l.serviceId })),
    discount: inv.discount || undefined, notes: inv.notes, paymentInstructions: inv.paymentInstructions,
  };
  return draft("invoice", inv, `Invoice · ${inv.customer.name}`, payload, { autoPost: true, dueDays: Math.max(0, daysBetween(inv.date, inv.dueDate)) });
}

export function templateFromBill(bill: Bill): RecurringDraft {
  const payload: BillPayload = {
    vendor: bill.vendor, currency: bill.currency, fxRate: bill.fxRate,
    lines: bill.lines.map((l) => ({ description: l.description, amount: l.amount, accountId: l.accountId, taxCode: l.taxCode, withholding: l.withholding ?? "none", withholdingRate: l.withholdingRate })),
    notes: bill.notes,
  };
  return draft("bill", bill, `Bill · ${bill.vendor.name}`, payload, { autoPost: true, dueDays: Math.max(0, daysBetween(bill.date, bill.dueDate)) });
}

/** An expense or deposit (a payment recorded without a bill or invoice); throws for bill payments, receipts and transfers. */
export function templateFromPayment(p: Payment): RecurringDraft {
  if (!isMoneyMove(p)) throw new Error("Only expenses and deposits can be made recurring; bill payments and receipts follow their document.");
  const kind: MoneyMoveKind = moneyMoveKindOf(p);
  const payload: MoneyMovePayload = {
    kind, bankAccountId: p.bankAccountId, payee: p.payee, memo: p.memo ?? RECURRING_KIND_LABELS[kind], reference: p.reference, method: p.method,
    fxRate: p.currency === "IDR" ? undefined : p.fxRate, lines: (p.lines ?? []).map((l) => ({ accountId: l.accountId, description: l.description, amount: l.amount })),
  };
  return draft(kind, p, `${RECURRING_KIND_LABELS[kind]} · ${p.payee || p.memo || ""}`.replace(/ · $/, ""), payload);
}

/** A hand-written journal (manual, adjustment, opening, closing, fx); generated entries are repeated through their document instead. */
export function templateFromJournal(j: JournalEntry): RecurringDraft {
  const payload: JournalPayload = {
    memo: j.memo, source: EDITABLE_SOURCES.includes(j.source) ? j.source : "manual",
    lines: j.lines.map(({ accountId, accountCode, description, debit, credit, currency, fxAmount, fxRate, counterpartyId, counterpartyName, taxCode }) => ({ accountId, accountCode, description, debit, credit, currency, fxAmount, fxRate, counterpartyId, counterpartyName, taxCode })),
  };
  return draft("journal", j, `Journal · ${j.memo}`, payload);
}

export function templateFromDocument(kind: "invoice", doc: Invoice): RecurringDraft;
export function templateFromDocument(kind: "bill", doc: Bill): RecurringDraft;
export function templateFromDocument(kind: "expense" | "deposit", doc: Payment): RecurringDraft;
export function templateFromDocument(kind: "journal", doc: JournalEntry): RecurringDraft;
export function templateFromDocument(kind: RecurringKind, doc: Invoice | Bill | Payment | JournalEntry): RecurringDraft {
  switch (kind) {
    case "invoice": return templateFromInvoice(doc as Invoice);
    case "bill": return templateFromBill(doc as Bill);
    case "journal": return templateFromJournal(doc as JournalEntry);
    default: {
      const d = templateFromPayment(doc as Payment);
      if (d.kind !== kind) throw new Error(`This payment is ${d.kind === "expense" ? "an expense" : "a deposit"}, not ${kind === "expense" ? "an expense" : "a deposit"}.`);
      return d;
    }
  }
}

// ---------- Summary for the screens ----------

export interface TemplateSummary {
  /** Customer, vendor, payee or counterparty, when the payload has one. */
  party?: string;
  /** Document currency (IDR for journals). */
  currency: string;
  /** Amount in `currency`: invoice subtotal less discount (before PPN), bill subtotal, money move total, journal debits. */
  amount: number;
  lines: Array<{ label: string; sub?: string; amount: number }>;
}

/**
 * What the template repeats, in a shape the list and forms can print without the chart of accounts. An expense or
 * deposit is kept in its bank account's currency, which the payload does not carry: pass it as `bankCurrency`.
 */
export function templateSummary(t: Pick<RecurringTemplate, "kind" | "payload">, bankCurrency?: string): TemplateSummary {
  switch (t.kind) {
    case "invoice": {
      const p = payloadOf({ kind: "invoice", payload: t.payload });
      const lines = p.lines.map((l) => ({ label: l.description, sub: `${l.qty} × ${l.unitPrice}`, amount: l.qty * l.unitPrice }));
      return { party: p.customer.name, currency: p.currency, amount: lines.reduce((s, l) => s + l.amount, 0) - (p.discount ?? 0), lines };
    }
    case "bill": {
      const p = payloadOf({ kind: "bill", payload: t.payload });
      const lines = p.lines.map((l) => ({ label: l.description, sub: l.withholding !== "none" ? `withholding ${l.withholding}` : undefined, amount: l.amount }));
      return { party: p.vendor.name, currency: p.currency, amount: lines.reduce((s, l) => s + l.amount, 0), lines };
    }
    case "journal": {
      const p = payloadOf({ kind: "journal", payload: t.payload });
      const lines = p.lines.map((l) => ({ label: `${l.debit ? "Dr" : "Cr"} ${l.accountCode}`, sub: l.description, amount: l.debit || l.credit }));
      return { party: p.lines.find((l) => l.counterpartyName)?.counterpartyName, currency: "IDR", amount: p.lines.reduce((s, l) => s + l.debit, 0), lines };
    }
    default: {
      const p = payloadOf({ kind: "expense", payload: t.payload });
      const lines = p.lines.map((l) => ({ label: l.description || p.memo, amount: l.amount }));
      return { party: p.payee, currency: bankCurrency ?? (p.fxRate ? "" : "IDR"), amount: lines.reduce((s, l) => s + l.amount, 0), lines };
    }
  }
}
