"use client";
import { useMemo, useState } from "react";
import { addWorkingDays } from "@/lib/dates";
import { fmtNumber } from "@/lib/money";
import { invoiceTotals } from "@/lib/ledger";
import { SubmitButton } from "@/components/client";
import type { Invoice, TaxCode } from "@/lib/types";

export interface CustomerOpt { key: string; type: "company" | "contact"; id: string; name: string; email?: string; npwp?: string; address?: string }
export interface AccountOpt { id: string; code: string; name: string }
export interface ServiceOpt { id: string; name: string; priceIDR: number; priceUSD?: number; priceEUR?: number; taxTreatment: "out_of_scope" | "ppn" }
interface Line { key: number; description: string; qty: string; unitPrice: string; accountId: string; taxCode: TaxCode; serviceId?: string }

const CURRENCIES = ["IDR", "USD", "EUR", "HKD", "SGD", "AUD", "GBP"];
const TAX_CODES: Array<{ value: TaxCode; label: string }> = [{ value: "out_of_scope", label: "Out of scope (no PPN)" }, { value: "ppn", label: "PPN" }, { value: "none", label: "None / exempt" }];

function n(s: string): number { const x = Number(String(s).replace(/[^0-9.\-]/g, "")); return Number.isFinite(x) ? x : 0; }

