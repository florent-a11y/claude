import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { entityAccounts } from "@/lib/books";
import { editProblem } from "@/lib/posting";
import { periodLabel } from "@/lib/dates";
import { Notice } from "@/components/ui";
import { ErrorNotice, base, first, requireEntity, type Search } from "../../../shared";
import { JournalForm } from "../../JournalForm";
import { updateJournalAction } from "../../actions";

export const dynamic = "force-dynamic";

/** Edit a manual journal entry in place. Generated entries, voided entries and locked periods get a notice instead of the form. */
export default async function EditJournalEntry({ params, searchParams }: { params: Promise<{ entityId: string; journalId: string }>; searchParams: Search }) {
  await requirePermission("books:write");
  const { entityId, journalId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const entry = await db.get("journal_entries", journalId);
  if (!entry || entry.entityId !== entityId) notFound();
  const b = base(entityId);
  const detail = `${b}/journal/${journalId}`;
  const lock = await db.get("periods", `${entityId}:${entry.period}`);
  const problem = editProblem(entry) ?? (lock?.locked ? `Period ${periodLabel(entry.period)} is locked; unlock it under Periods before editing this entry` : null);
  const used = new Set(entry.lines.map((l) => l.accountId));
  const accounts = (await entityAccounts(entityId)).filter((a) => a.active || used.has(a.id)).map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type }));
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} />
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Edit {entry.number}</h2>
        <Link href={detail} className="text-xs text-brand-600 underline">Back to entry</Link>
      </div>
      {problem ? (
        <Notice tone="amber">{problem}. <Link href={detail} className="underline">Back to {entry.number}</Link>{entry.status !== "void" && !EDIT_HINT_HIDDEN.has(entry.source) && <> · If the amount is wrong, void it and post a new entry.</>}</Notice>
      ) : (
        <>
          <p className="text-sm text-ink-500">Changes replace the current lines; the previous version is kept in the entry&apos;s revision history, with who changed it and when.</p>
          <JournalForm accounts={accounts} action={updateJournalAction.bind(null, entityId, journalId)} defaultDate={entry.date} initial={{ date: entry.date, memo: entry.memo, source: entry.source, lines: entry.lines }} submitLabel="Save changes" cancelHref={detail} />
        </>
      )}
    </div>
  );
}

/** Sources whose problem notice already names the fix (edit the document) and need no "void and repost" hint. */
const EDIT_HINT_HIDDEN = new Set(["invoice", "bill", "receipt", "disbursement", "bank", "payroll", "depreciation", "withholding"]);
