import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { entityAccounts } from "@/lib/books";
import { editProblem } from "@/lib/posting";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import type { JournalEntry, JournalLine } from "@/lib/types";
import { Card, Badge, statusTone, DL, Cols, Dash, TableCard, CardTable } from "@/components/ui";
import { ConfirmForm } from "@/components/client";
import { Attachments } from "@/components/Attachments";
import { ErrorNotice, base, first, requireEntity, type Search } from "../../shared";
import { voidJournalAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Where the entry came from: the document that generated it, or the bank pages. `bank` entries point at the
 * expense/deposit (payments without a bill or invoice), the bill or invoice a payment settled, or the bank overview
 * for statement postings and transfers.
 */
async function sourceHref(b: string, entry: JournalEntry): Promise<string | undefined> {
  const id = entry.sourceId;
  switch (entry.source) {
    case "invoice": case "receipt": return id ? `${b}/sales/${id}` : undefined;
    case "bill": case "disbursement": return id ? `${b}/purchases/${id}` : undefined;
    case "depreciation": return id ? `${b}/assets` : undefined;
    case "adjustment": return id ? `${b}/assets/${id}` : undefined;
    case "bank": {
      const payment = id ? await db.get("payments", id) : null;
      if (!payment || payment.entityId !== entry.entityId) return `${b}/bank`;
      if (payment.billId) return `${b}/purchases/${payment.billId}`;
      if (payment.invoiceId) return `${b}/sales/${payment.invoiceId}`;
      if (payment.kind === "disbursement") return `${b}/expenses/${payment.id}`;
      if (payment.kind === "receipt") return `${b}/deposits/${payment.id}`;
      return `${b}/bank`;
    }
    default: return undefined;
  }
}

const sum = (lines: JournalLine[], side: "debit" | "credit") => lines.reduce((s, l) => s + l[side], 0);

export default async function JournalEntryPage({ params, searchParams }: { params: Promise<{ entityId: string; journalId: string }>; searchParams: Search }) {
  const user = await requireUser();
  const { entityId, journalId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const [entry, accounts] = await Promise.all([db.get("journal_entries", journalId), entityAccounts(entityId)]);
  if (!entry || entry.entityId !== entityId) notFound();
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const b = base(entityId);
  const here = `${b}/journal/${journalId}`;
  const [sourceLink, lock] = await Promise.all([sourceHref(b, entry), db.get("periods", `${entityId}:${entry.period}`)]);
  const totalD = sum(entry.lines, "debit"), totalC = sum(entry.lines, "credit");
  const writer = can(user, "books:write");
  const locked = Boolean(lock?.locked);
  const editable = writer && !locked && editProblem(entry) === null;
  const revisions = (entry.revisions ?? []).map((r, i) => ({ ...r, version: i + 1 })).reverse();
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-500"><Link href={`${b}/journal`} className="hover:underline">Journal</Link> / {entry.number}</p>
          <h2 className="text-xl font-bold">
            {entry.number} <Badge tone={statusTone(entry.status)}>{entry.status}</Badge>
            {revisions.length > 0 && <Badge tone="blue" className="ml-1" title={`Edited ${revisions.length} time${revisions.length === 1 ? "" : "s"}, last ${fmtDateTime(entry.updatedAt)}`}>edited</Badge>}
          </h2>
          <p className="text-sm text-ink-700">{entry.memo}</p>
        </div>
        <div className="flex gap-2 no-print">
          {editable && <Link href={`${here}/edit`} className="btn-secondary">Edit</Link>}
          {writer && entry.status === "posted" && !locked && (
            <ConfirmForm action={voidJournalAction.bind(null, entityId, journalId)} message={`Void ${entry.number}? It stays in the audit trail but no longer affects balances.`}><button className="btn-danger" type="submit">Void</button></ConfirmForm>
          )}
          {locked && <Badge tone="amber">period locked</Badge>}
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
        <div className="space-y-4">
          <Card title="Details">
            <DL items={[
              ["Date", fmtDate(entry.date)], ["Period", entry.period],
              ["Source", sourceLink ? <Link href={sourceLink} className="text-brand-600 underline">{entry.source}</Link> : entry.source],
              ["Posted", fmtDateTime(entry.postedAt)], ["Voided", entry.voidedAt ? fmtDateTime(entry.voidedAt) : "—"], ["Created", fmtDateTime(entry.createdAt)],
              ...(revisions.length > 0 ? [["Last edited", `${fmtDateTime(entry.updatedAt)}${revisions[0].byName ? ` by ${revisions[0].byName}` : ""}`] as [string, string]] : []),
            ]} />
          </Card>
          <Attachments entityId={entityId} docType="journal" docId={entry.id} items={entry.attachments ?? []} canWrite={writer} backTo={here} />
        </div>
      </div>
      {revisions.length > 0 && (
        <Card title="Revisions" actions={<span className="text-xs text-ink-500">Previous versions of this entry, newest first</span>}>
          <CardTable>
            <table className="table table-data min-w-[760px]">
              <Cols widths={[70, 170, 150, 110, undefined, 64, 136, 136]} />
              <thead><tr><th>Version</th><th>Replaced</th><th>By</th><th>Was dated</th><th>Memo</th><th className="num">Lines</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
              <tbody>
                {revisions.map((r) => (
                  <tr key={r.version}>
                    <td className="font-mono text-xs">v{r.version}</td>
                    <td className="whitespace-nowrap">{fmtDateTime(r.at)}</td>
                    <td>{r.byName || r.byUserId ? <span className="cell" title={r.byName ?? r.byUserId}>{r.byName ?? r.byUserId}</span> : <Dash />}</td>
                    <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td><span className="cell" title={r.memo}>{r.memo}{r.source !== entry.source && <span className="ml-1 text-xs text-ink-500">({r.source})</span>}</span></td>
                    <td className="num">{r.lines.length}</td>
                    <td className="num"><span className="money">{fmtMoney(sum(r.lines, "debit"))}</span></td>
                    <td className="num"><span className="money">{fmtMoney(sum(r.lines, "credit"))}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardTable>
        </Card>
      )}
    </div>
  );
}
