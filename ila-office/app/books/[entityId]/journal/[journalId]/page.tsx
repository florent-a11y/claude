import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { entityAccounts } from "@/lib/books";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Card, Badge, statusTone, DL, Cols, Dash, TableCard } from "@/components/ui";
import { ConfirmForm } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Search } from "../../shared";
import { voidJournalAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function JournalEntryPage({ params, searchParams }: { params: Promise<{ entityId: string; journalId: string }>; searchParams: Search }) {
  const user = await requireUser();
  const { entityId, journalId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const [entry, accounts] = await Promise.all([db.get("journal_entries", journalId), entityAccounts(entityId)]);
  if (!entry || entry.entityId !== entityId) notFound();
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const b = base(entityId);
  const sourceLink = entry.sourceId ? ({ invoice: `${b}/sales/${entry.sourceId}`, receipt: `${b}/sales/${entry.sourceId}`, bill: `${b}/purchases/${entry.sourceId}`, disbursement: `${b}/purchases/${entry.sourceId}`, depreciation: `${b}/assets`, adjustment: `${b}/assets/${entry.sourceId}` } as Record<string, string>)[entry.source] : undefined;
  const totalD = entry.lines.reduce((s, l) => s + l.debit, 0), totalC = entry.lines.reduce((s, l) => s + l.credit, 0);
  const lock = await db.get("periods", `${entityId}:${entry.period}`);
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-500"><Link href={`${b}/journal`} className="hover:underline">Journal</Link> / {entry.number}</p>
          <h2 className="text-xl font-bold">{entry.number} <Badge tone={statusTone(entry.status)}>{entry.status}</Badge></h2>
          <p className="text-sm text-ink-700">{entry.memo}</p>
        </div>
        <div className="flex gap-2 no-print">
          {can(user, "books:write") && entry.status === "posted" && !lock?.locked && (
            <ConfirmForm action={voidJournalAction.bind(null, entityId, journalId)} message={`Void ${entry.number}? It stays in the audit trail but no longer affects balances.`}><button className="btn-danger" type="submit">Void</button></ConfirmForm>
          )}
          {lock?.locked && <Badge tone="amber">period locked</Badge>}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <TableCard>
          <table className="table table-data min-w-[800px]">
            <Cols widths={[236, undefined, 130, 136, 136]} />
            <thead><tr><th>Account</th><th>Description</th><th>Counterparty</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
            <tbody>
              {entry.lines.map((l, i) => {
                const a = byId.get(l.accountId);
                const fx = l.currency ? `(${l.currency} ${l.fxAmount} @ ${l.fxRate})` : "";
                return (
                  <tr key={i}>
                    <td><Link href={`${b}/reports/general-ledger?accountId=${l.accountId}`} className="cell" title={`${l.accountCode} ${a?.name ?? ""}`}><span className="font-mono text-xs">{l.accountCode}</span> {a?.name ?? ""}</Link></td>
                    <td>{l.description || fx ? <span className="cell" title={[l.description, fx].filter(Boolean).join(" ")}>{l.description ?? ""}{fx && <span className="ml-1 text-xs text-ink-500">{fx}</span>}</span> : <Dash />}</td>
                    <td>{l.counterpartyName ? <span className="cell text-xs" title={l.counterpartyName}>{l.counterpartyName}</span> : <Dash />}</td>
                    <td className="num">{l.debit ? <span className="money">{fmtMoney(l.debit)}</span> : <Dash />}</td>
                    <td className="num">{l.credit ? <span className="money">{fmtMoney(l.credit)}</span> : <Dash />}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={3}>Totals</td><td className="num">{fmtMoney(totalD)}</td><td className="num">{fmtMoney(totalC)}</td></tr></tfoot>
          </table>
        </TableCard>
        <Card title="Details">
          <DL items={[["Date", fmtDate(entry.date)], ["Period", entry.period], ["Source", sourceLink ? <Link href={sourceLink} className="text-brand-600 underline">{entry.source}</Link> : entry.source], ["Posted", fmtDateTime(entry.postedAt)], ["Voided", entry.voidedAt ? fmtDateTime(entry.voidedAt) : "—"], ["Created", fmtDateTime(entry.createdAt)]]} />
        </Card>
      </div>
    </div>
  );
}
