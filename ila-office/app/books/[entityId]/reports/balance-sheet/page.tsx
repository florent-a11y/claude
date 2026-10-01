import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { balanceSheet, type ReportSection } from "@/lib/ledger";
import { fmtDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Card, Notice } from "@/components/ui";
import { base, first, requireEntity, type Params, type Search } from "../../shared";
import { loadReportData, defaultRange } from "../_data";
import { ReportHeader } from "../ReportHeader";

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
    <table className="table">
      <tbody>
        {sections.map((s) => [
          <tr key={`${s.key}-h`} className="bg-slate-50"><td className="pl-4 py-1 text-xs font-semibold uppercase tracking-wide text-ink-500" colSpan={2}>{s.label}</td></tr>,
          ...s.rows.map((r) => <tr key={r.account.id}><td className="pl-8"><span className="mr-2 font-mono text-xs text-ink-500">{r.account.code}</span>{r.account.id.startsWith("synthetic:") ? r.account.name : <Link href={`${b}/reports/general-ledger?accountId=${r.account.id}&to=${asOf}`} className="hover:underline">{r.account.name}</Link>}{r.account.taxTag === "current_earnings" && <span className="ml-1 text-xs text-ink-500">(from {fmtDate(bs.fiscalYearStart)})</span>}</td><td className="num">{money(r.amount)}</td></tr>),
          s.rows.length === 0 ? <tr key={`${s.key}-e`}><td className="pl-8 text-xs text-ink-500" colSpan={2}>—</td></tr> : null,
          <tr key={`${s.key}-t`} className="font-semibold"><td className="pl-4 py-1">Total {s.label.toLowerCase()}</td><td className="num py-1">{money(s.total)}</td></tr>,
        ])}
        <tr className="border-t-2 border-slate-300 bg-brand-50/40 font-bold"><td className="pl-4 py-2">{label}</td><td className="num py-2">{money(total)}</td></tr>
      </tbody>
    </table>
  );
  return (
    <div className="pb-8">
      <ReportHeader title="Balance sheet" subtitle={`As of ${fmtDate(asOf)} · fiscal year from ${fmtDate(bs.fiscalYearStart)}`} entityLegalName={data.entity.legalName} csvHref={`/api/books/${entityId}/reports/balance-sheet?asOf=${asOf}`}>
        <label className="block"><span className="label">As of</span><input name="asOf" type="date" defaultValue={asOf} className="input !py-1" /></label>
      </ReportHeader>
      {!bs.balanced && <div className="mb-3"><Notice tone="red">Assets {fmtMoney(bs.totalAssets)} ≠ liabilities + equity {fmtMoney(bs.totalLiabilities + bs.totalEquity)}. Check for unbalanced or mis-typed accounts.</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-x-auto !p-0"><Section sections={bs.assets} total={bs.totalAssets} label="Total assets" /></Card>
        <div className="space-y-4">
          <Card className="overflow-x-auto !p-0"><Section sections={bs.liabilities} total={bs.totalLiabilities} label="Total liabilities" /></Card>
          <Card className="overflow-x-auto !p-0"><Section sections={bs.equity} total={bs.totalEquity} label="Total equity" /></Card>
          <Card className="!py-3"><div className="flex justify-between text-sm font-bold"><span>Total liabilities and equity</span><span className="tabular-nums">{fmtMoney(bs.totalLiabilities + bs.totalEquity)}</span></div><p className="mt-1 text-xs text-ink-500">Retained earnings {fmtMoney(bs.retainedEarnings)} include prior years' profit not yet closed; current-year earnings {fmtMoney(bs.currentYearEarnings)} come from the P&L since {fmtDate(bs.fiscalYearStart)}.</p></Card>
        </div>
      </div>
    </div>
  );
}
