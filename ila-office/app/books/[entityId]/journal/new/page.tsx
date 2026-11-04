import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
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
  const [accounts, banks] = await Promise.all([entityAccounts(entityId), db.list("bank_accounts", { where: { entityId } })]);
  const options = accounts.filter((a) => a.active).map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type }));
  // GL account → currency of the foreign-currency bank accounts: their lines take the amount in that currency.
  const fxAccounts = Object.fromEntries(banks.filter((bk) => bk.currency !== "IDR").map((bk) => [bk.accountId, bk.currency]));
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} />
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold">New manual journal entry</h2><Link href={`${base(entityId)}/journal`} className="text-xs text-brand-600 underline">Back to journal</Link></div>
      <JournalForm accounts={options} action={createJournalAction.bind(null, entityId)} defaultDate={todayISO()} fxAccounts={fxAccounts} />
    </div>
  );
}
