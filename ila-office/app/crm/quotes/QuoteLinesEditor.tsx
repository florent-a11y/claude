"use client";
import { useMemo, useState } from "react";
import { fmtMoney } from "@/lib/money";
import { lineAmount, quoteTotals, servicePrice, QUOTE_CURRENCIES } from "@/lib/crm";
import { SERVICE_CATEGORY_LABELS, type ServiceCategory } from "@/lib/types";

export type EditorService = { id: string; code: string; name: string; category: ServiceCategory; unit: string; description?: string; priceIDR: number; priceUSD?: number; priceEUR?: number; includesNote?: string };
export type EditorLine = { id?: string; serviceId?: string; description: string; qty: number; unitPrice: number; note?: string };

let seq = 0;
const key = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Quote lines with catalogue pick-up: choosing a service fills the description and the list price for the chosen
 * currency; prices stay editable. Lines are posted as a JSON hidden field, currency and discount as plain fields.
 */
export function QuoteLinesEditor({ services, initialLines, initialCurrency = "IDR", initialDiscount = 0 }: { services: EditorService[]; initialLines: EditorLine[]; initialCurrency?: string; initialDiscount?: number }) {
  const [currency, setCurrency] = useState(initialCurrency);
  const [discount, setDiscount] = useState(initialDiscount);
  const [lines, setLines] = useState<Array<EditorLine & { key: string }>>(() => (initialLines.length ? initialLines : [{ description: "", qty: 1, unitPrice: 0 }]).map((l) => ({ ...l, key: key() })));
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const grouped = useMemo(() => {
    const m = new Map<ServiceCategory, EditorService[]>();
    for (const s of services) { const arr = m.get(s.category); if (arr) arr.push(s); else m.set(s.category, [s]); }
    return [...m.entries()];
  }, [services]);
  const totals = quoteTotals(lines, currency, discount);
  const update = (k: string, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const pick = (k: string, serviceId: string) => {
    const s = byId.get(serviceId);
    if (!s) { update(k, { serviceId: undefined }); return; }
    update(k, { serviceId, description: s.name + (s.includesNote ? ` (${s.includesNote})` : ""), unitPrice: servicePrice(s, currency) });
  };
  const changeCurrency = (c: string) => {
    setCurrency(c);
    // Re-price catalogue lines whose price was untouched in the old currency.
    setLines((ls) => ls.map((l) => { const s = l.serviceId ? byId.get(l.serviceId) : undefined; return s && l.unitPrice === servicePrice(s, currency) ? { ...l, unitPrice: servicePrice(s, c) } : l; }));
  };
  const add = (discountLine = false) => setLines((ls) => [...ls, { key: key(), description: discountLine ? "Discount" : "", qty: 1, unitPrice: discountLine ? -0 : 0 }]);
  const remove = (k: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== k) : ls));
  const moveUp = (k: string) => setLines((ls) => { const i = ls.findIndex((l) => l.key === k); if (i <= 0) return ls; const c = [...ls]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; });
  const step = currency === "IDR" ? 1 : 0.01;
  return (
    <div className="space-y-3">
      <input type="hidden" name="lines" value={JSON.stringify(lines.map(({ key: _k, ...l }) => l))} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="label">Currency</span>
          <select name="currency" value={currency} onChange={(e) => changeCurrency(e.target.value)} className="input !w-28">{QUOTE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </label>
        <p className="text-xs text-ink-500">Picking a catalogue service fills the description and the {currency} list price. Prices stay editable; a service without a {currency} price fills 0.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th className="w-8"></th><th className="w-64">Catalogue</th><th>Description</th><th className="w-20 num">Qty</th><th className="w-40 num">Unit price</th><th className="w-36 num">Amount</th><th className="w-16"></th></tr></thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={l.key}>
                <td className="text-xs text-ink-500">{idx + 1}</td>
                <td>
                  <select className="input !py-1 text-xs" value={l.serviceId ?? ""} onChange={(e) => pick(l.key, e.target.value)}>
                    <option value="">— free text —</option>
                    {grouped.map(([cat, items]) => <optgroup key={cat} label={SERVICE_CATEGORY_LABELS[cat]}>{items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
                  </select>
                </td>
                <td>
                  <input className="input !py-1" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="Description as printed on the quote" required />
                  <input className="input mt-1 !py-0.5 text-xs" value={l.note ?? ""} onChange={(e) => update(l.key, { note: e.target.value })} placeholder="Line note (optional, printed under the description)" />
                </td>
                <td><input type="number" step="any" className="input !py-1 text-right" value={l.qty} onChange={(e) => update(l.key, { qty: Number(e.target.value) })} /></td>
                <td><input type="number" step={step} className="input !py-1 text-right" value={l.unitPrice} onChange={(e) => update(l.key, { unitPrice: Number(e.target.value) })} /></td>
                <td className="num pt-3 text-sm">{fmtMoney(lineAmount(l.qty, l.unitPrice, currency), currency)}</td>
                <td className="whitespace-nowrap pt-3 text-xs"><button type="button" className="text-ink-500 hover:text-brand-700" onClick={() => moveUp(l.key)} title="Move up">↑</button> <button type="button" className="text-ink-500 hover:text-red-600" onClick={() => remove(l.key)} title="Remove">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => add(false)}>+ Add line</button>
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => add(true)}>+ Add discount line (negative price)</button>
      </div>
      <div className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
        <span className="text-ink-500">Subtotal</span><span className="num">{fmtMoney(totals.subtotal, currency)}</span>
        <label className="text-ink-500">Discount (amount)</label><input name="discount" type="number" min={0} step={step} className="input !w-40 !py-1 text-right" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
        {totals.discount > 0 && <><span className="text-ink-500">Total discount</span><span className="num text-red-700">− {fmtMoney(totals.discount, currency)}</span></>}
        <span className="font-semibold">Total</span><span className="num font-semibold">{fmtMoney(totals.total, currency)}</span>
      </div>
    </div>
  );
}
