import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { generalLedger, generalLedgerAll } from "@/lib/ledger";
import { fmtDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Cols, Dash, EmptyState, TableCard } from "@/components/ui";
import { accountLabel, base, first, requireEntity, type Params, type Search } from "../../shared";
import { loadReportData, defaultRange } from "../_data";
import { ReportHeader, exportHrefs } from "../ReportHeader";

export const dynamic = "force-dynamic";

export default async function GeneralLedgerPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const data = (await loadReportData(entityId))!;
  const { from, to } = defaultRange(data.entity, { from: first(sp.from), to: first(sp.to) });
  const accountId = first(sp.accountId) ?? data.accounts.find((a) => a.taxTag === "bank_default")?.id ?? data.accounts[0]?.id;
  const allAccounts = accountId === "all";
  const includeZero = first(sp.zero) === "1";
  const account = allAccounts ? undefined : data.accounts.find((a) => a.id === accountId);
  const gl = account ? generalLedger(account, data.entries, { from, to }) : null;
  const all = allAccounts ? generalLedgerAll(data.accounts, data.entries, { from, to }, { includeInactive: includeZero }) : null;
  const b = base(entityId);
  const sorted = [...data.accounts].sort((x, y) => x.code.localeCompare(y.code));
  const exportBase = `/api/books/${entityId}/reports/general-ledger?accountId=${allAccounts ? "all" : accountId ?? ""}&from=${from}&to=${to}${allAccounts && includeZero ? "&zero=1" : ""}`;
  return (
    <div className="report pb-8">
      {/* Seven columns: print sideways. */}
      <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>
      <ReportHeader title="General ledger" subtitle={all ? `All accounts${includeZero ? "" : " with activity"} · ${all.ledgers.length} account${all.ledgers.length === 1 ? "" : "s"} · ${fmtDate(from)} – ${fmtDate(to)}` : account ? `${accountLabel(account)} · ${fmtDate(from)} – ${fmtDate(to)} · ${account.normalBalance} balance` : "Pick an account"} entityLegalName={data.entity.legalName} {...exportHrefs(exportBase, !!account || !!all)}>
        <label className="block"><span className="label">Account</span><select name="accountId" defaultValue={allAccounts ? "all" : accountId} className="input !w-72 !py-1"><option value="all">All accounts (one file, grouped by account)</option>{sorted.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}{a.active ? "" : " (inactive)"}</option>)}</select></label>
        <label className="block"><span className="label">From</span><input name="from" type="date" defaultValue={from} className="input !py-1" /></label>
        <label className="block"><span className="label">To</span><input name="to" type="date" defaultValue={to} className="input !py-1" /></label>
        <label className="flex items-center gap-2 pb-2 text-sm" title="Only applies to the all-accounts view"><input type="checkbox" name="zero" value="1" defaultChecked={includeZero} className="checkbox" /> Include accounts without movement</label>
      </ReportHeader>
      {all ? (
        <TableCard>
          <table className="table table-data min-w-[980px]">
            <Cols widths={[110, 130, undefined, 170, 140, 140, 150]} />
            <thead><tr><th>Date</th><th>Entry</th><th>Memo / description</th><th>Counterparty</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {all.ledgers.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-sm text-ink-500">No account has an opening balance or a movement in this range.</td></tr>}
              {all.ledgers.map((g) => [
                <tr key={`${g.account.id}-h`} className="group-row"><td colSpan={7}><Link href={`${b}/reports/general-ledger?accountId=${g.account.id}&from=${from}&to=${to}`} className="hover:underline"><span className="font-mono">{g.account.code}</span> · {g.account.name}</Link><span className="ml-2 font-normal normal-case text-ink-500">{g.account.normalBalance} balance</span></td></tr>,
                <tr key={`${g.account.id}-o`} className="bg-slate-50 font-medium"><td colSpan={6}>Opening balance at {fmtDate(from)}</td><td className="num money">{fmtMoney(g.opening)}</td></tr>,
                ...g.rows.map((r, i) => (
                  <tr key={`${g.account.id}-${r.entryId}-${i}`}>
                    <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td><Link href={`${b}/journal/${r.entryId}`} className="cell font-medium hover:underline">{r.number}</Link></td>
                    <td><span className="cell" title={r.memo}>{r.memo}</span>{r.description && r.description !== r.memo && <span className="cell-sub" title={r.description}>{r.description}</span>}</td>
                    <td>{r.counterpartyName ? <span className="cell text-xs" title={r.counterpartyName}>{r.counterpartyName}</span> : <Dash />}</td>
                    <td className="num money">{r.debit ? fmtMoney(r.debit) : ""}</td>
                    <td className="num money">{r.credit ? fmtMoney(r.credit) : ""}</td>
                    <td className={`num money ${r.balance < 0 ? "text-red-700" : ""}`}>{fmtMoney(r.balance)}</td>
                  </tr>
                )),
                <tr key={`${g.account.id}-c`} className="bg-slate-50 font-semibold"><td colSpan={4}>Closing balance at {fmtDate(to)}</td><td className="num money">{fmtMoney(g.totalDebit)}</td><td className="num money">{fmtMoney(g.totalCredit)}</td><td className="num money">{fmtMoney(g.closing)}</td></tr>,
              ])}
            </tbody>
            <tfoot><tr><td colSpan={4}>Total movements · {all.ledgers.length} accounts{all.accountsSkipped ? ` (${all.accountsSkipped} without movement hidden)` : ""}</td><td className="num money">{fmtMoney(all.totalDebit)}</td><td className="num money">{fmtMoney(all.totalCredit)}</td><td /></tr></tfoot>
          </table>
        </TableCard>
      ) : !gl ? <EmptyState title="No account selected" /> : (
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
      {gl && <p className="no-print mt-2 text-xs text-ink-500">Running balance in the account&apos;s natural sign ({account!.normalBalance}); the opening balance sums every posted line before {fmtDate(from)}. Export to Excel for reconciliation work.</p>}
      {all && <p className="no-print mt-2 text-xs text-ink-500">One file for the whole chart of accounts: the Excel export has the grouped ledger on one sheet and a per-account summary on a second; CSV and PDF follow the same grouping. Each balance runs in the account&apos;s natural sign.</p>}
    </div>
  );
}
