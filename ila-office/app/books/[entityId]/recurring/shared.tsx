import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { BooksError } from "@/lib/books";
import { fmtDate, parseISO } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { isMoneyMove, moneyMoveKindOf } from "@/lib/money-moves";
import { RECURRING_FREQUENCIES, RECURRING_KIND_LABELS, templateFromDocument, templateSummary, payloadOf, type RecurringDraft, type TemplateSummary } from "@/lib/recurring";
import { RECURRING_FREQUENCY_LABELS, type RecurringKind, type RecurringRun, type RecurringTemplate } from "@/lib/types";
import { Badge, Card, CardTable, Cols, DL, Field, Select, type Tone } from "@/components/ui";

/** Helpers shared by the Recurring pages and actions (server side, not a "use server" module). */

// ---------- Source documents ----------

export type SourceType = "invoice" | "bill" | "payment" | "journal";
export interface SourceRef { type: SourceType; id: string }

/** `?from=invoice:<id>` | `bill:<id>` | `payment:<id>` | `journal:<id>`. */
export function parseFrom(from: string | undefined): SourceRef | null {
  const m = from?.match(/^(invoice|bill|payment|journal):([\w-]+)$/);
  return m ? { type: m[1] as SourceType, id: m[2] } : null;
}

/** Where a document of this kind lives. */
export function docHref(b: string, kind: RecurringKind, docId: string): string {
  switch (kind) {
    case "invoice": return `${b}/sales/${docId}`;
    case "bill": return `${b}/purchases/${docId}`;
    case "expense": return `${b}/expenses/${docId}`;
    case "deposit": return `${b}/deposits/${docId}`;
    default: return `${b}/journal/${docId}`;
  }
}

/** The document a run produced (the journal for a journal template). */
export function runHref(b: string, kind: RecurringKind, run: RecurringRun): string | undefined {
  const id = kind === "journal" ? run.journalId ?? run.docId : run.docId;
  return id ? docHref(b, kind, id) : undefined;
}

/** Loads the source document (it must belong to the entity) and turns it into a template draft. */
export async function loadSourceDraft(entityId: string, from: string | undefined): Promise<RecurringDraft> {
  const ref = parseFrom(from);
  if (!ref) throw new BooksError("Open an invoice, bill, expense, deposit or journal entry and click “Make recurring”.");
  switch (ref.type) {
    case "invoice": {
      const inv = await db.get("invoices", ref.id);
      if (!inv || inv.entityId !== entityId) throw new BooksError("Invoice not found.");
      return templateFromDocument("invoice", inv);
    }
    case "bill": {
      const bill = await db.get("bills", ref.id);
      if (!bill || bill.entityId !== entityId) throw new BooksError("Bill not found.");
      return templateFromDocument("bill", bill);
    }
    case "payment": {
      const p = await db.get("payments", ref.id);
      if (!p || p.entityId !== entityId) throw new BooksError("Payment not found.");
      if (!isMoneyMove(p)) throw new BooksError("Only expenses and deposits can be made recurring; a bill payment or receipt follows its document.");
      return templateFromDocument(moneyMoveKindOf(p), p);
    }
    default: {
      const j = await db.get("journal_entries", ref.id);
      if (!j || j.entityId !== entityId) throw new BooksError("Journal entry not found.");
      return templateFromDocument("journal", j);
    }
  }
}

// ---------- Labels ----------

const KIND_TONE: Record<RecurringKind, Tone> = { invoice: "brand", bill: "indigo", expense: "amber", deposit: "blue", journal: "slate" };
const STATUS_TONE: Record<RecurringTemplate["status"], Tone> = { active: "green", paused: "amber", ended: "slate" };
const PARTY_LABEL: Record<RecurringKind, string> = { invoice: "Customer", bill: "Vendor", expense: "Payee", deposit: "Received from", journal: "Counterparty" };
const TOTAL_LABEL: Record<RecurringKind, string> = { invoice: "Subtotal before PPN", bill: "Subtotal (DPP)", expense: "Paid from the bank (net)", deposit: "Received (net)", journal: "Total debits" };

export function KindBadge({ kind }: { kind: RecurringKind }) {
  return <Badge tone={KIND_TONE[kind]}>{RECURRING_KIND_LABELS[kind]}</Badge>;
}

