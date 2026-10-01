import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, lastDayOfMonth, nextPeriod, periodLabel, prevPeriod, todayISO } from "@/lib/dates";
import { ppnRegisterForEntity } from "@/lib/tax/services";
import { PPN_DPP_FRACTION_2025 } from "@/lib/tax/constants";
import { Card, Field, Money, Notice, Select, Stat } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { addVatTransaction, deleteVatTransaction } from "../../actions";
import type { PpnRow } from "@/lib/tax/ppn";

export const dynamic = "force-dynamic";

export default async function PpnPage({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await db.get("entities", entityId);
  if (!entity) notFound();
  const period = sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : todayISO().slice(0, 7);
  const carry = Number(sp.carry ?? 0) || 0;
  const { rows, summary } = await ppnRegisterForEntity(entityId, period, carry);
  const canWrite = can(user, "tax:write");
  const dueDate = lastDayOfMonth(nextPeriod(period));
  const table = (list: PpnRow[], title: string) => (
    <Card title={title} className="overflow-x-auto !p-0">
      <table className="table">
        <thead><tr><th className="pl-4">Date</th><th>Document</th><th>Counterparty</th><th>e-Faktur</th><th className="num">DPP</th><th className="num">Rate</th><th className="num">PPN</th><th>Source</th><th></th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={9} className="pl-4 text-sm text-ink-500">Nothing in this period.</td></tr>}
          {list.map((r) => (
            <tr key={r.key} className={r.direction === "input" && !r.creditable ? "text-ink-500" : ""}>
              <td className="pl-4 text-xs">{fmtDate(r.date)}</td>
              <td className="text-xs font-medium">{r.docNumber}</td>
              <td className="text-xs">{r.counterparty}<br /><span className="text-ink-500">{r.npwp ?? "—"}</span></td>
              <td className="text-xs">{r.fakturNumber ?? <span className="text-amber-700">missing{r.direction === "input" ? " · not creditable" : ""}</span>}</td>
              <td className="num">{r.dpp.toLocaleString("en-US")}</td>
              <td className="num">{(r.rate * 100).toFixed(1)}%</td>
              <td className="num font-semibold">{r.ppn.toLocaleString("en-US")}</td>
              <td className="text-xs">{r.source === "manual" ? "manual" : <Link href={`/books/${entityId}/${r.source === "invoice" ? "invoices" : "bills"}/${r.sourceId}`} className="underline">{r.source}</Link>}</td>
              <td className="text-right">{r.source === "manual" && canWrite && <ConfirmForm action={deleteVatTransaction.bind(null, r.sourceId)} message="Delete this manual row?"><button className="text-xs text-red-700 underline">delete</button></ConfirmForm>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
  return (
    <div className="space-y-4 pb-8">
      {!entity.tax.pkp && <Notice tone="amber">This entity is not flagged as PKP (VAT-registered): no SPT Masa PPN is expected. The register still shows any PPN found on documents.</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2">
          <Link href={`/tax/${entityId}/ppn?period=${prevPeriod(period)}&carry=${carry}`} className="btn-secondary !px-3">‹</Link>
          <form method="get" className="flex items-center gap-2"><input type="month" name="period" defaultValue={period} className="input !w-44" /><input name="carry" type="number" min={0} defaultValue={carry || ""} placeholder="Carried forward" className="input !w-40" title="Overpayment carried forward from the previous period" /><button className="btn-secondary">Go</button></form>
          <Link href={`/tax/${entityId}/ppn?period=${nextPeriod(period)}&carry=${carry}`} className="btn-secondary !px-3">›</Link>
        </div>
        <a href={`/tax/${entityId}/ppn/export?period=${period}`} className="btn-secondary">Export CSV</a>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="PPN Keluaran (output)" value={<Money amount={summary.outputPpn} />} hint={`DPP ${summary.outputDpp.toLocaleString("en-US")}`} />
        <Stat label="PPN Masukan creditable" value={<Money amount={summary.creditableInputPpn} />} hint={summary.nonCreditableInputPpn ? `+ ${summary.nonCreditableInputPpn.toLocaleString("en-US")} without e-Faktur (not creditable)` : "all input rows have an e-Faktur"} />
        <Stat label="Carried forward in" value={<Money amount={summary.carriedForwardIn} />} />
        <Stat label={summary.net >= 0 ? "PPN kurang bayar (payable)" : "PPN lebih bayar (overpaid)"} value={<Money amount={Math.abs(summary.net)} />} tone={summary.net > 0 ? "text-red-700" : "text-green-700"} hint={summary.net < 0 ? "carry forward to next period" : `pay and report by ${fmtDate(dueDate)}`} />
        <Stat label="Rate profile" value={`${(entity.tax.ppnRate * 100).toFixed(0)}%`} hint={entity.tax.ppnRate >= 0.12 ? `12% × DPP ${(PPN_DPP_FRACTION_2025 * 100).toFixed(2)}% (PMK 131/2024)` : "effective 11%"} />
      </div>
      {table(rows.filter((r) => r.direction === "output"), `Pajak Keluaran · output · ${periodLabel(period)}`)}
      {table(rows.filter((r) => r.direction === "input"), `Pajak Masukan · input · ${periodLabel(period)}`)}
      {canWrite && (
        <Card title="Add a manual row (e-Faktur not in Books, import PPN, adjustments)">
          <form action={addVatTransaction.bind(null, entityId)} className="grid gap-3 md:grid-cols-4">
            <Field label="Direction"><Select name="direction" defaultValue="input" options={[{ value: "input", label: "Input (Masukan)" }, { value: "output", label: "Output (Keluaran)" }]} /></Field>
            <Field label="Date"><input name="date" type="date" defaultValue={`${period}-01`} required className="input" /></Field>
            <Field label="Counterparty" className="md:col-span-2"><input name="name" required className="input" /></Field>
            <Field label="NPWP"><input name="npwp" className="input" /></Field>
            <Field label="e-Faktur number"><input name="fakturNumber" className="input" placeholder="010.000-26.00000000" /></Field>
            <Field label="DPP"><input name="dpp" type="number" min={0} required className="input" /></Field>
            <Field label="PPN"><input name="ppn" type="number" min={0} required className="input" /></Field>
            <Field label="Notes" className="md:col-span-3"><input name="notes" className="input" /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="creditable" defaultChecked className="checkbox" /> Creditable (input)</label>
            <div className="md:col-span-4"><SubmitButton>Add row</SubmitButton></div>
          </form>
        </Card>
      )}
    </div>
  );
}
