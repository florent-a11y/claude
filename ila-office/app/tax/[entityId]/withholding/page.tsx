import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, nextPeriod, periodLabel, prevPeriod, todayISO } from "@/lib/dates";
import { summariseSlips, WITHHOLDING_TYPE_LABELS } from "@/lib/tax/withholding";
import { Card, Badge, statusTone, Money, EmptyState, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { markPeriodSlips } from "../../actions";

export const dynamic = "force-dynamic";

export default async function WithholdingList({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await db.get("entities", entityId);
  if (!entity) notFound();
  const period = sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : todayISO().slice(0, 7);
  const [slips, bills] = await Promise.all([
    db.list("withholding_slips", { where: { entityId, period }, orderBy: "number" }),
    db.list("bills", { where: (b) => b.entityId === entityId && b.date.slice(0, 7) === period && b.status !== "draft" && b.status !== "void" && b.withholdingTotal > 0 }),
  ]);
  const covered = new Set(slips.map((s) => s.billId).filter(Boolean));
  const candidates = bills.filter((b) => !covered.has(b.id));
  const summary = summariseSlips(slips);
  const canWrite = can(user, "tax:write");
  const total = slips.reduce((s, x) => s + x.taxAmount, 0);
  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2">
          <Link href={`/tax/${entityId}/withholding?period=${prevPeriod(period)}`} className="btn-secondary !px-3">‹</Link>
          <form method="get" className="flex items-center gap-2"><input type="month" name="period" defaultValue={period} className="input !w-44" /><button className="btn-secondary">Go</button></form>
          <Link href={`/tax/${entityId}/withholding?period=${nextPeriod(period)}`} className="btn-secondary !px-3">›</Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/tax/${entityId}/withholding/export?period=${period}`} className="btn-secondary">Export e-Bupot CSV</a>
          {canWrite && <Link href={`/tax/${entityId}/withholding/new?period=${period}`} className="btn-primary">New bukti potong</Link>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`Slips · ${periodLabel(period)}`} value={slips.length} />
        <Stat label="PPh withheld" value={<Money amount={total} />} hint="Unified SPT Masa PPh: pay by the 10th, report by the 20th of next month" />
        <Stat label="Issued" value={slips.filter((s) => s.status !== "draft").length} />
        <Stat label="Reported" value={slips.filter((s) => s.status === "reported").length} tone="text-green-700" />
      </div>
      {summary.length > 0 && (
        <Card title="Summary by type (for the SPT Masa PPh Unifikasi)">
          <table className="table">
            <thead><tr><th>Type</th><th className="num">Slips</th><th className="num">DPP</th><th className="num">PPh</th><th className="num">Issued</th><th className="num">Reported</th></tr></thead>
            <tbody>{summary.map((r) => <tr key={r.type}><td>{WITHHOLDING_TYPE_LABELS[r.type]}</td><td className="num">{r.count}</td><td className="num">{r.baseAmount.toLocaleString("en-US")}</td><td className="num font-semibold">{r.taxAmount.toLocaleString("en-US")}</td><td className="num">{r.issued}</td><td className="num">{r.reported}</td></tr>)}</tbody>
          </table>
          {canWrite && (
            <div className="mt-3 flex flex-wrap gap-2 no-print">
              <form action={markPeriodSlips.bind(null, entityId)}><input type="hidden" name="period" value={period} /><input type="hidden" name="status" value="issued" /><SubmitButton className="btn-secondary" pendingText="Updating…">Mark all drafts issued</SubmitButton></form>
              <form action={markPeriodSlips.bind(null, entityId)} className="flex items-center gap-2"><input type="hidden" name="period" value={period} /><input type="hidden" name="status" value="reported" /><input name="ntpn" placeholder="NTPN of the SPT payment" className="input !w-56" /><SubmitButton className="btn-secondary" pendingText="Updating…">Mark all reported</SubmitButton></form>
            </div>
          )}
        </Card>
      )}
      <Card title="Bukti potong" className="overflow-x-auto !p-0">
        {slips.length === 0 ? <div className="p-5"><EmptyState title={`No slip for ${periodLabel(period)}`} hint="Create one from a posted bill (prefilled) or manually." /></div> : (
          <table className="table">
            <thead><tr><th className="pl-4">Number</th><th>Date</th><th>Type</th><th>Object</th><th>Recipient</th><th className="num">DPP</th><th className="num">Rate</th><th className="num">PPh</th><th>Status</th></tr></thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.id}>
                  <td className="pl-4 font-medium"><Link href={`/tax/${entityId}/withholding/${s.id}`} className="hover:underline">{s.number}</Link></td>
                  <td className="text-xs">{fmtDate(s.date)}</td>
                  <td className="text-xs">{WITHHOLDING_TYPE_LABELS[s.type]}{s.treatyApplied && <span className="ml-1 text-[10px] text-brand-600">treaty</span>}</td>
                  <td className="text-xs">{s.objectCode}<br /><span className="text-ink-500">{s.objectLabel.split(" (")[0]}</span></td>
                  <td className="text-xs">{s.counterparty.name}<br /><span className="text-ink-500">{s.counterparty.npwp ?? s.counterparty.nik ?? "no NPWP"}</span></td>
                  <td className="num">{s.baseAmount.toLocaleString("en-US")}</td>
                  <td className="num">{(s.rate * 100).toFixed(2)}%</td>
                  <td className="num font-semibold">{s.taxAmount.toLocaleString("en-US")}</td>
                  <td><Badge tone={statusTone(s.status)}>{s.status}</Badge>{s.ntpn && <span className="ml-1 text-[10px] text-ink-500">NTPN</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {candidates.length > 0 && (
        <Card title="Posted bills with withholding but no slip yet">
          <table className="table">
            <thead><tr><th>Bill</th><th>Vendor</th><th>Date</th><th className="num">Withheld</th><th></th></tr></thead>
            <tbody>{candidates.map((b) => <tr key={b.id}><td className="font-medium">{b.number}</td><td className="text-xs">{b.vendor.name}</td><td className="text-xs">{fmtDate(b.date)}</td><td className="num">{Math.round(b.withholdingTotal * (b.fxRate || 1)).toLocaleString("en-US")}</td><td className="text-right">{canWrite && <Link href={`/tax/${entityId}/withholding/new?billId=${b.id}`} className="text-xs text-brand-600 underline">create slip</Link>}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-ink-500">The withholding liability was posted with each bill; slips document it for the recipient and for e-Bupot. The CSV export follows the e-Bupot Unifikasi import layout (check column order against the current DJP template before uploading).</p>
    </div>
  );
}
