import Link from "next/link";
import { Paperclip } from "lucide-react";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, periodLabel, periodOf, todayISO } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import type { MoneyMoveKind } from "@/lib/money-moves";
import type { Payment } from "@/lib/types";
import { Badge, statusTone, Cols, Dash, EmptyState, Select, TableCard } from "@/components/ui";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../shared";
import { MONEY_MOVE_META, listMoneyMoves, moneyMoveBase, monthOptions } from "./shared";

/** List page shared by /expenses and /deposits: one month (default the current one) and optionally one bank account. */
export async function MoneyMoveListPage({ kind, params, searchParams }: { kind: MoneyMoveKind; params: Params; searchParams: Search }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const meta = MONEY_MOVE_META[kind];
  const current = periodOf(todayISO());
  const period = first(sp.period) ?? current;
  const bankFilter = first(sp.bank);
  const [all, banks] = await Promise.all([listMoneyMoves(entityId, kind), db.list("bank_accounts", { where: { entityId }, orderBy: "name" })]);
  const rows = all.filter((p) => (period === "all" || periodOf(p.date) === period) && (!bankFilter || p.bankAccountId === bankFilter));
  const journals = await db.getMany("journal_entries", rows.map((p) => p.journalId).filter((x): x is string => Boolean(x)));
  const bankName = (id: string) => banks.find((x) => x.id === id)?.name ?? id;
  // A journal voided from the Journal tab makes the entry void too.
  const statusOf = (p: Payment) => (p.status === "void" || (p.journalId && journals.get(p.journalId)?.status === "void") ? "void" : "posted");
  const totals = new Map<string, number>();
  for (const p of rows) if (statusOf(p) === "posted") totals.set(p.currency, (totals.get(p.currency) ?? 0) + p.amount);
  const totalLabel = [...totals.entries()].map(([ccy, amt]) => fmtMoney(amt, ccy)).join(" · ") || fmtMoney(0, banks.find((x) => x.id === bankFilter)?.currency ?? "IDR");
  const writable = can(user, "books:write");
  const b = base(entityId);
  const here = moneyMoveBase(entityId, kind);
  const periodText = period === "all" ? "all months" : periodLabel(period);
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-ink-500">{meta.hint}</p>
        {writable && <Link href={`${here}/new`} className="btn-primary shrink-0">{meta.newLabel}</Link>}
      </div>
      <form method="get" className="flex flex-wrap items-center gap-2">
        <Select name="period" defaultValue={period} options={[...monthOptions(all, current).map((m) => ({ value: m, label: periodLabel(m) })), { value: "all", label: "All months" }]} className="input !w-auto !py-1" />
        <Select name="bank" defaultValue={bankFilter ?? ""} options={[{ value: "", label: "All bank accounts" }, ...banks.map((x) => ({ value: x.id, label: `${x.name} (${x.currency})` }))]} className="input !w-auto !py-1" />
        <button className="btn-secondary !py-1 text-xs">Filter</button>
        <span className="text-xs text-ink-500">{rows.length} {rows.length === 1 ? meta.label.toLowerCase() : meta.plural.toLowerCase()} in {periodText}</span>
      </form>
      {rows.length === 0 ? <EmptyState title={`No ${meta.plural.toLowerCase()} in ${periodText}`} hint={meta.emptyHint} action={writable ? <Link href={`${here}/new`} className="btn-primary">{meta.newLabel}</Link> : undefined} /> : (
        <TableCard>
          <table className="table table-data min-w-[1040px]">
            <Cols widths={[112, 130, 170, undefined, 170, 150, 86, 56]} />
            <thead><tr><th>Date</th><th>Entry</th><th>{meta.party}</th><th>Memo</th><th>Bank account</th><th className="num">Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const j = p.journalId ? journals.get(p.journalId) : undefined;
                const status = statusOf(p);
                const clips = p.attachments?.length ?? 0;
                return (
                  <tr key={p.id} className={status === "void" ? "row-muted" : ""}>
                    <td className="whitespace-nowrap">{fmtDate(p.date)}</td>
                    <td>{j ? <Link href={`${b}/journal/${j.id}`} className="cell font-medium" title={j.number}>{j.number}</Link> : <Dash />}</td>
                    <td>{p.payee ? <span className="cell" title={p.payee}>{p.payee}</span> : <Dash />}</td>
                    <td>
                      <Link href={`${here}/${p.id}`} className={status === "void" ? "cell font-medium" : "cell-primary"} title={p.memo ?? ""}>{p.memo || meta.label}</Link>
                      {p.reference && <span className="cell-sub" title={p.reference}>{p.reference}</span>}
                    </td>
                    <td><span className="cell" title={bankName(p.bankAccountId)}>{bankName(p.bankAccountId)}</span></td>
                    <td className="num"><span className="money">{fmtMoney(p.amount, p.currency)}</span>{p.currency !== "IDR" && <span className="cell-sub">@ {p.fxRate}</span>}</td>
                    <td><Badge tone={statusTone(status)}>{status}</Badge></td>
                    <td className="text-right">{clips > 0 ? <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs text-ink-500" title={`${clips} attachment${clips === 1 ? "" : "s"}`}><Paperclip className="h-3.5 w-3.5" aria-hidden="true" />{clips}</span> : <Dash />}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={5} className="text-right">Total posted ({periodText})</td><td className="num"><span className="money">{totalLabel}</span></td><td colSpan={2}></td></tr></tfoot>
          </table>
        </TableCard>
      )}
    </div>
  );
}