/** Invoice editor with live totals. PPN only applies when the entity is PKP and a line's tax code is "ppn". */
export function InvoiceForm({ action, entity, customers, accounts, services, defaultAccountId, defaultDate, defaultPaymentInstructions, invoice }: {
  action: (fd: FormData) => Promise<void>;
  entity: { pkp: boolean; ppnRate: number };
  customers: CustomerOpt[]; accounts: AccountOpt[]; services: ServiceOpt[];
  defaultAccountId: string; defaultDate: string; defaultPaymentInstructions?: string; invoice?: Invoice;
}) {
  let seq = 0;
  const defaultTax: TaxCode = entity.pkp ? "ppn" : "out_of_scope";
  const blank = (): Line => ({ key: ++seq + Math.random(), description: "", qty: "1", unitPrice: "", accountId: defaultAccountId, taxCode: defaultTax });
  const initialKey = invoice?.customer.type === "other" || !invoice ? (invoice ? "other" : customers[0]?.key ?? "other") : `${invoice.customer.type}:${invoice.customer.id}`;
  const [customerKey, setCustomerKey] = useState(initialKey);
  const [other, setOther] = useState({ name: invoice?.customer.type === "other" ? invoice.customer.name : "", email: invoice?.customer.email ?? "", npwp: invoice?.customer.npwp ?? "", address: invoice?.customer.address ?? "" });
  const [date, setDate] = useState(invoice?.date ?? defaultDate);
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? addWorkingDays(defaultDate, 3));
  const [dueTouched, setDueTouched] = useState(Boolean(invoice));
  const [currency, setCurrency] = useState(invoice?.currency ?? "IDR");
  const [fxRate, setFxRate] = useState(invoice && invoice.currency !== "IDR" ? String(invoice.fxRate) : "");
  const [discount, setDiscount] = useState(invoice?.discount ? String(invoice.discount) : "");
  const [lines, setLines] = useState<Line[]>(() => invoice ? invoice.lines.map((l) => ({ key: ++seq + Math.random(), description: l.description, qty: String(l.qty), unitPrice: String(l.unitPrice), accountId: l.accountId, taxCode: l.taxCode, serviceId: l.serviceId })) : [blank()]);
  const selected = customers.find((c) => c.key === customerKey);
  const customer = selected ? { type: selected.type, id: selected.id, name: selected.name, email: selected.email, npwp: selected.npwp, address: selected.address } : { type: "other" as const, name: other.name, email: other.email || undefined, npwp: other.npwp || undefined, address: other.address || undefined };
  const totals = useMemo(() => invoiceTotals(lines.map((l) => ({ qty: n(l.qty), unitPrice: n(l.unitPrice), taxCode: l.taxCode })), { discount: n(discount), pkp: entity.pkp, ppnRate: entity.ppnRate, currency }), [lines, discount, entity, currency]);
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addService = (id: string) => {
    const s = services.find((x) => x.id === id);
    if (!s) return;
    const price = currency === "USD" ? s.priceUSD ?? 0 : currency === "EUR" ? s.priceEUR ?? 0 : currency === "IDR" ? s.priceIDR : 0;
    setLines((ls) => [...ls.filter((l) => l.description || n(l.unitPrice)), { ...blank(), description: s.name, unitPrice: String(price), serviceId: s.id, taxCode: entity.pkp && s.taxTreatment === "ppn" ? "ppn" : "out_of_scope" }]);
  };
  const dec = currency === "IDR" ? 0 : 2;
  const fmt = (x: number) => fmtNumber(x, dec);
  const valid = customer.name.trim().length > 0 && lines.some((l) => l.description && n(l.qty) > 0) && (currency === "IDR" || n(fxRate) > 0);
  const payload = JSON.stringify(lines.filter((l) => l.description.trim()).map((l) => ({ description: l.description, qty: n(l.qty), unitPrice: n(l.unitPrice), accountId: l.accountId, taxCode: l.taxCode, serviceId: l.serviceId })));
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="customer" value={JSON.stringify(customer)} />
      <input type="hidden" name="lines" value={payload} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-ink-700">Customer</h3>
          <label className="block"><span className="label">Bill to</span>
            <select value={customerKey} onChange={(e) => setCustomerKey(e.target.value)} className="input">
              <optgroup label="Companies">{customers.filter((c) => c.type === "company").map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</optgroup>
              <optgroup label="Contacts">{customers.filter((c) => c.type === "contact").map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</optgroup>
              <option value="other">Other (type a name)</option>
            </select>
          </label>
          {!selected ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 block"><span className="label">Name</span><input value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} className="input" required /></label>
              <label className="block"><span className="label">Email</span><input value={other.email} onChange={(e) => setOther({ ...other, email: e.target.value })} className="input" type="email" /></label>
              <label className="block"><span className="label">NPWP</span><input value={other.npwp} onChange={(e) => setOther({ ...other, npwp: e.target.value })} className="input" /></label>
              <label className="col-span-2 block"><span className="label">Address</span><input value={other.address} onChange={(e) => setOther({ ...other, address: e.target.value })} className="input" /></label>
            </div>
          ) : <p className="text-xs text-ink-500">{[selected.email, selected.npwp, selected.address].filter(Boolean).join(" · ") || "No contact details on file."}</p>}
        </div>
        <div className="card grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Invoice date</span><input name="date" type="date" value={date} required className="input" onChange={(e) => { setDate(e.target.value); if (!dueTouched && e.target.value) setDueDate(addWorkingDays(e.target.value, 3)); }} /></label>
          <label className="block"><span className="label">Due date</span><input name="dueDate" type="date" value={dueDate} required className="input" onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} /><span className="mt-1 block text-xs text-ink-500">Default: 3 working days after the invoice date.</span></label>
          <label className="block"><span className="label">Currency</span><select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="block"><span className="label">FX rate (IDR per 1 {currency})</span><input name="fxRate" value={currency === "IDR" ? "1" : fxRate} onChange={(e) => setFxRate(e.target.value)} disabled={currency === "IDR"} className="input" inputMode="decimal" placeholder="16500" /></label>
          <label className="block"><span className="label">e-Faktur number (PKP)</span><input name="fakturNumber" defaultValue={invoice?.fakturNumber} className="input" /></label>
        </div>
      </div>
      <div className="card overflow-x-auto !p-0">
        <table className="table">
          <thead><tr><th className="pl-4 w-[32%]">Description</th><th className="w-20">Qty</th><th className="w-36">Unit price</th><th className="w-[22%]">Revenue account</th><th className="w-40">Tax</th><th className="num w-32">Amount</th><th className="w-8"></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td className="pl-4"><input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} className="input !py-1" placeholder="Service description" /></td>
                <td><input value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} className="input !py-1 text-right" inputMode="decimal" /></td>
                <td><input value={l.unitPrice} onChange={(e) => update(l.key, { unitPrice: e.target.value })} className="input !py-1 text-right" inputMode="decimal" placeholder="0" /></td>
                <td><select value={l.accountId} onChange={(e) => update(l.key, { accountId: e.target.value })} className="input !py-1">{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></td>
                <td><select value={l.taxCode} onChange={(e) => update(l.key, { taxCode: e.target.value as TaxCode })} className="input !py-1">{TAX_CODES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></td>
                <td className="num">{fmt(totals.lineAmounts[i] ?? 0)}</td>
                <td><button type="button" className="text-ink-500 hover:text-red-600" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-3">
          <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setLines((ls) => [...ls, blank()])}>+ Add line</button>
          {services.length > 0 && <select className="input !w-auto !py-1 text-xs" value="" onChange={(e) => addService(e.target.value)}><option value="">+ From service catalogue…</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="card space-y-3">
          <label className="block"><span className="label">Notes (shown on the invoice)</span><textarea name="notes" defaultValue={invoice?.notes} rows={2} className="input" /></label>
          <label className="block"><span className="label">Payment instructions</span><textarea name="paymentInstructions" defaultValue={invoice?.paymentInstructions ?? defaultPaymentInstructions} rows={3} className="input" /></label>
        </div>
        <div className="card space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{currency} {fmt(totals.subtotal)}</span></div>
          <div className="flex items-center justify-between gap-2"><span>Discount</span><input name="discount" value={discount} onChange={(e) => setDiscount(e.target.value)} className="input !w-32 !py-1 text-right" inputMode="decimal" placeholder="0" /></div>
          <div className="flex justify-between"><span>PPN {entity.pkp ? `${Math.round(entity.ppnRate * 100)}%` : "(non-PKP: none)"}</span><span className="tabular-nums">{currency} {fmt(totals.ppnAmount)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums">{currency} {fmt(totals.total)}</span></div>
          {currency !== "IDR" && n(fxRate) > 0 && <p className="text-xs text-ink-500">≈ IDR {fmtNumber(Math.round(totals.total * n(fxRate)))} at {fxRate}</p>}
          <div className="pt-3"><SubmitButton className={`btn-primary w-full ${valid ? "" : "opacity-50"}`}>{invoice ? "Save changes" : "Save draft invoice"}</SubmitButton></div>
          <p className="text-xs text-ink-500">Saving creates a draft; post it from the invoice page to book Dr AR / Cr revenue.</p>
        </div>
      </div>
    </form>
  );
}