export function StatusBadge({ status }: { status: RecurringTemplate["status"] }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

export function ordinal(n: number): string {
  const r = n % 100;
  return `${n}${r > 10 && r < 14 ? "th" : ["th", "st", "nd", "rd"][Math.min(n % 10, 4) % 4] ?? "th"}`;
}

/** "Every month on the 31st", "Every week on Monday". */
export function repeatsLabel(t: Pick<RecurringTemplate, "frequency" | "dayOfMonth" | "startDate">): string {
  const f = RECURRING_FREQUENCY_LABELS[t.frequency];
  if (t.frequency === "weekly") return `${f} on ${parseISO(t.startDate).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}`;
  return t.dayOfMonth ? `${f} on the ${ordinal(t.dayOfMonth)}` : f;
}

// ---------- What repeats ----------

export interface TemplateDescription { summary: TemplateSummary; details: Array<[ReactNode, ReactNode]>; bankCurrency?: string }

/** The summary and the detail rows of a template (loads the bank account of an expense or deposit for its currency). */
export async function describeTemplate(entityId: string, t: Pick<RecurringTemplate, "kind" | "payload" | "sourceDocId">, b: string): Promise<TemplateDescription> {
  let bankCurrency: string | undefined;
  const details: Array<[ReactNode, ReactNode]> = [["Kind", <KindBadge key="k" kind={t.kind} />]];
  if (t.kind === "expense" || t.kind === "deposit") {
    const p = payloadOf({ kind: "expense", payload: t.payload });
    const bank = await db.get("bank_accounts", p.bankAccountId);
    if (bank && bank.entityId === entityId) bankCurrency = bank.currency;
    details.push(["Bank account", bank ? <Link key="b" href={`${b}/bank/${bank.id}`} className="text-brand-600 underline">{bank.name} ({bank.currency})</Link> : <span className="text-red-700">not found</span>]);
    details.push(["Memo", p.memo]);
    if (p.reference) details.push(["Reference", p.reference]);
  }
  const summary = templateSummary(t, bankCurrency);
  if (summary.party) details.splice(1, 0, [PARTY_LABEL[t.kind], summary.party]);
  if (t.kind === "journal") {
    const p = payloadOf({ kind: "journal", payload: t.payload });
    details.push(["Memo", p.memo], ["Source", p.source]);
  }
  if (summary.currency && summary.currency !== "IDR") details.push(["Currency", <>{summary.currency} <span className="text-xs text-ink-500">· Bank Indonesia&apos;s mid rate of each document date; the original rate when BI has none</span></>]);
  if (t.sourceDocId) details.push(["Made from", <Link key="s" href={docHref(b, t.kind, t.sourceDocId)} className="text-brand-600 underline">open the original</Link>]);
  return { summary, details, bankCurrency };
}

export function PayloadCard({ kind, description }: { kind: RecurringKind; description: TemplateDescription }) {
  const { summary, details } = description;
  const ccy = summary.currency || "IDR";
  return (
    <Card title="What repeats">
      <DL items={details} />
      <CardTable className="mt-3">
        <table className="table table-data min-w-[300px]">
          <Cols widths={[undefined, 150]} />
          <thead><tr><th>Line</th><th className="num">Amount ({ccy})</th></tr></thead>
          <tbody>
            {summary.lines.map((l, i) => (
              <tr key={i}>
                <td><span className="cell" title={l.label}>{l.label}</span>{l.sub && <span className="cell-sub" title={l.sub}>{l.sub}</span>}</td>
                <td className={`num${l.amount < 0 ? " text-red-700" : ""}`}><span className="money">{fmtMoney(l.amount, ccy)}</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td className="text-right">{TOTAL_LABEL[kind]}</td><td className="num">{fmtMoney(summary.amount, ccy)}</td></tr></tfoot>
        </table>
      </CardTable>
    </Card>
  );
}

// ---------- Form ----------

export type TemplateFormValues = Pick<RecurringTemplate, "kind" | "name" | "frequency" | "dayOfMonth" | "startDate" | "nextDate" | "endDate" | "autoPost" | "dueDays">;

/** Schedule and options, shared by the create and edit forms (`showNext`: the edit form also exposes the next date). */
export function TemplateFields({ t, showNext = false }: { t: TemplateFormValues; showNext?: boolean }) {
  const money = t.kind === "invoice" || t.kind === "bill";
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Name" className="md:col-span-2"><input name="name" className="input" required maxLength={160} defaultValue={t.name} /></Field>
      <Field label="Repeats"><Select name="frequency" defaultValue={t.frequency} options={RECURRING_FREQUENCIES.map((f) => ({ value: f, label: RECURRING_FREQUENCY_LABELS[f] }))} /></Field>
      <Field label="Day of month" hint="1–31, moved back in shorter months (31 → 28 Feb, 31 Mar again). Weekly repeats on the start date's weekday instead."><input name="dayOfMonth" type="number" min={1} max={31} className="input" defaultValue={t.dayOfMonth ?? ""} /></Field>
      <Field label="Start date" hint={showNext ? "First document date; moves the next date only while nothing has run yet." : "Date of the first document created."}><input name="startDate" type="date" className="input" required defaultValue={t.startDate} /></Field>
      {showNext && <Field label="Next date" hint="Date of the next document; set it forward to skip occurrences."><input name="nextDate" type="date" className="input" required defaultValue={t.nextDate} /></Field>}
      <Field label="End date (optional)" hint="Last document date; empty repeats until paused."><input name="endDate" type="date" className="input" defaultValue={t.endDate ?? ""} /></Field>
      {money && <Field label="Due days" hint="Due date = document date + this many days."><input name="dueDays" type="number" min={0} max={365} className="input" defaultValue={t.dueDays ?? ""} /></Field>}
      {money && <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="autoPost" defaultChecked={t.autoPost} className="checkbox" /> Post immediately (unticked: each {t.kind} is created as a draft to review and post by hand)</label>}
      {!money && <p className="text-xs text-ink-500 md:col-span-2">{RECURRING_KIND_LABELS[t.kind]}s post straight to the ledger on each run. {t.kind === "journal" ? "The lines keep their IDR amounts." : "A foreign-currency bank account takes Bank Indonesia's rate of the day."}</p>}
    </div>
  );
}

/** A due-date sentence for notices: "3 occurrences (30 Nov 2026 … 31 Jan 2027)". */
export function occurrencesLabel(dates: string[]): string {
  if (dates.length === 0) return "nothing";
  if (dates.length === 1) return `1 occurrence (${fmtDate(dates[0])})`;
  return `${dates.length} occurrences (${fmtDate(dates[0])} … ${fmtDate(dates[dates.length - 1])})`;
}
