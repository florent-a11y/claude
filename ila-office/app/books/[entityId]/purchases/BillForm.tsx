"use client";
import { useMemo, useState } from "react";
import { addDays } from "@/lib/dates";
import { fmtNumber } from "@/lib/money";
import { billTotals, WITHHOLDING_LABELS, WITHHOLDING_TYPES, defaultWithholdingRate } from "@/lib/ledger";
import { SubmitButton } from "@/components/client";
import type { Bill, TaxCode, WithholdingType } from "@/lib/types";

export interface VendorOpt { key: string; type: "vendor" | "company" | "contact"; id: string; name: string; npwp?: string; country?: string }
export interface AccountOpt { id: string; code: string; name: string; type: string }
interface Line { key: number; description: string; amount: string; accountId: string; taxCode: TaxCode; withholding: WithholdingType; withholdingRate: string }

const CURRENCIES = ["IDR", "USD", "EUR", "HKD", "SGD", "AUD", "GBP"];
const TAX_CODES: Array<{ value: TaxCode; label: string }> = [{ value: "none", label: "No PPN" }, { value: "ppn", label: "PPN charged by vendor" }, { value: "out_of_scope", label: "Out of scope" }];

function n(s: string): number { const x = Number(String(s).replace(/[^0-9.\-]/g, "")); return Number.isFinite(x) ? x : 0; }

