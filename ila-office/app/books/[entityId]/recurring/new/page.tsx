import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { BooksError, errorMessage } from "@/lib/books";
import { fmtDate, todayISO } from "@/lib/dates";
import { RECURRING_KIND_LABELS, occurrencesDue, type RecurringDraft } from "@/lib/recurring";
import { Card, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../../shared";
import { PayloadCard, TemplateFields, describeTemplate, loadSourceDraft, occurrencesLabel, parseFrom } from "../shared";
import { createTemplateAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * "Make recurring": `?from=invoice:<id>` | `bill:<id>` | `payment:<id>` | `journal:<id>` turns that document into a
 * template. The payload is rebuilt from the document when the form is submitted (the form only carries the schedule).
 */
export default async function NewRecurringPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const b = base(entityId);
  const here = `${b}/recurring`;
  const from = first(sp.from);
  const write = can(user, "books:write");
  if (!from || !parseFrom(from)) {
    return (
      <div className="space-y-4 pb-8">
        <ErrorNotice error={first(sp.error)} />
        <p className="text-xs text-ink-500"><Link href={here} className="hover:underline">Recurring</Link> / New</p>
        <Card title="Make a transaction recurring">
          <p className="text-sm text-ink-700">A recurring transaction starts from a document that already exists, so the amounts, accounts, tax treatment and counterparty are exactly what you booked once. Open the document and click <strong>Make recurring</strong> in its action bar, then choose how often it repeats, the day of the month, the first date and, if any, the last one.</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-700">
            <li><Link href={`${b}/sales`} className="text-brand-600 underline">Sales</Link>: a monthly retainer or subscription invoice to a client (posted immediately, or created as a draft to review).</li>
            <li><Link href={`${b}/purchases`} className="text-brand-600 underline">Purchases</Link>: a monthly rent bill or a quarterly vendor bill, withholding included.</li>
            <li><Link href={`${b}/expenses`} className="text-brand-600 underline">Expenses</Link> and <Link href={`${b}/deposits`} className="text-brand-600 underline">Deposits</Link>: bank fees, loan instalments, interest received, paid straight from the bank account.</li>
            <li><Link href={`${b}/journal`} className="text-brand-600 underline">Journal</Link>: a manual month-end entry such as an accrual or the amortisation of a prepaid expense.</li>
          </ul>
          <p className="mt-3 text-xs text-ink-500">Every morning the due documents are created dated their occurrence day; the <Link href={here} className="text-brand-600 underline">Recurring</Link> tab lists them with the last run and lets you pause, run now, edit or delete.</p>
        </Card>
      </div>
    );
  }
  let draft: RecurringDraft;
  try {
    draft = await loadSourceDraft(entityId, from);
  } catch (e) {
    if (e instanceof BooksError && /not found/i.test(e.message)) notFound();
    return (
      <div className="space-y-4 pb-8">
        <p className="text-xs text-ink-500"><Link href={here} className="hover:underline">Recurring</Link> / New</p>
        <Notice tone="red">{errorMessage(e)}</Notice>
      </div>
    );
  }
  const today = todayISO();
  const description = await describeTemplate(entityId, draft, b);
  const backlog = occurrencesDue(draft, today);
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} />
      <div>
        <p className="text-xs text-ink-500"><Link href={here} className="hover:underline">Recurring</Link> / New</p>
        <h2 className="text-xl font-bold">Make recurring: {RECURRING_KIND_LABELS[draft.kind].toLowerCase()}{description.summary.party ? ` · ${description.summary.party}` : ""}</h2>
        <p className="text-sm text-ink-700">The document on the right is repeated with the schedule below. Each occurrence is a new {draft.kind === "journal" ? "journal entry" : draft.kind} dated that day{draft.kind === "invoice" || draft.kind === "bill" ? ", with its own number and due date" : ""}.</p>
      </div>
      {!write && <Notice tone="amber">Only accountants and admins can create recurring transactions.</Notice>}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card title="Schedule">
          <form action={createTemplateAction.bind(null, entityId)} className="space-y-4">
            <input type="hidden" name="from" value={from} />
            <TemplateFields t={draft} />
            {backlog.length > 0 && <Notice tone="amber">The start date {fmtDate(draft.startDate)} is not after today: {occurrencesLabel(backlog)} will be created on the next run. Move the start date forward if those months are already booked.</Notice>}
            <div className="flex flex-wrap items-center gap-3">
              {write && <SubmitButton pendingText="Creating…">Create recurring transaction</SubmitButton>}
              <Link href={here} className="btn-secondary">Cancel</Link>
            </div>
          </form>
        </Card>
        <PayloadCard kind={draft.kind} description={description} />
      </div>
    </div>
  );
}
