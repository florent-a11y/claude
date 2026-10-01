import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { entryTotal } from "@/lib/ledger";
import { fmtDate, periodLabel } from "@/lib/dates";
import { Card, Badge, statusTone, Money, Chips, EmptyState, withParams, Select } from "@/components/ui";
import { AutoSubmitInput } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../shared";

export const dynamic = "force-dynamic";
const SOURCES = ["manual", "invoice", "bill", "receipt", "disbursement", "bank", "payroll", "depreciation", "withholding", "opening", "closing", "adjustment", "fx"];

export default async function Journal({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const period = first(sp.period), source = first(sp.source), q = first(sp.q)?.toLowerCase(), status = first(sp.status);
  const all = await db.list("journal_entries", { where: { entityId } });
  const periods = [...new Set(all.map((e) => e.period))].sort().reverse();
  const rows = all
    .filter((e) => (!period || e.period === period) && (!source || e.source === source) && (!status || e.status === status) && (!q || e.memo.toLowerCase().includes(q) || e.number.toLowerCase().includes(q) || e.lines.some((l) => l.description?.toLowerCase().includes(q) || l.counterpartyName?.toLowerCase().includes(q))))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const current = { period, source, q, status };
  const b = base(entityId);
  const url = `${b}/journal`;
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-wrap items-center gap-2" method="get">
          {source && <input type="hidden" name="source" value={source} />}{status && <input type="hidden" name="status" value={status} />}
          <Select name="period" defaultValue={period ?? ""} options={[{ value: "", label: "All periods" }, ...periods.map((p) => ({ value: p, label: periodLabel(p) }))]} className="input !w-auto !py-1" />
          <AutoSubmitInput name="q" defaultValue={q} placeholder="Search memo, number, counterparty…" className="input !w-64 !py-1" />
          <button className="btn-secondary !py-1 text-xs">Filter</button>
        </form>
        <Link href={`${b}/journal/new`} className="btn-primary">New entry</Link>
      </div>
      <Chips items={[{ href: withParams(url, current, { source: undefined }), label: "All sources", active: !source }, ...SOURCES.map((s) => ({ href: withParams(url, current, { source: s }), label: s, active: source === s }))]} />
      <Chips items={[{ href: withParams(url, current, { status: undefined }), label: "Posted + void", active: !status }, { href: withParams(url, current, { status: "posted" }), label: "Posted", active: status === "posted" }, { href: withParams(url, current, { status: "void" }), label: "Void", active: status === "void" }, { href: withParams(url, current, { status: "draft" }), label: "Draft", active: status === "draft" }]} />
      {rows.length === 0 ? <EmptyState title="No journal entries" hint="Post an invoice or bill, match bank lines, or add a manual entry." action={<Link href={`${b}/journal/new`} className="btn-primary">New entry</Link>} /> : (
        <Card className="overflow-x-auto !p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Number</th><th>Date</th><th>Memo</th><th>Source</th><th>Lines</th><th className="num">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {rows.slice(0, 500).map((e) => (
                <tr key={e.id} className={e.status === "void" ? "opacity-60" : ""}>
                  <td className="pl-4 font-medium"><Link href={`${b}/journal/${e.id}`} className="hover:underline">{e.number}</Link></td>
                  <td className="whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="max-w-lg truncate">{e.memo}</td>
                  <td><Badge tone={statusTone(e.source)}>{e.source}</Badge></td>
                  <td className="text-xs text-ink-500">{e.lines.map((l) => l.accountCode).join(", ")}</td>
                  <td className="num"><Money amount={entryTotal(e)} /></td>
                  <td><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && <p className="p-3 text-xs text-ink-500">Showing the first 500 of {rows.length} entries; narrow the filter.</p>}
        </Card>
      )}
    </div>
  );
}
