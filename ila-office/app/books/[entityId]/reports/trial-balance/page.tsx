import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { trialBalance } from "@/lib/ledger";
import { fmtDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Card, Notice } from "@/components/ui";
import { base, first, requireEntity, type Params, type Search } from "../../shared";
import { loadReportData, defaultRange } from "../_data";
import { ReportHeader } from "../ReportHeader";

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
    <div className="pb-8">
      <ReportHeader title="Trial balance" subtitle={`As of ${fmtDate(asOf)} · ${tb.rows.length} accounts`} entityLegalName={data.entity.legalName} csvHref={`/api/books/${entityId}/reports/trial-balance?asOf=${asOf}`}>
        <label className="block"><span className="label">As of</span><input name="asOf" type="date" defaultValue={asOf} className="input !py-1" /></label>
      </ReportHeader>
      {!tb.balanced && <div className="mb-3"><Notice tone="red">Out of balance: debits {fmtMoney(tb.totalDebit)} vs credits {fmtMoney(tb.totalCredit)}.</Notice></div>}
      <Card className="overflow-x-auto !p-0">
        <table className="table">
          <thead><tr><th className="pl-4">Code</th><th>Account</th><th>Type</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
          <tbody>
            {tb.rows.map((r) => <tr key={r.account.id}><td className="pl-4 font-mono text-xs">{r.account.code}</td><td><Link href={`${b}/reports/general-ledger?accountId=${r.account.id}&to=${asOf}`} className="hover:underline">{r.account.name}</Link></td><td className="text-xs text-ink-500">{r.account.type}</td><td className="num">{r.debit ? fmtMoney(r.debit) : ""}</td><td className="num">{r.credit ? fmtMoney(r.credit) : ""}</td></tr>)}
            {tb.rows.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-sm text-ink-500">No posted entries up to this date.</td></tr>}
          </tbody>
          <tfoot><tr className="border-t-2 border-slate-300 font-semibold"><td className="pl-4 py-2" colSpan={3}>Total</td><td className="num py-2">{fmtMoney(tb.totalDebit)}</td><td className="num py-2">{fmtMoney(tb.totalCredit)}</td></tr></tfoot>
        </table>
      </Card>
    </div>
  );
}
