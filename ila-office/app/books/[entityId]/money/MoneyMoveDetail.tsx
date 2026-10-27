import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { entityAccounts } from "@/lib/books";
import { fmtDate, fmtDateTime, periodOf } from "@/lib/dates";
import { fmtMoney, toIDR } from "@/lib/money";
import { isMoneyMove, moneyMoveKindOf, type MoneyMoveKind } from "@/lib/money-moves";
import { Badge, statusTone, Card, Cols, Dash, DL, TableCard } from "@/components/ui";
import { ConfirmForm } from "@/components/client";
import { Attachments } from "@/components/Attachments";
import { ErrorNotice, base, first, requireEntity, type Search } from "../shared";
import { MONEY_MOVE_META, moneyMoveBase } from "./shared";

const METHOD_LABEL: Record<string, string> = { transfer: "Bank transfer", cash: "Cash", card: "Card", other: "Other" };

/** Detail page shared by /expenses/[paymentId] and /deposits/[paymentId]: lines, details, void, attachments. */
export async function MoneyMoveDetailPage({ kind, voidAction, params, searchParams }: {
  kind: MoneyMoveKind;
  voidAction: (entityId: string, paymentId: string) => Promise<void>;
  params: Promise<{ entityId: string; paymentId: string }>;
  searchParams: Search;
}) {
  const user = await requireUser();
  const { entityId, paymentId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const p = await db.get("payments", paymentId);
  if (!p || p.entityId !== entityId || !isMoneyMove(p) || moneyMoveKindOf(p) !== kind) notFound();
  const [accounts, bank, journal, creator, lock, tx] = await Promise.all([
    entityAccounts(entityId),
    db.get("bank_accounts", p.bankAccountId),
    p.journalId ? db.get("journal_entries", p.journalId) : Promise.resolve(null),
    p.createdByUserId ? db.get("users", p.createdByUserId) : Promise.resolve(null),
    db.get("periods", `${entityId}:${periodOf(p.date)}`),
    p.bankTransactionId ? db.get("bank_transactions", p.bankTransactionId) : Promise.resolve(null),
  ]);
  const meta = MONEY_MOVE_META[kind];
  const status = p.status === "void" || journal?.status === "void" ? "void" : "posted";
  const writable = can(user, "books:write");
  const locked = Boolean(lock?.locked);
  const ccy = p.currency;
  const b = base(entityId);
  const list = moneyMoveBase(entityId, kind);
  const here = `${list}/${p.id}`;
  const accName = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : id; };
  const lines = p.lines ?? [];
  const bankLabel = bank ? `${bank.name} (${bank.currency})` : p.bankAccountId;
  const txMatched = Boolean(tx && tx.status === "matched" && tx.matchedJournalId === p.journalId);
  const details: Array<[ReactNode, ReactNode]> = [
    ["Date", fmtDate(p.date)],
    ["Bank account", bank ? <Link href={`${b}/bank/${bank.id}`} className="text-brand-600 underline">{bankLabel}</Link> : p.bankAccountId],
    [meta.party, p.payee ?? "—"],
    ["Memo", p.memo ?? "—"],
    ["Reference", p.reference ?? "—"],
    ["Method", METHOD_LABEL[p.method ?? ""] ?? p.method ?? "—"],
  ];
  if (ccy !== "IDR") details.push(["FX rate", `IDR ${p.fxRate} per 1 ${ccy}`]);
  details.push(["Journal", journal ? <><Link href={`${b}/journal/${journal.id}`} className="text-brand-600 underline">{journal.number}</Link>{journal.status !== "posted" && <> <Badge tone={statusTone(journal.status)}>{journal.status}</Badge></>}</> : "—"]);
  details.push(["Statement line", tx ? <>{fmtDate(tx.date)} · {tx.description.slice(0, 60)} · <Link href={`${b}/bank/${tx.bankAccountId}?status=${tx.status}`} className="text-brand-600 underline">{txMatched ? "matched" : tx.status}</Link></> : "not linked"]);
  details.push(["Created by", creator?.name ?? "—"], ["Created", fmtDateTime(p.createdAt)]);
  if (p.voidedAt) details.push(["Voided", fmtDateTime(p.voidedAt)]);
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-500"><Link href={list} className="hover:underline">{meta.plural}</Link> / {journal?.number ?? meta.label}</p>
          <h2 className="text-xl font-bold">{meta.label} {fmtMoney(p.amount, ccy)} <Badge tone={statusTone(status)}>{status}</Badge></h2>
          <p className="text-sm text-ink-700">{p.memo || meta.label}{p.payee ? ` · ${p.payee}` : ""} · {fmtDate(p.date)} · {bankLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          {locked && <Badge tone="amber">period locked</Badge>}
          {writable && status === "posted" && !locked && (
            <ConfirmForm action={voidAction.bind(null, entityId, p.id)} message={`Void this ${meta.label.toLowerCase()}? ${journal ? `${journal.number} is voided too` : "Its journal entry is voided"}${txMatched ? " and the matched statement line becomes unmatched again" : ""}.`}>
              <button className="btn-danger" type="submit">Void</button>
            </ConfirmForm>
          )}
          {writable && <Link href={`${list}/new`} className="btn-secondary">{meta.newLabel}</Link>}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <TableCard>
            <table className="table table-data min-w-[640px]">
              <Cols widths={ccy === "IDR" ? [260, undefined, 150] : [240, undefined, 140, 150]} />
              <thead><tr><th>Account</th><th>Description</th><th className="num">Amount ({ccy})</th>{ccy !== "IDR" && <th className="num">IDR @ {p.fxRate}</th>}</tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td><Link href={`${b}/reports/general-ledger?accountId=${l.accountId}`} className="cell" title={accName(l.accountId)}>{accName(l.accountId)}</Link></td>
                    <td>{l.description ? <span className="cell" title={l.description}>{l.description}</span> : <Dash />}</td>
                    <td className="num"><span className="money">{fmtMoney(l.amount, ccy)}</span></td>
                    {ccy !== "IDR" && <td className="num"><span className="money">{fmtMoney(toIDR(l.amount, ccy, p.fxRate))}</span></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={2} className="text-right">{kind === "expense" ? `Total paid from ${bank?.name ?? "bank"}` : `Total received into ${bank?.name ?? "bank"}`}</td><td className="num">{fmtMoney(p.amount, ccy)}</td>{ccy !== "IDR" && <td className="num">{fmtMoney(toIDR(p.amount, ccy, p.fxRate))}</td>}</tr>
              </tfoot>
            </table>
          </TableCard>
          <Attachments entityId={entityId} docType="payment" docId={p.id} items={p.attachments ?? []} canWrite={writable} backTo={here} />
        </div>
        <Card title="Details">
          <DL items={details} />
        </Card>
      </div>
    </div>
  );
}
