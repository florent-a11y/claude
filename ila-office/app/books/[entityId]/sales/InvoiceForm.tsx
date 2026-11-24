"use client";
import { useMemo, useState } from "react";
import { dueDateFor, paymentTermText } from "@/lib/invoice-settings";
import { columnDecimals, currencyOptions, fmtNumber } from "@/lib/money";
import { invoiceTotals } from "@/lib/ledger";
import { SubmitButton } from "@/components/client";
import { Cols, TableCard } from "@/components/ui";
import { AccountPicker } from "@/components/AccountPicker";
import { MoneyField } from "@/components/MoneyInput";
import type { Invoice, TaxCode } from "@/lib/types";
import { FxRateField } from "@/components/FxRateField";

export interface CustomerOpt { key: string; type: "company" | "contact"; id: string; name: string; email?: string; npwp?: string; address?: string }
export interface AccountOpt { id: string; code: string; name: string; type?: string }
export interface ServiceOpt { id: string; name: string; priceIDR: number; priceUSD?: number; priceEUR?: number; taxTreatment: "out_of_scope" | "ppn" }
/** From the entity's invoice settings (lib/invoice-settings.ts): what a new invoice starts with. */
export interface InvoiceFormDefaults { pricesIncludeTax: boolean; dueDays: number; dueDaysKind: "working" | "calendar"; notes: string; taxLabel: string }
interface Line { key: number; description: string; qty: string; unitPrice: string; accountId: string; taxCode: TaxCode; serviceId?: string }

const TAX_CODES: Array<{ value: TaxCode; label: string }> = [{ value: "out_of_scope", label: "Out of scope (no PPN)" }, { value: "ppn", label: "PPN" }, { value: "none", label: "None / exempt" }];

function n(s: string): number { const x = Number(String(s).replace(/[^0-9.\-]/g, "")); return Number.isFinite(x) ? x : 0; }

/**
 * Invoice editor with live totals. PPN only applies when the entity is PKP and a line's tax code is "ppn"; a PKP entity
 * chooses per invoice whether the prices it types include PPN (the default comes from the invoice settings).
 */
