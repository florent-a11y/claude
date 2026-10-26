import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { generalLedger } from "@/lib/ledger";
import { fmtDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Cols, Dash, EmptyState, TableCard } from "@/components/ui";
import { accountLabel, base, first, requireEntity, type Params, type Search } from "../../shared";
import { loadReportData, defaultRange } from "../_data";
import { ReportHeader } from "../ReportHeader";

export const dynamic = "force-dynamic";

export default async function GeneralLedgerPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const data = (await loadReportData(entityId))!;
  const { from, to } = defaultRange(data.entity, { from: first(sp.from), to: first(sp.to) });
  const accountId = first(sp.accountId) ?? data.accounts.find((a) => a.taxTag === "bank_default")?.id ?? data.accounts[0]?.id;
  const account = data.accounts.find((a) => a.id === accountId);
  const gl = account ? generalLedger(account, data.entries, { from, to }) : null;
  const b = base(entityId);
  const sorted = [...data.accounts].sort((x, y) => x.code.localeCompare(y.code));
  return (
    <div className="pb-8">
      <ReportHeader title="General ledger" subtitle={account ? `${accountLabel(account)} · ${fmtDate(from)} – ${fmtDate(to)} · ${account.normalBalance} balance` : "Pick an account"} entityLegalName={data.entity.legalName} csvHref={`/api/books/${entityId}/reports/general-ledger?accountId=${accountId ?? ""}&from=${from}&to=${to}`}>
        <label className="block"><span className="label">Account</span><select name="accountId" defaultValue={accountId} className="input !w-72 !py-1">{sorted.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}{a.active ? "" : " (inactive)"}</option>)}</select></label>
        <label className="block"><span className="label">From</span><input name="from" type="date" defaultValue={from} className="input !py-1" /></label>
        <label className="block"><span className="label">To</span><input name="to" type="date" defaultValue={to} className="input !py-1" /></label>
      </ReportHeader>
      {!gl ? <EmptyState title="No account selected" /> : (
        <TableCard>
          <table className="table table-data min-w-[980px]">
            <Cols widths={[110, 130, undefined, 170, 140, 140, 150]} />
            <thead><tr><th>Date</th><th>Entry</th><th>Memo / description</th><th>Counterparty</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
            <tbody>
              <tr className="bg-slate-50 font-medium"><td colSpan={6}>Opening balance at {fmtDate(from)}</td><td className="num money">{fmtMoney(gl.opening)}</td></tr>
              {gl.rows.map((r, i) => (
                <tr key={`${r.entryId}-${i}`}>
                  <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td><Link href={`${b}/journal/${r.entryId}`} className="cell font-medium hover:underline">{r.number}</Link></td>
                  <td><span className="cell" title={r.memo}>{r.memo}</span>{r.description && r.description !== r.memo && <span className="cell-sub" title={r.description}>{r.description}</span>}</td>
                  <td>{r.counterpartyName ? <span className="cell text-xs" title={r.counterpartyName}>{r.counterpartyName}</span> : <Dash />}</td>
                  <td className="num money">{r.debit ? fmtMoney(r.debit) : ""}</td>
                  <td className="num money">{r.credit ? fmtMoney(r.credit) : ""}</td>
                  <td className={`num money ${r.balance < 0 ? "text-red-700" : ""}`}>{fmtMoney(r.balance)}</td>
                </tr>
              ))}
              {gl.rows.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-sm text-ink-500">No movements in this range.</td></tr>}
            </tbody>
            <tfoot><tr><td colSpan={4}>Closing balance at {fmtDate(to)}</td><td className="num money">{fmtMoney(gl.totalDebit)}</td><td className="num money">{fmtMoney(gl.totalCredit)}</td><td className="num money">{fmtMoney(gl.closing)}</td></tr></tfoot>
          </table>
        </TableCard>
      )}
    </div>
  );
}
