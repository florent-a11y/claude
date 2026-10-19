import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, nextPeriod, periodLabel, todayISO } from "@/lib/dates";
import { Cols, EmptyState, Badge, Money, Stat, TableCard } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RunsPage({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  const runs = await db.list("payroll_runs", { where: { entityId }, orderBy: "period", desc: true });
  const canWrite = can(user, "tax:write");
  const suggested = runs[0] ? nextPeriod(runs[0].period) : todayISO().slice(0, 7);
  const ytd = runs.filter((r) => r.period.startsWith(todayISO().slice(0, 4)) && r.status !== "draft");
  return (
    <div className="space-y-4 pb-8">
      <div className="grid gap-4 no-print sm:grid-cols-3">
        <Stat label="Runs this year" value={ytd.length} />
        <Stat label="PPh 21 YTD" value={<Money amount={ytd.reduce((s, r) => s + r.totals.pph21, 0)} />} />
        <Stat label="Cost to company YTD" value={<Money amount={ytd.reduce((s, r) => s + r.totals.costToCompany, 0)} />} />
      </div>
      {canWrite && (
        <form method="get" action={`/payroll/${entityId}/runs/new`} className="flex flex-wrap items-end justify-end gap-2 no-print">
          <label className="block"><span className="label">Period</span><input type="month" name="period" defaultValue={suggested} className="input !w-44" /></label>
          <button className="btn-primary">New run</button>
        </form>
      )}
      {runs.length === 0 ? <EmptyState title="No payroll run yet" hint="Add employees, then create the first run for a period. Runs compute BPJS and PPh 21 (TER monthly, annual true-up in December) and post the payroll journal on approval." action={<Link href={`/payroll/${entityId}/employees`} className="btn-secondary">Employees</Link>} /> : (
        <TableCard>
          <table className="table table-data min-w-[1110px]">
            <Cols widths={[170, 100, 130, 130, 130, 130, 150, 100, 70]} />
            <thead><tr><th>Period</th><th className="num">Employees</th><th className="num">Gross</th><th className="num">PPh 21</th><th className="num">BPJS (ER + EE)</th><th className="num">Net pay</th><th className="num">Cost to company</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className={sp.period === r.period ? "bg-brand-50/60" : ""}>
                  <td>
                    <Link href={`/payroll/${entityId}/runs/${r.id}`} className="cell-primary">{periodLabel(r.period)}</Link>
                    <span className="cell-sub">pay date {fmtDate(r.payDate)}</span>
                  </td>
                  <td className="num">{r.lines.length}</td>
                  <td className="num">{r.totals.gross.toLocaleString("en-US")}</td>
                  <td className="num">{r.totals.pph21.toLocaleString("en-US")}</td>
                  <td className="num">{(r.totals.employerBpjs + r.totals.employeeBpjs).toLocaleString("en-US")}</td>
                  <td className="num font-semibold">{r.totals.netPay.toLocaleString("en-US")}</td>
                  <td className="num">{r.totals.costToCompany.toLocaleString("en-US")}</td>
                  <td><Badge tone={r.status === "paid" ? "green" : r.status === "approved" ? "blue" : "slate"}>{r.status}</Badge></td>
                  <td className="text-right text-xs"><Link href={`/payroll/${entityId}/runs/${r.id}`} className="text-brand-600 hover:underline">open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </div>
  );
}
