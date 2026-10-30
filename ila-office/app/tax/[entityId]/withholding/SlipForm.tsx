"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Combobox, type ComboOption } from "@/components/Combobox";
import { MoneyField } from "@/components/MoneyInput";
import { Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { fmtNumber } from "@/lib/money";
import { computeWithholding, withholdingObject, WITHHOLDING_TYPE_LABELS } from "@/lib/tax/withholding";
import { WITHHOLDING_OBJECTS, type WithholdingKind } from "@/lib/tax/constants";
import { WITHHOLDING_DOCUMENT_LABELS, WITHHOLDING_DOCUMENT_TYPES, WITHHOLDING_FACILITY_LABELS, type WithholdingDocumentType, type WithholdingFacility } from "@/lib/types";

/** A known recipient: vendor, company, contact, employee or the counterparty of an earlier slip. */
export interface Party { id: string; name: string; npwp?: string; nik?: string; nitku?: string; address?: string; country?: string; source: string }

export interface SlipPrefill {
  period: string; date: string; objectCode: string; type: WithholdingKind; gross: number; description: string;
  party?: Party; documentType?: WithholdingDocumentType; documentNumber?: string; documentDate?: string; billId?: string; billNumber?: string;
}

/**
 * Bukti potong entry the Coretax way: pick the recipient by NPWP/NIK or name (the rest fills in), pick the object,
 * type the gross amount and the reference document. Everything else has a default and sits under "More options".
 */
export function SlipForm({ action, directory, prefill, cancelHref }: { action: (fd: FormData) => Promise<void>; directory: Party[]; prefill: SlipPrefill; cancelHref: string }) {
  const [partyId, setPartyId] = useState(prefill.party?.id ?? "");
  const [custom, setCustom] = useState<Party>({ id: "", name: prefill.party?.name ?? "", npwp: prefill.party?.npwp ?? "", nik: prefill.party?.nik ?? "", nitku: prefill.party?.nitku ?? "", address: prefill.party?.address ?? "", country: prefill.party?.country ?? "ID", source: "new" });
  const [editing, setEditing] = useState(!prefill.party);
  const [objectCode, setObjectCode] = useState(prefill.objectCode);
  const [type, setType] = useState<WithholdingKind>(prefill.type);
  const [gross, setGross] = useState(prefill.gross ? String(prefill.gross) : "");
  const [rateOverride, setRateOverride] = useState("");
  const [dppOverride, setDppOverride] = useState("");
  const [facility, setFacility] = useState<WithholdingFacility>("none");
  const [treatyRate, setTreatyRate] = useState("10");
  const [documentDate, setDocumentDate] = useState(prefill.documentDate ?? prefill.date);
  const [period, setPeriod] = useState(prefill.period);
  const [periodTouched, setPeriodTouched] = useState(false);

  const partyOptions = useMemo<ComboOption[]>(() => directory.map((p) => ({ id: p.id, primary: p.npwp || p.nik || "—", secondary: p.name, keywords: `${p.name} ${p.npwp ?? ""} ${p.nik ?? ""}`, note: p.source })), [directory]);
  const selectedParty = directory.find((p) => p.id === partyId) ?? null;
  const party: Party = selectedParty ?? custom;
  const taxId = party.npwp || party.nik || "";
  const hasNpwp = Boolean(party.npwp && party.npwp.replace(/\D/g, "").length >= 15);

  const objectOptions = useMemo<ComboOption[]>(() => WITHHOLDING_OBJECTS.map((o) => ({ id: o.code, primary: o.code, secondary: o.label, group: WITHHOLDING_TYPE_LABELS[o.type], keywords: `${o.type} ${o.label}`, note: `${(o.rate * 100).toFixed(o.rate * 100 % 1 ? 2 : 0)}%${o.dppPercent ? ` of ${o.dppPercent}%` : ""}` })), []);
  const obj = withholdingObject(objectCode);
  const effectiveType: WithholdingKind = obj?.type ?? type;
  const dppPercent = dppOverride ? Number(dppOverride) : obj?.dppPercent ?? 100;
  const calc = useMemo(() => computeWithholding({
    type: effectiveType, objectCode, baseAmount: Number(gross) || 0, grossAmount: Number(gross) || 0, dppPercent, hasNpwp,
    treatyRate: facility === "p3b" && effectiveType === "pph26" ? (Number(treatyRate) || 0) / 100 : undefined,
    rateOverride: rateOverride ? Number(rateOverride) / 100 : undefined,
  }), [effectiveType, objectCode, gross, dppPercent, hasNpwp, facility, treatyRate, rateOverride]);
  const unknownObject = !obj && objectCode.trim() !== "";
  const canSubmit = Boolean(party.name.trim()) && Boolean(objectCode.trim()) && (Number(gross) || 0) > 0 && (!unknownObject || rateOverride !== "");

  function onDocumentDate(d: string) {
    setDocumentDate(d);
    if (!periodTouched && /^\d{4}-\d{2}/.test(d)) setPeriod(d.slice(0, 7));
  }

  return (
    <form action={action} className="space-y-4">
      {prefill.billId && <input type="hidden" name="billId" value={prefill.billId} />}
      <input type="hidden" name="counterpartyId" value={selectedParty?.id ?? ""} />
      <input type="hidden" name="name" value={party.name} />
      <input type="hidden" name="npwp" value={party.npwp ?? ""} />
      <input type="hidden" name="nik" value={party.nik ?? ""} />
      <input type="hidden" name="nitku" value={party.nitku ?? ""} />
      <input type="hidden" name="address" value={party.address ?? ""} />
      <input type="hidden" name="country" value={party.country ?? "ID"} />
      <input type="hidden" name="type" value={effectiveType} />
      <input type="hidden" name="objectCode" value={objectCode} />
      <input type="hidden" name="grossAmount" value={gross} />
      <input type="hidden" name="dppPercent" value={dppOverride} />
      <input type="hidden" name="rateOverride" value={rateOverride} />
      <input type="hidden" name="facility" value={facility} />
      <input type="hidden" name="treatyRate" value={treatyRate} />
      <input type="hidden" name="period" value={period} />

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">1 · Penerima penghasilan · Recipient</h2>
        <Field label="NPWP / NIK or name" hint="Known vendors, clients, contacts, employees and earlier recipients fill in automatically.">
          <Combobox options={partyOptions} value={partyId} onChange={(id, o) => { setPartyId(id); setEditing(!o); if (!o) setCustom((c) => ({ ...c, name: c.name })); }} placeholder="Type 16 digits or a name…" display={(o) => `${o.primary} · ${o.secondary}`} emptyText="Not found: fill in the details below for a new recipient." />
        </Field>
        {selectedParty && !editing ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="font-medium">{party.name}</p>
            <p className="text-xs text-ink-500">{taxId || "no NPWP/NIK"}{party.address ? ` · ${party.address}` : ""}{party.country && party.country !== "ID" ? ` · ${party.country}` : ""} · <span className="capitalize">{party.source}</span></p>
            {!hasNpwp && <p className="mt-1 text-xs text-amber-700">No NPWP on file: PPh 23 is doubled, PPh 21 +20%.</p>}
            <button type="button" className="mt-1 text-xs text-brand-600 underline" onClick={() => { setCustom({ ...party, id: "", source: "new" }); setPartyId(""); setEditing(true); }}>Use different details</button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name" className="md:col-span-2"><input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} className="input" required /></Field>
            <Field label="NPWP (15 or 16 digits)" hint="Empty = no NPWP."><input value={custom.npwp ?? ""} onChange={(e) => setCustom({ ...custom, npwp: e.target.value })} className="input" placeholder="0012345678901000" /></Field>
            <Field label="NIK (individuals without NPWP)"><input value={custom.nik ?? ""} onChange={(e) => setCustom({ ...custom, nik: e.target.value })} className="input" /></Field>
            <Field label="Address" className="md:col-span-2"><input value={custom.address ?? ""} onChange={(e) => setCustom({ ...custom, address: e.target.value })} className="input" /></Field>
            <Field label="Country (ISO-2)" hint="ID unless PPh 26."><input value={custom.country ?? "ID"} onChange={(e) => setCustom({ ...custom, country: e.target.value.toUpperCase().slice(0, 2) })} className="input" maxLength={2} /></Field>
            <Field label="NITKU (optional)" hint="Defaults to NPWP + 000000."><input value={custom.nitku ?? ""} onChange={(e) => setCustom({ ...custom, nitku: e.target.value })} className="input" /></Field>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">2 · Pemotongan · Withholding</h2>
        <Field label="Object (kode objek pajak)" hint="Type the code or a word of the description.">
          <Combobox options={objectOptions} value={objectCode} onChange={(id) => setObjectCode(id)} allowCustom placeholder="e.g. 24-104-03 or 'konsultan'" display={(o) => `${o.primary} · ${o.secondary}`} />
        </Field>
        {unknownObject && (
          <div className="grid gap-3 md:grid-cols-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Field label="PPh type for this code"><select value={type} onChange={(e) => setType(e.target.value as WithholdingKind)} className="input">{(Object.keys(WITHHOLDING_TYPE_LABELS) as WithholdingKind[]).map((t) => <option key={t} value={t}>{WITHHOLDING_TYPE_LABELS[t]}</option>)}</select></Field>
            <Field label="Rate % (required for unlisted codes)"><input value={rateOverride} onChange={(e) => setRateOverride(e.target.value)} inputMode="decimal" className="input" placeholder="2" /></Field>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={dppPercent === 100 ? "Gross amount / DPP (IDR)" : "Gross amount (IDR)"}><MoneyField value={gross} onChange={setGross} currency="IDR" required /></Field>
          <Field label="Reference document"><Select name="documentType" defaultValue={prefill.documentType ?? (prefill.billId ? "invoice" : "surat_tagihan")} options={WITHHOLDING_DOCUMENT_TYPES.map((t) => ({ value: t, label: WITHHOLDING_DOCUMENT_LABELS[t] }))} /></Field>
          <Field label="Document number"><input name="documentNumber" defaultValue={prefill.documentNumber ?? prefill.billNumber ?? ""} className="input" /></Field>
          <Field label="Document date"><input name="documentDate" type="date" value={documentDate} onChange={(e) => onDocumentDate(e.target.value)} className="input" /></Field>
          <Field label="Tax period (masa pajak)" hint="Follows the document date."><input type="month" value={period} onChange={(e) => { setPeriod(e.target.value); setPeriodTouched(true); }} required className="input" /></Field>
          <Field label="Withholding date"><input name="date" type="date" defaultValue={prefill.date} required className="input" /></Field>
        </div>
        <Field label="Description (optional)"><input name="description" defaultValue={prefill.description} className="input" /></Field>
        <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <summary className="cursor-pointer font-medium">More options (facility, treaty, rate override, correction)</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Field label="Jenis fasilitas"><select value={facility} onChange={(e) => setFacility(e.target.value as WithholdingFacility)} className="input">{(Object.keys(WITHHOLDING_FACILITY_LABELS) as WithholdingFacility[]).map((f) => <option key={f} value={f}>{WITHHOLDING_FACILITY_LABELS[f]}</option>)}</select></Field>
            <Field label="Treaty rate % (PPh 26 with DGT form)"><input value={treatyRate} onChange={(e) => setTreatyRate(e.target.value)} inputMode="decimal" className="input" disabled={facility !== "p3b" || effectiveType !== "pph26"} /></Field>
            <Field label="Rate override % (SKB, special cases)"><input value={rateOverride} onChange={(e) => setRateOverride(e.target.value)} inputMode="decimal" className="input" placeholder="statutory" /></Field>
            <Field label="DPP % override" hint={`Object default ${obj?.dppPercent ?? 100}%.`}><input value={dppOverride} onChange={(e) => setDppOverride(e.target.value)} inputMode="numeric" className="input" placeholder={String(obj?.dppPercent ?? 100)} /></Field>
            <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" name="correction" className="checkbox" /> Pembetulan (corrects an earlier slip)</label>
          </div>
        </details>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-ink-700">3 · Hasil · Result</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
          <div className="flex justify-between border-b border-slate-100 py-1"><dt className="text-ink-500">Jenis PPh</dt><dd>{WITHHOLDING_TYPE_LABELS[effectiveType]}{calc.final ? " · final" : ""}</dd></div>
          <div className="flex justify-between border-b border-slate-100 py-1"><dt className="text-ink-500">Penghasilan bruto</dt><dd className="tabular-nums">{fmtNumber(calc.grossAmount)}</dd></div>
          <div className="flex justify-between border-b border-slate-100 py-1"><dt className="text-ink-500">DPP ({calc.dppPercent}%)</dt><dd className="tabular-nums">{fmtNumber(calc.baseAmount)}</dd></div>
          <div className="flex justify-between border-b border-slate-100 py-1"><dt className="text-ink-500">Tarif</dt><dd>{(calc.rate * 100).toFixed(2)}%{calc.noNpwpSurchargeApplied ? " (no NPWP)" : ""}{calc.treatyApplied ? " (P3B)" : ""}</dd></div>
          <div className="flex justify-between py-1 md:col-span-2"><dt className="font-semibold">PPh dipotong</dt><dd className="text-lg font-bold tabular-nums">{fmtNumber(calc.taxAmount)}</dd></div>
        </dl>
        <div className="mt-3 flex items-center gap-3"><SubmitButton pendingText="Creating…">Create bukti potong</SubmitButton><Link href={cancelHref} className="btn-ghost">Cancel</Link>{!canSubmit && <span className="text-xs text-ink-500">Recipient, object and amount are required{unknownObject ? "; unlisted codes need a rate" : ""}.</span>}</div>
      </div>
      <p className="text-xs text-ink-500">The slip is created as a draft. Print it or download the PDF for the recipient, then mark it issued, and reported once filed in Coretax.</p>
    </form>
  );
}