/** Purchase bill editor: expense/asset lines with PPN input and withholding (PPh 23 / 4(2) / 26 …), live totals. */
export function BillForm({ action, entity, vendors, accounts, defaultAccountId, defaultDate, bill }: {
  action: (fd: FormData) => Promise<void>;
  entity: { pkp: boolean; ppnRate: number };
  vendors: VendorOpt[]; accounts: AccountOpt[]; defaultAccountId: string; defaultDate: string; bill?: Bill;
}) {
  let seq = 0;
  const blank = (): Line => ({ key: ++seq + Math.random(), description: "", amount: "", accountId: defaultAccountId, taxCode: "none", withholding: "none", withholdingRate: "" });
  const initialKey = !bill ? "other" : bill.vendor.type === "other" ? "other" : `${bill.vendor.type}:${bill.vendor.id}`;
  const [vendorKey, setVendorKey] = useState(initialKey);
  const [other, setOther] = useState({ name: bill?.vendor.type === "other" ? bill.vendor.name : "", npwp: bill?.vendor.npwp ?? "", country: bill?.vendor.country ?? "ID" });
  const [currency, setCurrency] = useState(bill?.currency ?? "IDR");
  const [fxRate, setFxRate] = useState(bill && bill.currency !== "IDR" ? String(bill.fxRate) : "");
  const [lines, setLines] = useState<Line[]>(() => bill ? bill.lines.map((l) => ({ key: ++seq + Math.random(), description: l.description, amount: String(l.amount), accountId: l.accountId, taxCode: l.taxCode, withholding: l.withholding, withholdingRate: l.withholdingRate !== undefined ? String(l.withholdingRate * 100) : "" })) : [blank()]);
  const selected = vendors.find((v) => v.key === vendorKey);
  const vendor = selected ? { type: selected.type, id: selected.id, name: selected.name, npwp: selected.npwp, country: selected.country } : { type: "other" as const, name: other.name, npwp: other.npwp || undefined, country: other.country || undefined };
  const totals = useMemo(() => billTotals(lines.map((l) => ({ amount: n(l.amount), taxCode: l.taxCode, withholding: l.withholding, withholdingRate: l.withholdingRate === "" ? undefined : n(l.withholdingRate) / 100 })), { ppnRate: entity.ppnRate, currency }), [lines, entity, currency]);
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const dec = currency === "IDR" ? 0 : 2;
  const fmt = (x: number) => fmtNumber(x, dec);
  const grouped = useMemo(() => ["expense", "asset", "liability", "equity", "revenue"].map((t) => ({ t, items: accounts.filter((a) => a.type === t) })).filter((g) => g.items.length), [accounts]);
  const valid = vendor.name.trim().length > 0 && lines.some((l) => l.description && n(l.amount) > 0) && (currency === "IDR" || n(fxRate) > 0);
  const payload = JSON.stringify(lines.filter((l) => l.description.trim()).map((l) => ({ description: l.description, amount: n(l.amount), accountId: l.accountId, taxCode: l.taxCode, withholding: l.withholding, withholdingRate: l.withholding === "none" ? undefined : l.withholdingRate === "" ? undefined : n(l.withholdingRate) / 100 })));
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="vendor" value={JSON.stringify(vendor)} />
      <input type="hidden" name="lines" value={payload} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-ink-700">Vendor</h3>
          <label className="block"><span className="label">Vendor</span>
            <select value={vendorKey} onChange={(e) => setVendorKey(e.target.value)} className="input">
              <option value="other">Other (type a name)</option>
              <optgroup label="Vendors">{vendors.filter((v) => v.type === "vendor").map((v) => <option key={v.key} value={v.key}>{v.name}</option>)}</optgroup>
              <optgroup label="Companies (CRM)">{vendors.filter((v) => v.type === "company").map((v) => <option key={v.key} value={v.key}>{v.name}</option>)}</optgroup>
              <optgroup label="Contacts (CRM)">{vendors.filter((v) => v.type === "contact").map((v) => <option key={v.key} value={v.key}>{v.name}</option>)}</optgroup>
            </select>
          </label>
          {!selected && (
            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-3 block"><span className="label">Name</span><input value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} className="input" required /></label>
              <label className="col-span-2 block"><span className="label">NPWP</span><input value={other.npwp} onChange={(e) => setOther({ ...other, npwp: e.target.value })} className="input" /></label>
              <label className="block"><span className="label">Country</span><input value={other.country} onChange={(e) => setOther({ ...other, country: e.target.value.toUpperCase() })} maxLength={2} className="input" /></label>
            </div>
          )}
          <label className="block"><span className="label">Vendor invoice number</span><input name="vendorInvoiceNumber" defaultValue={bill?.vendorInvoiceNumber} className="input" /></label>
        </div>
        <div className="card grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Bill date</span><input name="date" type="date" defaultValue={bill?.date ?? defaultDate} required className="input" /></label>
          <label className="block"><span className="label">Due date</span><input name="dueDate" type="date" defaultValue={bill?.dueDate ?? addDays(defaultDate, 14)} className="input" /></label>
          <label className="block"><span className="label">Currency</span><select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="block"><span className="label">FX rate (IDR per 1 {currency})</span><input name="fxRate" value={currency === "IDR" ? "1" : fxRate} onChange={(e) => setFxRate(e.target.value)} disabled={currency === "IDR"} className="input" inputMode="decimal" /></label>
          <label className="block"><span className="label">Vendor e-Faktur number</span><input name="fakturNumber" defaultValue={bill?.fakturNumber} className="input" /></label>
        </div>
      </div>
      <div className="card overflow-x-auto !p-0">
        <table className="table">
          <thead><tr><th className="pl-4 w-[26%]">Description</th><th className="w-36">Amount (DPP)</th><th className="w-[22%]">Account</th><th className="w-36">PPN</th><th className="w-44">Withholding</th><th className="w-20">Rate %</th><th className="num w-28">Withheld</th><th className="w-8"></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td className="pl-4"><input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} className="input !py-1" placeholder="What was purchased" /></td>
                <td><input value={l.amount} onChange={(e) => update(l.key, { amount: e.target.value })} className="input !py-1 text-right" inputMode="decimal" placeholder="0" /></td>
                <td><select value={l.accountId} onChange={(e) => update(l.key, { accountId: e.target.value })} className="input !py-1">{grouped.map((g) => <optgroup key={g.t} label={g.t}>{g.items.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</optgroup>)}</select></td>
                <td><select value={l.taxCode} onChange={(e) => update(l.key, { taxCode: e.target.value as TaxCode })} className="input !py-1">{TAX_CODES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></td>
                <td><select value={l.withholding} onChange={(e) => { const w = e.target.value as WithholdingType; update(l.key, { withholding: w, withholdingRate: w === "none" ? "" : String(defaultWithholdingRate(w) * 100) }); }} className="input !py-1">{WITHHOLDING_TYPES.map((w) => <option key={w} value={w}>{WITHHOLDING_LABELS[w]}</option>)}</select></td>
                <td><input value={l.withholdingRate} onChange={(e) => update(l.key, { withholdingRate: e.target.value })} disabled={l.withholding === "none"} className="input !py-1 text-right" inputMode="decimal" /></td>
                <td className="num">{fmt(totals.lines[i]?.withholdingAmount ?? 0)}</td>
                <td><button type="button" className="text-ink-500 hover:text-red-600" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-slate-100 p-3"><button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setLines((ls) => [...ls, blank()])}>+ Add line</button></div>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_340px]">
        <div className="card"><label className="block"><span className="label">Notes</span><textarea name="notes" defaultValue={bill?.notes} rows={3} className="input" /></label>
          <p className="mt-2 text-xs text-ink-500">Withholding defaults: PPh 23 2% on services, PPh 4(2) 10% on land/building rent, PPh 26 20% on foreign vendors (treaty rates can be typed in). Vendor PPN is {entity.pkp ? "booked as creditable VAT input (PKP)" : "expensed with the line (non-PKP)"}.</p>
        </div>
        <div className="card space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal (DPP)</span><span className="tabular-nums">{currency} {fmt(totals.subtotal)}</span></div>
          <div className="flex justify-between"><span>PPN input</span><span className="tabular-nums">{currency} {fmt(totals.ppnInput)}</span></div>
          <div className="flex justify-between font-semibold"><span>Total (vendor invoice)</span><span className="tabular-nums">{currency} {fmt(totals.total)}</span></div>
          <div className="flex justify-between"><span>Withholding</span><span className="tabular-nums">− {currency} {fmt(totals.withholdingTotal)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Amount payable</span><span className="tabular-nums">{currency} {fmt(totals.amountPayable)}</span></div>
          {currency !== "IDR" && n(fxRate) > 0 && <p className="text-xs text-ink-500">≈ IDR {fmtNumber(Math.round(totals.amountPayable * n(fxRate)))} payable at {fxRate}</p>}
          <div className="pt-3"><SubmitButton className={`btn-primary w-full ${valid ? "" : "opacity-50"}`}>{bill ? "Save changes" : "Save draft bill"}</SubmitButton></div>
        </div>
      </div>
    </form>
  );
}
