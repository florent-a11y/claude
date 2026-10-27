"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtNumber } from "@/lib/money";
import { Cols, TableCard } from "@/components/ui";
import { AccountPicker } from "@/components/AccountPicker";
import { MoneyField } from "@/components/MoneyInput";

export interface AccountOpt { id: string; code: string; name: string; type: string }
/** Values to prefill when editing an existing entry. */
export interface JournalInitial { date: string; memo: string; source: string; lines: Array<{ accountId: string; description?: string; debit: number; credit: number }> }
interface Line { key: number; accountId: string; description: string; debit: string; credit: string }

const SOURCES = [{ value: "manual", label: "Manual" }, { value: "adjustment", label: "Adjustment" }, { value: "opening", label: "Opening balances" }, { value: "fx", label: "FX revaluation" }, { value: "closing", label: "Year-end closing" }];

function num(s: string): number {
  const n = Number(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

let seq = 0;
const blank = (): Line => ({ key: ++seq, accountId: "", description: "", debit: "", credit: "" });
const fromInitial = (l: JournalInitial["lines"][number]): Line => ({ key: ++seq, accountId: l.accountId, description: l.description ?? "", debit: l.debit > 0 ? String(Math.round(l.debit)) : "", credit: l.credit > 0 ? String(Math.round(l.credit)) : "" });

/**
 * Manual journal entry editor: dynamic lines, one side per line, running totals, submit only when balanced.
 * Pass `initial` to edit an existing entry (the lines are prefilled); the lines travel as a JSON payload in the hidden `lines` input.
 */
export function JournalForm({ accounts, action, defaultDate, initial, submitLabel = "Post entry", cancelHref }: {
  accounts: AccountOpt[]; action: (fd: FormData) => Promise<void>; defaultDate: string; initial?: JournalInitial; submitLabel?: string; cancelHref?: string;
}) {
  const [lines, setLines] = useState<Line[]>(() => {
    const seeded = initial ? initial.lines.map(fromInitial) : [];
    while (seeded.length < (initial ? 2 : 4)) seeded.push(blank());
    return seeded;
  });
  const totals = useMemo(() => {
    const d = lines.reduce((s, l) => s + num(l.debit), 0);
    const c = lines.reduce((s, l) => s + num(l.credit), 0);
    return { d, c, diff: Math.round(d - c) };
  }, [lines]);
  const filled = lines.filter((l) => l.accountId && (num(l.debit) > 0 || num(l.credit) > 0));
  const ok = filled.length >= 2 && totals.diff === 0 && totals.d > 0;
  const payload = JSON.stringify(filled.map((l) => ({ accountId: l.accountId, description: l.description, debit: num(l.debit), credit: num(l.credit) })));
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lines" value={payload} />
      <div className="card grid gap-3 md:grid-cols-[160px_1fr_180px]">
        <label className="block"><span className="label">Date</span><input name="date" type="date" defaultValue={initial?.date ?? defaultDate} required className="input" /></label>
        <label className="block"><span className="label">Memo</span><input name="memo" required className="input" defaultValue={initial?.memo} placeholder="What is this entry for?" /></label>
        <label className="block"><span className="label">Source</span><select name="source" defaultValue={initial?.source ?? "manual"} className="input">{SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
      </div>
      <TableCard>
        <table className="table table-data min-w-[860px]">
          <Cols widths={[300, undefined, 160, 160, 44]} />
          <thead><tr><th>Account</th><th>Description</th><th className="num">Debit (IDR)</th><th className="num">Credit (IDR)</th><th></th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td><AccountPicker accounts={accounts} value={l.accountId} onChange={(id) => update(l.key, { accountId: id })} className="input !py-1" aria-label="Account" /></td>
                <td><input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} className="input !py-1" placeholder="optional" aria-label="Description" /></td>
                <td><MoneyField value={l.debit} onChange={(raw) => update(l.key, { debit: raw, credit: raw ? "" : l.credit })} currency="IDR" className="input !py-1" aria-label="Debit" /></td>
                <td><MoneyField value={l.credit} onChange={(raw) => update(l.key, { credit: raw, debit: raw ? "" : l.debit })} currency="IDR" className="input !py-1" aria-label="Credit" /></td>
                <td className="text-center"><button type="button" className="text-ink-500 hover:text-red-600" onClick={() => setLines((ls) => (ls.length > 2 ? ls.filter((x) => x.key !== l.key) : ls))} aria-label="Remove line">×</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setLines((ls) => [...ls, blank()])}>+ Add line</button></td>
              <td className="text-right !text-xs !font-normal text-ink-500">Totals</td>
              <td className="num">{fmtNumber(totals.d)}</td>
              <td className="num">{fmtNumber(totals.c)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </TableCard>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={!ok}>{submitLabel}</button>
        {cancelHref && <Link href={cancelHref} className="btn-secondary">Cancel</Link>}
        {totals.diff !== 0 && <span className="text-sm text-red-600">Out of balance by {fmtNumber(Math.abs(totals.diff))} ({totals.diff > 0 ? "credits short" : "debits short"})</span>}
        {totals.diff === 0 && totals.d > 0 && filled.length >= 2 && <span className="text-sm text-green-700">Balanced</span>}
        {filled.length < 2 && <span className="text-sm text-ink-500">Enter at least two lines with an account and an amount.</span>}
      </div>
    </form>
  );
}
