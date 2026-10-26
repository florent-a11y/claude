import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { entityAccounts } from "@/lib/books";
import { todayISO } from "@/lib/dates";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../../shared";
import { JournalForm } from "../JournalForm";
import { createJournalAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewJournal({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requirePermission("books:write");
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const accounts = (await entityAccounts(entityId)).filter((a) => a.active).map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type }));
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} />
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold">New manual journal entry</h2><Link href={`${base(entityId)}/journal`} className="text-xs text-brand-600 underline">Back to journal</Link></div>
      <JournalForm accounts={accounts} action={createJournalAction.bind(null, entityId)} defaultDate={todayISO()} />
    </div>
  );
}
