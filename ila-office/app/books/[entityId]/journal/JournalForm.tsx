"use client";
import { useMemo, useState } from "react";
import { fmtNumber } from "@/lib/money";

export interface AccountOpt { id: string; code: string; name: string; type: string }
interface Line { key: number; accountId: string; description: string; debit: string; credit: string }

const SOURCES = [{ value: "manual", label: "Manual" }, { value: "adjustment", label: "Adjustment" }, { value: "opening", label: "Opening balances" }, { value: "fx", label: "FX revaluation" }, { value: "closing", label: "Year-end closing" }];

function num(s: string): number {
  const n = Number(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Manual journal entry editor: dynamic lines, one side per line, running totals, submit only when balanced. */
export function JournalForm({ accounts, action, defaultDate }: { accounts: AccountOpt[]; action: (fd: FormData) => Promise<void>; defaultDate: string }) {
  let seq = 0;
  const blank = (): Line => ({ key: ++seq + Math.random(), accountId: "", description: "", debit: "", credit: "" });
  const [lines, setLines] = useState<Line[]>(() => [blank(), blank(), blank(), blank()]);
  const totals = useMemo(() => {
    const d = lines.reduce((s, l) => s + num(l.debit), 0);
    const c = lines.reduce((s, l) => s + num(l.credit), 0);
    return { d, c, diff: Math.round(d - c) };
  }, [lines]);
  const filled = lines.filter((l) => l.accountId && (num(l.debit) > 0 || num(l.credit) > 0));
  const ok = filled.length >= 2 && totals.diff === 0 && totals.d > 0;
  const payload = JSON.stringify(filled.map((l) => ({ accountId: l.accountId, description: l.description, debit: num(l.debit), credit: num(l.credit) })));
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const grouped = useMemo(() => {
    const order = ["asset", "liability", "equity", "revenue", "expense"];
    return order.map((t) => ({ t, items: accounts.filter((a) => a.type === t) })).filter((g) => g.items.length);
  }, [accounts]);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lines" value={payload} />
      <div className="card grid gap-3 md:grid-cols-[160px_1fr_180px]">
        <label className="block"><span className="label">Date</span><input name="date" type="date" defaultValue={defaultDate} required className="input" /></label>
        <label className="block"><span className="label">Memo</span><input name="memo" required className="input" placeholder="What is this entry for?" /></label>
        <label className="block"><span className="label">Source</span><select name="source" defaultValue="manual" className="input">{SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
      </div>
      <div className="card overflow-x-auto !p-0">
        <table className="table">
          <thead><tr><th className="pl-4 w-[34%]">Account</th><th>Description</th><th className="num w-40">Debit (IDR)</th><th className="num w-40">Credit (IDR)</th><th className="w-8"></th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td className="pl-4">
                  <select value={l.accountId} onChange={(e) => update(l.key, { accountId: e.target.value })} className="input !py-1">
                    <option value="">— account —</option>
                    {grouped.map((g) => <optgroup key={g.t} label={g.t}>{g.items.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</optgroup>)}
                  </select>
                </td>
                <td><input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} className="input !py-1" placeholder="optional" /></td>
                <td><input inputMode="numeric" value={l.debit} onChange={(e) => update(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} className="input !py-1 text-right" placeholder="0" /></td>
                <td><input inputMode="numeric" value={l.credit} onChange={(e) => update(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} className="input !py-1 text-right" placeholder="0" /></td>
                <td><button type="button" className="text-ink-500 hover:text-red-600" onClick={() => setLines((ls) => (ls.length > 2 ? ls.filter((x) => x.key !== l.key) : ls))} aria-label="Remove line">×</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold">
              <td className="pl-4 py-2"><button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setLines((ls) => [...ls, blank()])}>+ Add line</button></td>
              <td className="py-2 text-right text-xs text-ink-500">Totals</td>
              <td className="num py-2">{fmtNumber(totals.d)}</td>
              <td className="num py-2">{fmtNumber(totals.c)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={!ok}>Post entry</button>
        {totals.diff !== 0 && <span className="text-sm text-red-600">Out of balance by {fmtNumber(Math.abs(totals.diff))} ({totals.diff > 0 ? "credits short" : "debits short"})</span>}
        {totals.diff === 0 && totals.d > 0 && filled.length >= 2 && <span className="text-sm text-green-700">Balanced</span>}
        {filled.length < 2 && <span className="text-sm text-ink-500">Enter at least two lines with an account and an amount.</span>}
      </div>
    </form>
  );
}
