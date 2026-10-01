import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, periodLabel } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Card, Badge, statusTone, Chips, EmptyState, withParams, Stat } from "@/components/ui";
import { ConfirmForm } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Search } from "../../shared";
import { excludeTxAction, unmatchTxAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function BankTransactions({ params, searchParams }: { params: Promise<{ entityId: string; bankAccountId: string }>; searchParams: Search }) {
  const user = await requireUser();
  const { entityId, bankAccountId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const bank = await db.get("bank_accounts", bankAccountId);
  if (!bank || bank.entityId !== entityId) notFound();
  const status = first(sp.status) ?? "unmatched", month = first(sp.month), q = first(sp.q)?.toLowerCase();
  const all = await db.list("bank_transactions", { where: { entityId, bankAccountId } });
  const months = [...new Set(all.map((t) => t.date.slice(0, 7)))].sort().reverse();
  const rows = all.filter((t) => (status === "all" || t.status === status) && (!month || t.date.startsWith(month)) && (!q || t.description.toLowerCase().includes(q) || t.reference?.toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const journalIds = rows.map((t) => t.matchedJournalId).filter((x): x is string => Boolean(x));
  const journals = await db.getMany("journal_entries", journalIds);
  const writable = can(user, "books:write");
  const b = base(entityId);
  const here = `${b}/bank/${bank.id}`;
  const current = { status, month, q };
  const counts = { unmatched: all.filter((t) => t.status === "unmatched").length, matched: all.filter((t) => t.status === "matched").length, excluded: all.filter((t) => t.status === "excluded").length };
  const inflow = rows.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0), outflow = rows.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs text-ink-500"><Link href={`${b}/bank`} className="hover:underline">Bank</Link> / {bank.name}</p><h2 className="text-xl font-bold">{bank.name} <span className="text-sm font-normal text-ink-500">{bank.bankName} {bank.accountNumber} · {bank.currency}</span></h2></div>
        <div className="flex gap-2"><Link href={`${here}/import`} className="btn-primary">Import CSV</Link></div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Unmatched" value={counts.unmatched} tone={counts.unmatched ? "text-amber-700" : ""} />
        <Stat label="Matched" value={counts.matched} />
        <Stat label="Money in (filtered)" value={fmtMoney(inflow, bank.currency)} />
        <Stat label="Money out (filtered)" value={fmtMoney(outflow, bank.currency)} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chips items={[{ href: withParams(here, current, { status: "unmatched" }), label: `Unmatched (${counts.unmatched})`, active: status === "unmatched" }, { href: withParams(here, current, { status: "matched" }), label: `Matched (${counts.matched})`, active: status === "matched" }, { href: withParams(here, current, { status: "excluded" }), label: `Excluded (${counts.excluded})`, active: status === "excluded" }, { href: withParams(here, current, { status: "all" }), label: "All", active: status === "all" }]} />
        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="status" value={status} />
          <select name="month" defaultValue={month ?? ""} className="input !w-auto !py-1"><option value="">All months</option>{months.map((m) => <option key={m} value={m}>{periodLabel(m)}</option>)}</select>
          <input name="q" defaultValue={q} placeholder="Search description…" className="input !w-56 !py-1" />
          <button className="btn-secondary !py-1 text-xs">Filter</button>
        </form>
      </div>
      {rows.length === 0 ? <EmptyState title={all.length === 0 ? "No statement lines yet" : "Nothing here"} hint={all.length === 0 ? "Import a CSV export from the bank to start reconciling." : "Change the filter."} action={all.length === 0 ? <Link href={`${here}/import`} className="btn-primary">Import CSV</Link> : undefined} /> : (
        <Card className="overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Date</th><th>Description</th><th>Ref</th><th className="num">In</th><th className="num">Out</th><th className="num">Balance</th><th>Status</th><th>Matched to</th><th></th></tr></thead>
            <tbody>
              {rows.slice(0, 500).map((t) => {
                const j = t.matchedJournalId ? journals.get(t.matchedJournalId) : undefined;
                const docHref = t.matchedDocument?.type === "invoice" ? `${b}/sales/${t.matchedDocument.id}` : t.matchedDocument?.type === "bill" ? `${b}/purchases/${t.matchedDocument.id}` : j ? `${b}/journal/${j.id}` : undefined;
                return (
                  <tr key={t.id} className={t.status === "excluded" ? "opacity-50" : ""}>
                    <td className="pl-4 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="max-w-md"><span className="line-clamp-2">{t.description}</span></td>
                    <td className="text-xs text-ink-500">{t.reference ?? ""}</td>
                    <td className="num text-green-700">{t.amount > 0 ? fmtMoney(t.amount, bank.currency) : ""}</td>
                    <td className="num text-red-700">{t.amount < 0 ? fmtMoney(-t.amount, bank.currency) : ""}</td>
                    <td className="num text-xs text-ink-500">{t.balance !== undefined ? fmtMoney(t.balance, bank.currency) : ""}</td>
                    <td><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                    <td className="text-xs">{docHref ? <Link href={docHref} className="text-brand-600 underline">{t.matchedDocument?.type ?? "journal"}{j ? ` ${j.number}` : ""}</Link> : ""}</td>
                    <td className="whitespace-nowrap text-xs no-print">
                      {t.status === "unmatched" && <Link href={`${here}/tx/${t.id}`} className="btn-primary !px-2 !py-1 text-xs">Match</Link>}
                      {writable && t.status === "unmatched" && <form action={excludeTxAction.bind(null, entityId, bank.id, t.id)} className="ml-2 inline"><input type="hidden" name="back" value={withParams(here, current, {})} /><button className="text-ink-500 underline" type="submit">exclude</button></form>}
                      {writable && t.status === "excluded" && <form action={excludeTxAction.bind(null, entityId, bank.id, t.id)} className="inline"><input type="hidden" name="restore" value="1" /><input type="hidden" name="back" value={withParams(here, current, {})} /><button className="text-brand-600 underline" type="submit">restore</button></form>}
                      {writable && t.status === "matched" && <ConfirmForm action={unmatchTxAction.bind(null, entityId, bank.id, t.id)} message="Unmatch this line? The linked receipt/payment or quick journal will be reversed (voided)."><button className="text-red-600 underline" type="submit">unmatch</button></ConfirmForm>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 500 && <p className="p-3 text-xs text-ink-500">Showing 500 of {rows.length} lines.</p>}
        </Card>
      )}
    </div>
  );
}
