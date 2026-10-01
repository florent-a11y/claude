import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayISO, fmtDate } from "@/lib/dates";
import { WITHHOLDING_OBJECTS, type WithholdingKind } from "@/lib/tax/constants";
import { WITHHOLDING_TYPE_LABELS } from "@/lib/tax/withholding";
import { Card, Field, Select, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { createWithholdingSlip } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function NewSlip({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("tax:write");
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await db.get("entities", entityId);
  if (!entity) notFound();
  const today = todayISO();
  const bill = sp.billId ? await db.get("bills", sp.billId) : null;
  const recent = await db.list("bills", { where: (b) => b.entityId === entityId && b.status !== "draft" && b.status !== "void" && b.withholdingTotal > 0, orderBy: "date", desc: true, limit: 25 });
  let pre = { period: sp.period ?? today.slice(0, 7), date: today, name: "", npwp: "", country: "ID", base: 0, objectCode: "24-104-05", rateOverride: "", type: "pph23" as WithholdingKind, description: "" };
  if (bill && bill.entityId === entityId) {
    const fx = bill.fxRate || 1;
    const withLines = bill.lines.filter((l) => l.withholding !== "none" && (l.withholdingAmount ?? 0) > 0);
    const type = (withLines[0]?.withholding ?? "pph23") as WithholdingKind;
    const lines = withLines.filter((l) => l.withholding === type);
    const rate = lines[0]?.withholdingRate;
    const match = WITHHOLDING_OBJECTS.find((o) => o.type === type && rate !== undefined && Math.abs(o.rate - rate) < 1e-9);
    pre = {
      period: bill.date.slice(0, 7), date: today, name: bill.vendor.name, npwp: bill.vendor.npwp ?? "", country: bill.vendor.country ?? "ID",
      base: Math.round(lines.reduce((s, l) => s + l.amount, 0) * fx), objectCode: match?.code ?? WITHHOLDING_OBJECTS.find((o) => o.type === type)?.code ?? "24-104-05",
      rateOverride: match || rate === undefined ? "" : (rate * 100).toFixed(2), type, description: `${bill.number}${bill.vendorInvoiceNumber ? ` / ${bill.vendorInvoiceNumber}` : ""}: ${lines.map((l) => l.description).join(", ")}`.slice(0, 500),
    };
  }
  const objectOptions = WITHHOLDING_OBJECTS.map((o) => ({ value: o.code, label: `${WITHHOLDING_TYPE_LABELS[o.type]} · ${o.code} · ${o.label} · ${(o.rate * 100).toFixed(2)}%` }));
  return (
    <div className="grid gap-4 pb-8 lg:grid-cols-3">
      <Card title={bill ? `New bukti potong from ${bill.number}` : "New bukti potong"} className="lg:col-span-2">
        {bill && bill.entityId !== entityId && <Notice tone="red">That bill belongs to another entity.</Notice>}
        <form action={createWithholdingSlip.bind(null, entityId)} className="grid gap-3 md:grid-cols-2">
          {bill && bill.entityId === entityId && <input type="hidden" name="billId" value={bill.id} />}
          <Field label="Object (kode objek pajak)" className="md:col-span-2"><Select name="objectCode" defaultValue={pre.objectCode} options={objectOptions} /></Field>
          <Field label="Type (fallback for unlisted codes)"><Select name="type" defaultValue={pre.type} options={(Object.keys(WITHHOLDING_TYPE_LABELS) as WithholdingKind[]).map((t) => ({ value: t, label: WITHHOLDING_TYPE_LABELS[t] }))} /></Field>
          <Field label="Rate override % (optional: SKB, unlisted object)" hint="Leave empty to use the object's statutory rate with the NPWP / treaty rules."><input name="rateOverride" type="number" step="0.01" min={0} max={100} defaultValue={pre.rateOverride} className="input" /></Field>
          <Field label="Tax period (masa pajak)"><input name="period" type="month" defaultValue={pre.period} required className="input" /></Field>
          <Field label="Withholding date"><input name="date" type="date" defaultValue={pre.date} required className="input" /></Field>
          <Field label="Recipient name" className="md:col-span-2"><input name="name" defaultValue={pre.name} required className="input" /></Field>
          <Field label="Recipient NPWP" hint="Empty = no NPWP: PPh 23 doubled, PPh 21 +20%."><input name="npwp" defaultValue={pre.npwp} className="input" placeholder="00.000.000.0-000.000" /></Field>
          <Field label="Recipient NIK (individuals without NPWP)"><input name="nik" className="input" /></Field>
          <Field label="Recipient address" className="md:col-span-2"><input name="address" className="input" /></Field>
          <Field label="Country (ISO-2)"><input name="country" defaultValue={pre.country} maxLength={2} className="input" /></Field>
          <Field label="DPP / gross amount (IDR)"><input name="baseAmount" type="number" min={0} defaultValue={pre.base || ""} required className="input" /></Field>
          <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="treatyApplied" className="checkbox" /> PPh 26: apply tax treaty rate (DGT form / certificate of residence on file)</label>
            <div className="mt-2 max-w-xs"><Field label="Treaty rate %"><input name="treatyRate" type="number" step="0.01" min={0} max={100} defaultValue={10} className="input" /></Field></div>
          </div>
          <Field label="Description / document reference" className="md:col-span-2"><input name="description" defaultValue={pre.description} className="input" /></Field>
          <div className="md:col-span-2 flex items-center gap-3"><SubmitButton>Create slip</SubmitButton><Link href={`/tax/${entityId}/withholding?period=${pre.period}`} className="btn-ghost">Cancel</Link></div>
        </form>
      </Card>
      <Card title="Prefill from a posted bill">
        {recent.length === 0 ? <p className="text-sm text-ink-500">No posted bill with withholding yet. Bills with a withholding line appear here.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {recent.map((b) => <li key={b.id} className="py-2"><Link href={`/tax/${entityId}/withholding/new?billId=${b.id}`} className="font-medium text-brand-700 hover:underline">{b.number}</Link><br /><span className="text-xs text-ink-500">{b.vendor.name} · {fmtDate(b.date)} · withheld {Math.round(b.withholdingTotal * (b.fxRate || 1)).toLocaleString("en-US")}</span></li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}
