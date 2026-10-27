import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { trialBalance } from "@/lib/ledger";
import { fmtDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Cols, Notice, TableCard } from "@/components/ui";
import { base, first, requireEntity, type Params, type Search } from "../../shared";
import { loadReportData, defaultRange } from "../_data";
import { ReportHeader, exportHrefs } from "../ReportHeader";

export const dynamic = "force-dynamic";

export default async function TrialBalancePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const data = (await loadReportData(entityId))!;
  const { asOf } = defaultRange(data.entity, { asOf: first(sp.asOf) });
  const tb = trialBalance(data.accounts, data.entries, asOf);
  const b = base(entityId);
  return (
    <div className="report pb-8">
      <ReportHeader title="Trial balance" subtitle={`As of ${fmtDate(asOf)} · ${tb.rows.length} accounts`} entityLegalName={data.entity.legalName} {...exportHrefs(`/api/books/${entityId}/reports/trial-balance?asOf=${asOf}`, true)}>
        <label className="block"><span className="label">As of</span><input name="asOf" type="date" defaultValue={asOf} className="input !py-1" /></label>
      </ReportHeader>
      {!tb.balanced && <div className="mb-3"><Notice tone="red">Out of balance: debits {fmtMoney(tb.totalDebit)} vs credits {fmtMoney(tb.totalCredit)}.</Notice></div>}
      <TableCard>
        <table className="table table-data min-w-[760px]">
          <Cols widths={[96, undefined, 120, 160, 160]} />
          <thead><tr><th>Code</th><th>Account</th><th>Type</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
          <tbody>
            {tb.rows.map((r) => <tr key={r.account.id}><td className="font-mono text-xs">{r.account.code}</td><td><Link href={`${b}/reports/general-ledger?accountId=${r.account.id}&to=${asOf}`} className="cell hover:underline" title={r.account.name}>{r.account.name}</Link></td><td className="text-xs text-ink-500">{r.account.type}</td><td className="num money">{r.debit ? fmtMoney(r.debit) : ""}</td><td className="num money">{r.credit ? fmtMoney(r.credit) : ""}</td></tr>)}
            {tb.rows.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-sm text-ink-500">No posted entries up to this date.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={3}>Total</td><td className="num money">{fmtMoney(tb.totalDebit)}</td><td className="num money">{fmtMoney(tb.totalCredit)}</td></tr></tfoot>
        </table>
      </TableCard>
      <p className="no-print mt-2 text-xs text-ink-500">Cumulative balances of every account with activity up to the date; an account appears in the debit column when its net balance is a debit. Click an account to open its ledger.</p>
    </div>
  );
}
