import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, periodLabel, periodOf, todayISO } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { buildReconciliation } from "@/lib/reconciliation";
import { Badge, Cols, Dash, EmptyState, TableCard } from "@/components/ui";
import { base, requireEntity, type Params } from "../shared";

export const dynamic = "force-dynamic";

/** One line per bank account: where its reconciliation stands for the latest statement month. */
export default async function ReconciliationIndex({ params }: { params: Params }) {
  await requireUser();
  const { entityId } = await params;
  await requireEntity(entityId);
  const [banks, transactions, entries] = await Promise.all([
    db.list("bank_accounts", { where: { entityId } }),
    db.list("bank_transactions", { where: { entityId } }),
    db.list("journal_entries", { where: { entityId, status: "posted" } }),
  ]);
  const b = base(entityId);
  const rows = banks.filter((x) => x.active).sort((x, y) => x.name.localeCompare(y.name)).map((bank) => {
    const txs = transactions.filter((t) => t.bankAccountId === bank.id);
    const lastLine = txs.reduce<string | undefined>((m, t) => (!m || t.date > m ? t.date : m), undefined);
    const period = periodOf(lastLine ?? todayISO());
    const r = buildReconciliation({ bank, transactions: txs, entries, period });
    const signoffs = [...(bank.reconciliations ?? [])].sort((x, y) => y.period.localeCompare(x.period));
    return { bank, period, r, last: signoffs[0], lines: txs.length };
  });
  return (
    <div className="space-y-4 pb-8">
      <p className="text-sm text-ink-500">Every month, each bank account's statement closing balance is reconciled with the books: statement lines are matched to invoices, bills or journals, ledger entries that have not reached the bank yet are listed as outstanding, and the month is signed off.</p>
      {rows.length === 0 ? <EmptyState title="No bank account yet" hint="Add the bank accounts on the Bank tab, then import their statements." action={<Link href={`${b}/bank`} className="btn-primary">Bank accounts</Link>} /> : (
        <TableCard>
          <table className="table table-data min-w-[1000px]">
            <Cols widths={[undefined, 56, 150, 150, 160, 100, 150, 104]} />
            <thead><tr><th>Account</th><th>Ccy</th><th className="num">Statement balance</th><th className="num">Books balance</th><th className="num">Difference</th><th className="num">Unbooked</th><th>Last sign-off</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ bank, period, r, last, lines }) => (
                <tr key={bank.id}>
                  <td><Link href={`${b}/bank/${bank.id}/reconcile?period=${period}`} className="cell-primary" title={bank.name}>{bank.name}</Link><span className="cell-sub">{[bank.bankName, bank.accountNumber].filter(Boolean).join(" · ")}{lines ? ` · ${lines} statement lines` : " · no statement imported"}</span></td>
                  <td className="text-xs">{bank.currency}</td>
                  <td className="num">{r.statementBalance === null ? <Dash /> : <><span className="money">{fmtMoney(r.statementBalance, bank.currency)}</span><span className="cell-sub">{fmtDate(r.lastStatementDate)}</span></>}</td>
                  <td className="num"><span className="money">{fmtMoney(r.ledgerBalance, bank.currency)}</span><span className="cell-sub">{periodLabel(period)}</span></td>
                  <td className="num">{r.difference === null ? <Badge tone="slate">no statement balance</Badge> : r.balanced ? <Badge tone="green">balanced</Badge> : <span className="money text-red-700">{fmtMoney(r.difference, bank.currency)}</span>}</td>
                  <td className="num">{r.unbookedStatement.length ? <Badge tone="amber">{r.unbookedStatement.length}</Badge> : <span className="text-ink-500">0</span>}</td>
                  <td>{last ? <><span className="cell text-xs">{periodLabel(last.period)}</span><span className="cell-sub">{fmtDate(last.at.slice(0, 10))}{last.byName ? ` · ${last.byName}` : ""}</span></> : <span className="text-xs text-ink-500">never</span>}</td>
                  <td className="text-right text-xs"><Link href={`${b}/bank/${bank.id}/reconcile?period=${period}`} className="btn-secondary !px-2 !py-1 text-xs">Reconcile</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </div>
  );
}
