import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, nextPeriod, periodLabel, todayISO } from "@/lib/dates";
import { Card, EmptyState, Badge, Money, Stat } from "@/components/ui";

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
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Runs this year" value={ytd.length} />
          <Stat label="PPh 21 YTD" value={<Money amount={ytd.reduce((s, r) => s + r.totals.pph21, 0)} />} />
          <Stat label="Cost to company YTD" value={<Money amount={ytd.reduce((s, r) => s + r.totals.costToCompany, 0)} />} />
        </div>
        {canWrite && (
          <form method="get" action={`/payroll/${entityId}/runs/new`} className="flex items-end gap-2">
            <label className="block"><span className="label">Period</span><input type="month" name="period" defaultValue={suggested} className="input !w-44" /></label>
            <button className="btn-primary">New run</button>
          </form>
        )}
      </div>
      {runs.length === 0 ? <EmptyState title="No payroll run yet" hint="Add employees, then create the first run for a period. Runs compute BPJS and PPh 21 (TER monthly, annual true-up in December) and post the payroll journal on approval." action={<Link href={`/payroll/${entityId}/employees`} className="btn-secondary">Employees</Link>} /> : (
        <Card className="overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Period</th><th>Pay date</th><th className="num">Employees</th><th className="num">Gross</th><th className="num">PPh 21</th><th className="num">BPJS (er + ee)</th><th className="num">Net pay</th><th className="num">Cost to company</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className={sp.period === r.period ? "bg-brand-50/60" : ""}>
                  <td className="pl-4 font-medium"><Link href={`/payroll/${entityId}/runs/${r.id}`} className="hover:underline">{periodLabel(r.period)}</Link></td>
                  <td className="text-xs">{fmtDate(r.payDate)}</td>
                  <td className="num">{r.lines.length}</td>
                  <td className="num">{r.totals.gross.toLocaleString("en-US")}</td>
                  <td className="num">{r.totals.pph21.toLocaleString("en-US")}</td>
                  <td className="num">{(r.totals.employerBpjs + r.totals.employeeBpjs).toLocaleString("en-US")}</td>
                  <td className="num font-semibold">{r.totals.netPay.toLocaleString("en-US")}</td>
                  <td className="num">{r.totals.costToCompany.toLocaleString("en-US")}</td>
                  <td><Badge tone={r.status === "paid" ? "green" : r.status === "approved" ? "blue" : "slate"}>{r.status}</Badge></td>
                  <td className="text-xs"><Link href={`/payroll/${entityId}/runs/${r.id}`} className="text-brand-600 underline">open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
