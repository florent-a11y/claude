import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { profitAndLoss, type ProfitAndLoss } from "@/lib/ledger";
import { fmtDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Card } from "@/components/ui";
import { base, first, requireEntity, type Params, type Search } from "../../shared";
import { loadReportData, defaultRange, previousRange } from "../_data";
import { ReportHeader } from "../ReportHeader";

export const dynamic = "force-dynamic";

export default async function ProfitLossPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const data = (await loadReportData(entityId))!;
  const { from, to } = defaultRange(data.entity, { from: first(sp.from), to: first(sp.to) });
  const compare = first(sp.compare) === "1";
  const pl = profitAndLoss(data.accounts, data.entries, { from, to });
  const prev = compare ? previousRange(from, to) : undefined;
  const plPrev = prev ? profitAndLoss(data.accounts, data.entries, prev) : undefined;
  const prevAmount = (accountId: string, key: string) => plPrev?.sections.find((s) => s.key === key)?.rows.find((r) => r.account.id === accountId)?.amount ?? 0;
  const b = base(entityId);
  const money = (n: number) => <span className={n < 0 ? "text-red-700" : ""}>{fmtMoney(n)}</span>;
  const summary: Array<[string, (p: ProfitAndLoss) => number, boolean]> = [["Gross profit", (p) => p.grossProfit, true], ["Operating profit", (p) => p.operatingProfit, true], ["Profit before tax", (p) => p.profitBeforeTax, true], ["Net profit", (p) => p.netProfit, true]];
  const afterSection: Record<string, string> = { cogs: "Gross profit", opex: "Operating profit", other_expense: "Profit before tax", tax: "Net profit" };
  return (
    <div className="pb-8">
      <ReportHeader title="Profit & loss" subtitle={`${fmtDate(from)} – ${fmtDate(to)}${prev ? ` · compared with ${fmtDate(prev.from)} – ${fmtDate(prev.to)}` : ""}`} entityLegalName={data.entity.legalName} csvHref={`/api/books/${entityId}/reports/profit-loss?from=${from}&to=${to}${compare ? "&compare=1" : ""}`}>
        <label className="block"><span className="label">From</span><input name="from" type="date" defaultValue={from} className="input !py-1" /></label>
        <label className="block"><span className="label">To</span><input name="to" type="date" defaultValue={to} className="input !py-1" /></label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="compare" value="1" defaultChecked={compare} className="checkbox" /> Previous period</label>
      </ReportHeader>
      <Card className="overflow-x-auto !p-0">
        <table className="table">
          <thead><tr><th className="pl-4">Account</th><th className="num">{fmtDate(from)} – {fmtDate(to)}</th>{plPrev && <th className="num">Previous</th>}{plPrev && <th className="num">Change</th>}</tr></thead>
          <tbody>
            {pl.sections.map((s) => {
              const prevSection = plPrev?.sections.find((x) => x.key === s.key);
              const ids = new Set([...s.rows.map((r) => r.account.id), ...(prevSection?.rows.map((r) => r.account.id) ?? [])]);
              const rows = data.accounts.filter((a) => ids.has(a.id)).sort((x, y) => x.code.localeCompare(y.code));
              const sectionTotalPrev = prevSection?.total ?? 0;
              const summaryRow = afterSection[s.key];
              const sum = summary.find((x) => x[0] === summaryRow);
              return [
                <tr key={`${s.key}-h`} className="bg-slate-50"><td className="pl-4 py-1 text-xs font-semibold uppercase tracking-wide text-ink-500" colSpan={plPrev ? 4 : 2}>{s.label}</td></tr>,
                ...rows.map((a) => {
                  const cur = s.rows.find((r) => r.account.id === a.id)?.amount ?? 0;
                  const pv = prevAmount(a.id, s.key);
                  return <tr key={a.id}><td className="pl-8"><span className="mr-2 font-mono text-xs text-ink-500">{a.code}</span><Link href={`${b}/reports/general-ledger?accountId=${a.id}&from=${from}&to=${to}`} className="hover:underline">{a.name}</Link></td><td className="num">{money(cur)}</td>{plPrev && <td className="num">{money(pv)}</td>}{plPrev && <td className="num text-xs">{money(cur - pv)}</td>}</tr>;
                }),
                rows.length === 0 ? <tr key={`${s.key}-e`}><td className="pl-8 text-xs text-ink-500" colSpan={plPrev ? 4 : 2}>—</td></tr> : null,
                <tr key={`${s.key}-t`} className="font-semibold"><td className="pl-4 py-1">Total {s.label.toLowerCase()}</td><td className="num py-1">{money(s.total)}</td>{plPrev && <td className="num py-1">{money(sectionTotalPrev)}</td>}{plPrev && <td className="num py-1 text-xs">{money(s.total - sectionTotalPrev)}</td>}</tr>,
                sum ? <tr key={`${s.key}-s`} className="border-t border-slate-200 bg-brand-50/40 font-bold"><td className="pl-4 py-2">{sum[0]}</td><td className="num py-2">{money(sum[1](pl))}</td>{plPrev && <td className="num py-2">{money(sum[1](plPrev))}</td>}{plPrev && <td className="num py-2 text-xs">{money(sum[1](pl) - sum[1](plPrev))}</td>}</tr> : null,
              ];
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-ink-500">Natural signs: revenue and expenses positive; a negative revenue line is a credit note or discount. Income tax shows the booked CIT/final tax expense.</p>
    </div>
  );
}
