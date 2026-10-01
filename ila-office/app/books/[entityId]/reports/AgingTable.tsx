import Link from "next/link";
import { AGING_BUCKETS, type AgingReport } from "@/lib/ledger";
import { fmtDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Card, Badge, EmptyState } from "@/components/ui";

const LABELS: Record<(typeof AGING_BUCKETS)[number], string> = { current: "Not due", "1-30": "1–30 days", "31-60": "31–60 days", "61-90": "61–90 days", "90+": "Over 90 days" };
const TONE = { current: "slate", "1-30": "amber", "31-60": "amber", "61-90": "red", "90+": "red" } as const;

/** Summary by counterparty plus detail rows, shared by AR and AP aging. */
export function AgingTable({ report, docHref, who }: { report: AgingReport; docHref: (id: string) => string; who: string }) {
  if (report.rows.length === 0) return <EmptyState title={`Nothing outstanding as of ${fmtDate(report.asOf)}`} />;
  return (
    <div className="space-y-4">
      <Card className="overflow-x-auto !p-0">
        <table className="table">
          <thead><tr><th className="pl-4">{who}</th>{AGING_BUCKETS.map((k) => <th key={k} className="num">{LABELS[k]}</th>)}<th className="num">Total (IDR)</th></tr></thead>
          <tbody>
            {report.groups.map((g) => <tr key={g.name}><td className="pl-4 font-medium">{g.name}</td>{AGING_BUCKETS.map((k) => <td key={k} className="num">{g.buckets[k] ? fmtMoney(g.buckets[k]) : ""}</td>)}<td className="num font-semibold">{fmtMoney(g.total)}</td></tr>)}
          </tbody>
          <tfoot><tr className="border-t-2 border-slate-300 font-semibold"><td className="pl-4 py-2">Total</td>{AGING_BUCKETS.map((k) => <td key={k} className="num py-2">{fmtMoney(report.totals[k])}</td>)}<td className="num py-2">{fmtMoney(report.total)}</td></tr></tfoot>
        </table>
      </Card>
      <Card title="Detail" className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Document</th><th>{who}</th><th>Date</th><th>Due</th><th className="num">Days overdue</th><th>Bucket</th><th className="num">Outstanding</th><th className="num">IDR</th></tr></thead>
          <tbody>
            {report.rows.map((r) => <tr key={r.id}><td><Link href={docHref(r.id)} className="font-medium hover:underline">{r.number}</Link></td><td>{r.name}</td><td className="whitespace-nowrap">{fmtDate(r.date)}</td><td className="whitespace-nowrap">{fmtDate(r.dueDate)}</td><td className="num">{r.daysOverdue > 0 ? r.daysOverdue : ""}</td><td><Badge tone={TONE[r.bucket]}>{LABELS[r.bucket]}</Badge></td><td className="num">{fmtMoney(r.outstanding, r.currency)}</td><td className="num">{fmtMoney(r.outstandingIDR)}</td></tr>)}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