export function InvoiceForm({ action, entity, customers, accounts, services, defaultAccountId, defaultDate, defaultPaymentInstructions, defaults, settingsHref, invoice }: {
  action: (fd: FormData) => Promise<void>;
  entity: { pkp: boolean; ppnRate: number };
  customers: CustomerOpt[]; accounts: AccountOpt[]; services: ServiceOpt[];
  defaultAccountId: string; defaultDate: string; defaultPaymentInstructions?: string; defaults: InvoiceFormDefaults; settingsHref?: string; invoice?: Invoice;
}) {
  let seq = 0;
  const defaultTax: TaxCode = entity.pkp ? "ppn" : "out_of_scope";
  const blank = (): Line => ({ key: ++seq + Math.random(), description: "", qty: "1", unitPrice: "", accountId: defaultAccountId, taxCode: defaultTax });
  const initialKey = invoice?.customer.type === "other" || !invoice ? (invoice ? "other" : customers[0]?.key ?? "other") : `${invoice.customer.type}:${invoice.customer.id}`;
  const [customerKey, setCustomerKey] = useState(initialKey);
  const [other, setOther] = useState({ name: invoice?.customer.type === "other" ? invoice.customer.name : "", email: invoice?.customer.email ?? "", npwp: invoice?.customer.npwp ?? "", address: invoice?.customer.address ?? "" });
  const [date, setDate] = useState(invoice?.date ?? defaultDate);
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? dueDateFor(defaultDate, defaults));
  const [dueTouched, setDueTouched] = useState(Boolean(invoice));
  const [currency, setCurrency] = useState(invoice?.currency ?? "IDR");
  const [fxRate, setFxRate] = useState(invoice && invoice.currency !== "IDR" ? String(invoice.fxRate) : "");
  // Prices including PPN: the discount is edited as it was typed, before the PPN is taken out of it.
  const [inclusive, setInclusive] = useState(entity.pkp && (invoice ? Boolean(invoice.pricesIncludeTax) : defaults.pricesIncludeTax));
  const enteredDiscount = invoice?.pricesIncludeTax ? invoice.grossDiscount ?? invoice.discount : invoice?.discount;
  const [discount, setDiscount] = useState(enteredDiscount ? String(enteredDiscount) : "");
  const [lines, setLines] = useState<Line[]>(() => invoice ? invoice.lines.map((l) => ({ key: ++seq + Math.random(), description: l.description, qty: String(l.qty), unitPrice: String(l.unitPrice), accountId: l.accountId, taxCode: l.taxCode, serviceId: l.serviceId })) : [blank()]);
  const selected = customers.find((c) => c.key === customerKey);
  const customer = selected ? { type: selected.type, id: selected.id, name: selected.name, email: selected.email, npwp: selected.npwp, address: selected.address } : { type: "other" as const, name: other.name, email: other.email || undefined, npwp: other.npwp || undefined, address: other.address || undefined };
  const totals = useMemo(() => invoiceTotals(lines.map((l) => ({ qty: n(l.qty), unitPrice: n(l.unitPrice), taxCode: l.taxCode })), { discount: n(discount), pkp: entity.pkp, ppnRate: entity.ppnRate, currency, pricesIncludeTax: inclusive }), [lines, discount, entity, currency, inclusive]);
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addService = (id: string) => {
    const s = services.find((x) => x.id === id);
    if (!s) return;
    const price = currency === "USD" ? s.priceUSD ?? 0 : currency === "EUR" ? s.priceEUR ?? 0 : currency === "IDR" ? s.priceIDR : 0;
    setLines((ls) => [...ls.filter((l) => l.description || n(l.unitPrice)), { ...blank(), description: s.name, unitPrice: String(price), serviceId: s.id, taxCode: entity.pkp && s.taxTreatment === "ppn" ? "ppn" : "out_of_scope" }]);
  };
  const dec = columnDecimals(currency, [...totals.lineGross, totals.grossSubtotal, totals.grossDiscount, totals.taxableBase, totals.total]);
  const tax = `${defaults.taxLabel} ${Number((entity.ppnRate * 100).toFixed(1))}%`;
  const fmt = (x: number) => fmtNumber(x, dec);
  const valid = customer.name.trim().length > 0 && lines.some((l) => l.description && n(l.qty) > 0) && (currency === "IDR" || n(fxRate) > 0);
  const payload = JSON.stringify(lines.filter((l) => l.description.trim()).map((l) => ({ description: l.description, qty: n(l.qty), unitPrice: n(l.unitPrice), accountId: l.accountId, taxCode: l.taxCode, serviceId: l.serviceId })));
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="customer" value={JSON.stringify(customer)} />
      <input type="hidden" name="lines" value={payload} />
      <input type="hidden" name="pricesIncludeTax" value={inclusive ? "1" : "0"} />
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
          <label className="block"><span className="label">Invoice date</span><input name="date" type="date" value={date} required className="input" onChange={(e) => { setDate(e.target.value); if (!dueTouched && e.target.value) setDueDate(dueDateFor(e.target.value, defaults)); }} /></label>
          <label className="block"><span className="label">Due date</span><input name="dueDate" type="date" value={dueDate} required className="input" onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} /><span className="mt-1 block text-xs text-ink-500">Default: {paymentTermText(defaults)} after the invoice date.</span></label>
          <label className="block"><span className="label">Currency</span><select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">{currencyOptions().map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
          <label className="block"><span className="label">FX rate (IDR per 1 {currency})</span><FxRateField name="fxRate" currency={currency} date={date} defaultValue={fxRate} onValueChange={(r) => setFxRate(r > 0 ? String(r) : "")} /></label>
          <label className="block"><span className="label">e-Faktur number (PKP)</span><input name="fakturNumber" defaultValue={invoice?.fakturNumber} className="input" /></label>
          {entity.pkp && (
            <label className="block"><span className="label">Prices are</span>
              <select value={inclusive ? "1" : "0"} onChange={(e) => setInclusive(e.target.value === "1")} className="input" aria-label="Prices include tax or not">
                <option value="0">Tax exclusive ({tax} added on top)</option>
                <option value="1">Tax inclusive ({tax} included)</option>
              </select>
            </label>
          )}
        </div>
      </div>
      <TableCard footer={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setLines((ls) => [...ls, blank()])}>+ Add line</button>
          {services.length > 0 && <select className="input !w-auto !py-1 text-xs" value="" onChange={(e) => addService(e.target.value)}><option value="">+ From service catalogue…</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        </div>
      }>
        <table className="table table-data min-w-[980px]">
          <Cols widths={[undefined, 70, 150, 230, 170, 140, 44]} />
          <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th>Revenue account</th><th>Tax</th><th className="num">Amount{inclusive ? " (incl. tax)" : ""}</th><th></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td><input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} className="input !py-1" placeholder="Service description" /></td>
                <td><input value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} className="input !py-1 text-right" inputMode="decimal" /></td>
                <td><MoneyField value={l.unitPrice} onChange={(raw) => update(l.key, { unitPrice: raw })} currency={currency} className="input !py-1" aria-label="Unit price" /></td>
                <td><AccountPicker accounts={accounts} value={l.accountId} onChange={(id) => update(l.key, { accountId: id })} className="input !py-1" aria-label="Revenue account" /></td>
                <td><select value={l.taxCode} onChange={(e) => update(l.key, { taxCode: e.target.value as TaxCode })} className="input !py-1">{TAX_CODES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></td>
                <td className="num">{fmt(totals.lineGross[i] ?? 0)}</td>
                <td className="text-center"><button type="button" className="text-ink-500 hover:text-red-600" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="card space-y-3">
          <label className="block"><span className="label">Notes (shown on the invoice)</span><textarea name="notes" defaultValue={invoice ? invoice.notes : defaults.notes || undefined} rows={2} className="input" /></label>
          <label className="block"><span className="label">Settlement notes (bottom of the invoice)</span><textarea name="paymentInstructions" defaultValue={invoice?.paymentInstructions ?? defaultPaymentInstructions} rows={4} className="input" />
            <span className="mt-1 block text-xs text-ink-500">{"{number}"}, {"{due_date}"} and {"{total}"} are filled in on the invoice.{settingsHref && <> The text a new invoice starts with, the colours and the logo are in the <a href={settingsHref} className="text-brand-600 underline">invoice settings</a>.</>}</span>
          </label>
        </div>
        <div className="card space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal{inclusive ? " (incl. tax)" : ""}</span><span className="tabular-nums">{currency} {fmt(totals.grossSubtotal)}</span></div>
          <div className="flex items-center justify-between gap-2"><span>Discount</span><MoneyField value={discount} onChange={setDiscount} currency={currency} className="input !w-32 !py-1" aria-label="Discount" /><input type="hidden" name="discount" value={discount} /></div>
          {!inclusive && <div className="flex justify-between"><span>{entity.pkp ? tax : `${defaults.taxLabel} (non-PKP: none)`}</span><span className="tabular-nums">{currency} {fmt(totals.ppnAmount)}</span></div>}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums">{currency} {fmt(totals.total)}</span></div>
          {inclusive && <>
            <div className="flex justify-between text-xs text-ink-500"><span>Tax base (DPP)</span><span className="tabular-nums">{currency} {fmt(totals.taxableBase)}</span></div>
            <div className="flex justify-between text-xs text-ink-500"><span>Includes {tax}</span><span className="tabular-nums">{currency} {fmt(totals.ppnAmount)}</span></div>
          </>}
          {currency !== "IDR" && n(fxRate) > 0 && <p className="text-xs text-ink-500">≈ IDR {fmtNumber(Math.round(totals.total * n(fxRate)))} at {fxRate}</p>}
          <div className="pt-3"><SubmitButton className={`btn-primary w-full ${valid ? "" : "opacity-50"}`}>{invoice ? "Save changes" : "Save draft invoice"}</SubmitButton></div>
          <p className="text-xs text-ink-500">Saving creates a draft; post it from the invoice page to book Dr AR / Cr revenue.</p>
        </div>
      </div>
    </form>
  );
}
