import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayISO } from "@/lib/dates";
import { WITHHOLDING_OBJECTS, type WithholdingKind } from "@/lib/tax/constants";
import { defaultObjectCode } from "@/lib/tax/withholding";
import { fullName } from "@/lib/util";
import { Card, Notice } from "@/components/ui";
import { createWithholdingSlip } from "../../../actions";
import { SlipForm, type Party, type SlipPrefill } from "../SlipForm";

export const dynamic = "force-dynamic";

const digits = (s?: string) => (s ?? "").replace(/\D/g, "");

/** Everyone the entity could withhold from: vendors, client companies, contacts, employees and earlier recipients, deduplicated by tax id then name. */
async function recipientDirectory(entityId: string): Promise<Party[]> {
  const [vendors, companies, contacts, employees, slips] = await Promise.all([
    db.list("vendors", {}), db.list("companies", {}), db.list("contacts", {}), db.list("employees", { where: { entityId } }),
    db.list("withholding_slips", { where: { entityId }, orderBy: "date", desc: true, limit: 300 }),
  ]);
  const out: Party[] = [];
  const seen = new Set<string>();
  const add = (p: Party) => {
    const key = digits(p.npwp) || digits(p.nik) || p.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };
  for (const s of slips) add({ id: `slip:${s.id}`, name: s.counterparty.name, npwp: s.counterparty.npwp, nik: s.counterparty.nik, nitku: s.counterparty.nitku, address: s.counterparty.address, country: s.counterparty.country, source: "earlier slip" });
  for (const v of vendors) add({ id: `vendor:${v.id}`, name: v.name, npwp: v.npwp, country: "ID", source: "vendor" });
  for (const c of companies) add({ id: `company:${c.id}`, name: c.name, npwp: c.npwp, address: c.address, country: c.country, source: "client company" });
  for (const e of employees) add({ id: `employee:${e.id}`, name: e.name, npwp: e.npwp, nik: e.nik, country: "ID", source: "employee" });
  for (const c of contacts) add({ id: `contact:${c.id}`, name: fullName(c), country: c.nationality ?? "ID", source: "contact" });
  return out;
}

export default async function NewSlip({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("tax:write");
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await db.get("entities", entityId);
  if (!entity) notFound();
  const today = todayISO();
  const bill = sp.billId ? await db.get("bills", sp.billId) : null;
  const directory = await recipientDirectory(entityId);
  let prefill: SlipPrefill = { period: sp.period ?? today.slice(0, 7), date: today, objectCode: defaultObjectCode("pph23"), type: "pph23", gross: 0, description: "" };
  if (bill && bill.entityId === entityId) {
    const fx = bill.fxRate || 1;
    const withLines = bill.lines.filter((l) => l.withholding !== "none" && (l.withholdingAmount ?? 0) > 0);
    const type = (withLines[0]?.withholding ?? "pph23") as WithholdingKind;
    const lines = withLines.filter((l) => l.withholding === type);
    const rate = lines[0]?.withholdingRate;
    const match = WITHHOLDING_OBJECTS.find((o) => o.type === type && rate !== undefined && Math.abs(o.rate * (o.dppPercent ?? 100) / 100 - rate) < 1e-9);
    const vendorKey = digits(bill.vendor.npwp);
    const party = directory.find((p) => (vendorKey && digits(p.npwp) === vendorKey) || p.name.trim().toLowerCase() === bill.vendor.name.trim().toLowerCase());
    prefill = {
      period: bill.date.slice(0, 7), date: today, type, objectCode: match?.code ?? defaultObjectCode(type), gross: Math.round(lines.reduce((s, l) => s + l.amount, 0) * fx),
      description: lines.map((l) => l.description).join(", ").slice(0, 300), billId: bill.id, billNumber: bill.vendorInvoiceNumber ?? bill.number, documentType: "invoice", documentDate: bill.date,
      party: party ?? { id: "", name: bill.vendor.name, npwp: bill.vendor.npwp, country: bill.vendor.country ?? "ID", source: "bill" },
    };
  }
  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold">{bill ? `New bukti potong from ${bill.number}` : "New bukti potong"}</h2></div>
      {bill && bill.entityId !== entityId && <Notice tone="red">That bill belongs to another entity.</Notice>}
      {!entity.npwp && <Notice tone="amber">This entity has no NPWP in Settings › Entities; the slip will print without the withholding agent's tax id.</Notice>}
      {!entity.tax.signerName && <Notice tone="blue">Set the signatory name (nama penandatangan) in Settings › Entities so it prints on every slip.</Notice>}
      <SlipForm action={createWithholdingSlip.bind(null, entityId)} directory={directory} prefill={prefill} cancelHref={`/tax/${entityId}/withholding?period=${prefill.period}`} />
      <Card title="Tip">
        <p className="text-sm text-ink-700">Posted bills with a withholding line appear on the Withholding page under &ldquo;bills with no slip yet&rdquo;; opening one from there prefills the recipient, amount and document.</p>
      </Card>
    </div>
  );
}
