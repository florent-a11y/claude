import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { balanceSheet, type ReportSection } from "@/lib/ledger";
import { fmtDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Card, Dash, Notice, TableCard } from "@/components/ui";
import { base, first, requireEntity, type Params, type Search } from "../../shared";
import { loadReportData, defaultRange } from "../_data";
import { ReportHeader, exportHrefs } from "../ReportHeader";

export const dynamic = "force-dynamic";

export default async function BalanceSheetPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const data = (await loadReportData(entityId))!;
  const { asOf } = defaultRange(data.entity, { asOf: first(sp.asOf) });
  const bs = balanceSheet(data.accounts, data.entries, asOf, data.entity.fiscalYearStartMonth);
  const b = base(entityId);
  const money = (n: number) => <span className={n < 0 ? "text-red-700" : ""}>{fmtMoney(n)}</span>;
  const Section = ({ sections, total, label }: { sections: ReportSection[]; total: number; label: string }) => (
    <table className="table table-statement">
      <colgroup><col /><col style={{ width: 170 }} /></colgroup>
      <tbody>
        {sections.map((s) => [
          <tr key={`${s.key}-h`} className="row-section"><td colSpan={2}>{s.label}</td></tr>,
          ...s.rows.map((r) => <tr key={r.account.id}><td className="indent"><span className="code">{r.account.code}</span>{r.account.id.startsWith("synthetic:") ? r.account.name : <Link href={`${b}/reports/general-ledger?accountId=${r.account.id}&to=${asOf}`} className="hover:underline">{r.account.name}</Link>}{r.account.taxTag === "current_earnings" && <span className="ml-1 text-xs text-ink-500">(from {fmtDate(bs.fiscalYearStart)})</span>}</td><td className="num">{money(r.amount)}</td></tr>),
          s.rows.length === 0 ? <tr key={`${s.key}-e`}><td className="indent text-xs text-ink-500" colSpan={2}><Dash /> no balances</td></tr> : null,
          // A group with a single section gets one total line only (the grand total below), not "Total equity" twice.
          sections.length > 1 ? <tr key={`${s.key}-t`} className="row-total"><td>Total {s.label.toLowerCase()}</td><td className="num">{money(s.total)}</td></tr> : null,
        ])}
        <tr className="row-grand"><td>{label}</td><td className="num">{money(total)}</td></tr>
      </tbody>
    </table>
  );
  return (
    <div className="report pb-8">
      <ReportHeader title="Balance sheet" subtitle={`As of ${fmtDate(asOf)} · fiscal year from ${fmtDate(bs.fiscalYearStart)}`} entityLegalName={data.entity.legalName} {...exportHrefs(`/api/books/${entityId}/reports/balance-sheet?asOf=${asOf}`, true)}>
        <label className="block"><span className="label">As of</span><input name="asOf" type="date" defaultValue={asOf} className="input !py-1" /></label>
      </ReportHeader>
      {!bs.balanced && <div className="mb-3"><Notice tone="red">Assets {fmtMoney(bs.totalAssets)} ≠ liabilities + equity {fmtMoney(bs.totalLiabilities + bs.totalEquity)}. Check for unbalanced or mis-typed accounts.</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <TableCard><Section sections={bs.assets} total={bs.totalAssets} label="Total assets" /></TableCard>
        <div className="space-y-4">
          <TableCard><Section sections={bs.liabilities} total={bs.totalLiabilities} label="Total liabilities" /></TableCard>
          <TableCard><Section sections={bs.equity} total={bs.totalEquity} label="Total equity" /></TableCard>
          <Card className="!py-3"><div className="flex justify-between text-sm font-bold"><span>Total liabilities and equity</span><span className="tabular-nums">{fmtMoney(bs.totalLiabilities + bs.totalEquity)}</span></div><p className="no-print mt-1 text-xs text-ink-500">Retained earnings {fmtMoney(bs.retainedEarnings)} include prior years&apos; profit not yet closed; current-year earnings {fmtMoney(bs.currentYearEarnings)} come from the P&amp;L since {fmtDate(bs.fiscalYearStart)}.</p></Card>
        </div>
      </div>
    </div>
  );
}
