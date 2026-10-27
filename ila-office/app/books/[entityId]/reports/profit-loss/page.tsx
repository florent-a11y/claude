import Link from "next/link";
import type { CSSProperties } from "react";
import { requireUser } from "@/lib/auth";
import { profitAndLoss, profitAndLossMonthly, type ProfitAndLoss } from "@/lib/ledger";
import { fmtDate } from "@/lib/dates";
import { fmtMoney, fmtNumber } from "@/lib/money";
import { Dash, Notice, TableCard } from "@/components/ui";
import { base, first, requireEntity, type Params, type Search } from "../../shared";
import { loadReportData, defaultRange, previousRange } from "../_data";
import { ReportHeader, exportHrefs } from "../ReportHeader";

export const dynamic = "force-dynamic";

export default async function ProfitLossPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const data = (await loadReportData(entityId))!;
  const { from, to } = defaultRange(data.entity, { from: first(sp.from), to: first(sp.to) });
  const monthly = first(sp.view) === "monthly";
  // The comparison column only exists in the period view.
  const compare = !monthly && first(sp.compare) === "1";
  const b = base(entityId);
  const apiBase = `/api/books/${entityId}/reports/profit-loss?from=${from}&to=${to}${monthly ? "&view=monthly" : compare ? "&compare=1" : ""}`;
  const filters = (
    <>
      <label className="block"><span className="label">From</span><input name="from" type="date" defaultValue={from} className="input !py-1" /></label>
      <label className="block"><span className="label">To</span><input name="to" type="date" defaultValue={to} className="input !py-1" /></label>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="view" value="monthly" defaultChecked={monthly} className="checkbox" /> Monthly columns</label>
      <label className="flex items-center gap-2 pb-2 text-sm" title="Period view only"><input type="checkbox" name="compare" value="1" defaultChecked={compare} className="checkbox" /> Previous period</label>
    </>
  );

  if (monthly) {
    const m = profitAndLossMonthly(data.accounts, data.entries, { from, to });
    const cols = m.columns.length + 2;
    const num = (n: number, strong = false) => <span className={`${n < 0 ? "text-red-700" : ""}${strong ? " font-semibold" : ""}`}>{fmtNumber(n)}</span>;
    // The account column stays visible while the months scroll sideways; inline backgrounds keep it opaque on every row style.
    const sticky = (bg = "#fff"): CSSProperties => ({ position: "sticky", left: 0, backgroundColor: bg, boxShadow: "inset -1px 0 0 #e2e8f0" });
    return (
      <div className="report pb-8">
        <style>{"@page { size: A4 landscape; margin: 8mm; }"}</style>
        <ReportHeader title="Profit & loss by month" subtitle={`${fmtDate(m.from)} – ${fmtDate(m.to)} · amounts in IDR`} entityLegalName={data.entity.legalName} {...exportHrefs(apiBase, true)}>{filters}</ReportHeader>
        {m.note && <div className="mb-3"><Notice tone="amber">{m.note}</Notice></div>}
        <TableCard>
          <table className="table table-statement table-monthly min-w-max text-[13px]">
            <thead><tr><th style={{ ...sticky(), zIndex: 10, minWidth: 260 }}>Account</th>{m.columns.map((c) => <th key={c.period} className="num min-w-[96px]">{c.label}</th>)}<th className="num min-w-[112px]">Total</th></tr></thead>
            <tbody>
              {m.sections.map((s) => {
                const sum = m.summary.find((x) => x.afterSection === s.key);
                return [
                  <tr key={`${s.key}-h`} className="row-section"><td style={sticky("#f8fafc")}>{s.label}</td><td colSpan={cols - 1} /></tr>,
                  ...s.rows.map((r) => (
                    <tr key={r.account.id}>
                      <td className="indent" style={sticky()}><span className="code">{r.account.code}</span><Link href={`${b}/reports/general-ledger?accountId=${r.account.id}&from=${m.from}&to=${m.to}`} className="hover:underline">{r.account.name}</Link></td>
                      {r.amounts.map((a, i) => <td key={m.columns[i].period} className="num">{num(a)}</td>)}
                      <td className="num">{num(r.total, true)}</td>
                    </tr>
                  )),
                  s.rows.length === 0 ? <tr key={`${s.key}-e`}><td className="indent text-xs text-ink-500" style={sticky()}><Dash /> no entries</td><td colSpan={cols - 1} /></tr> : null,
                  <tr key={`${s.key}-t`} className="row-total"><td style={sticky("#f8fafc")}>Total {s.label.toLowerCase()}</td>{s.totals.map((a, i) => <td key={m.columns[i].period} className="num">{num(a)}</td>)}<td className="num">{num(s.total)}</td></tr>,
                  sum ? <tr key={`${s.key}-s`} className={sum.key === "netProfit" ? "row-grand" : "row-total !bg-brand-50/40 font-bold"}><td style={sticky(sum.key === "netProfit" ? "#fff" : "#f4f7fb")}>{sum.label}</td>{sum.amounts.map((a, i) => <td key={m.columns[i].period} className="num">{num(a)}</td>)}<td className="num">{num(sum.total)}</td></tr> : null,
                ];
              })}
            </tbody>
          </table>
        </TableCard>
        <p className="no-print mt-2 text-xs text-ink-500">Each column is the P&L of that calendar month (clipped to the selected range); Total is the P&L of the whole range. Natural signs: revenue and expenses positive.</p>
      </div>
    );
  }

  const pl = profitAndLoss(data.accounts, data.entries, { from, to });
  const prev = compare ? previousRange(from, to) : undefined;
  const plPrev = prev ? profitAndLoss(data.accounts, data.entries, prev) : undefined;
  const prevAmount = (accountId: string, key: string) => plPrev?.sections.find((s) => s.key === key)?.rows.find((r) => r.account.id === accountId)?.amount ?? 0;
  const money = (n: number) => <span className={n < 0 ? "text-red-700" : ""}>{fmtMoney(n)}</span>;
  const summary: Array<[string, (p: ProfitAndLoss) => number, boolean]> = [["Gross profit", (p) => p.grossProfit, true], ["Operating profit", (p) => p.operatingProfit, true], ["Profit before tax", (p) => p.profitBeforeTax, true], ["Net profit", (p) => p.netProfit, true]];
  const afterSection: Record<string, string> = { cogs: "Gross profit", opex: "Operating profit", other_expense: "Profit before tax", tax: "Net profit" };
  return (
    <div className="report pb-8">
      <ReportHeader title="Profit & loss" subtitle={`${fmtDate(from)} – ${fmtDate(to)}${prev ? ` · compared with ${fmtDate(prev.from)} – ${fmtDate(prev.to)}` : ""}`} entityLegalName={data.entity.legalName} {...exportHrefs(apiBase, true)}>{filters}</ReportHeader>
      <TableCard>
        <table className="table table-statement">
          <thead><tr><th>Account</th><th className="num">{fmtDate(from)} – {fmtDate(to)}</th>{plPrev && <th className="num">Previous</th>}{plPrev && <th className="num">Change</th>}</tr></thead>
          <tbody>
            {pl.sections.map((s) => {
              const prevSection = plPrev?.sections.find((x) => x.key === s.key);
              const ids = new Set([...s.rows.map((r) => r.account.id), ...(prevSection?.rows.map((r) => r.account.id) ?? [])]);
              const rows = data.accounts.filter((a) => ids.has(a.id)).sort((x, y) => x.code.localeCompare(y.code));
              const sectionTotalPrev = prevSection?.total ?? 0;
              const summaryRow = afterSection[s.key];
              const sum = summary.find((x) => x[0] === summaryRow);
              return [
                <tr key={`${s.key}-h`} className="row-section"><td colSpan={plPrev ? 4 : 2}>{s.label}</td></tr>,
                ...rows.map((a) => {
                  const cur = s.rows.find((r) => r.account.id === a.id)?.amount ?? 0;
                  const pv = prevAmount(a.id, s.key);
                  return <tr key={a.id}><td className="indent"><span className="code">{a.code}</span><Link href={`${b}/reports/general-ledger?accountId=${a.id}&from=${from}&to=${to}`} className="hover:underline">{a.name}</Link></td><td className="num">{money(cur)}</td>{plPrev && <td className="num">{money(pv)}</td>}{plPrev && <td className="num text-xs">{money(cur - pv)}</td>}</tr>;
                }),
                rows.length === 0 ? <tr key={`${s.key}-e`}><td className="indent text-xs text-ink-500" colSpan={plPrev ? 4 : 2}><Dash /> no entries</td></tr> : null,
                <tr key={`${s.key}-t`} className="row-total"><td>Total {s.label.toLowerCase()}</td><td className="num">{money(s.total)}</td>{plPrev && <td className="num">{money(sectionTotalPrev)}</td>}{plPrev && <td className="num text-xs">{money(s.total - sectionTotalPrev)}</td>}</tr>,
                sum ? <tr key={`${s.key}-s`} className={sum[0] === "Net profit" ? "row-grand" : "row-total !bg-brand-50/40 font-bold"}><td>{sum[0]}</td><td className="num">{money(sum[1](pl))}</td>{plPrev && <td className="num">{money(sum[1](plPrev))}</td>}{plPrev && <td className="num text-xs">{money(sum[1](pl) - sum[1](plPrev))}</td>}</tr> : null,
              ];
            })}
          </tbody>
        </table>
      </TableCard>
      <p className="no-print mt-2 text-xs text-ink-500">Natural signs: revenue and expenses positive; a negative revenue line is a credit note or discount. Income tax shows the booked CIT/final tax expense.</p>
    </div>
  );
}
