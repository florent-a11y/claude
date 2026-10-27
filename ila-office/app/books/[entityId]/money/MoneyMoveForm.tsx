"use client";
import { useMemo, useState } from "react";
import { fmtNumber } from "@/lib/money";
import { AccountPicker, type AccountOption } from "@/components/AccountPicker";
import { MoneyField } from "@/components/MoneyInput";
import { Cols, TableCard } from "@/components/ui";

export type MoneyMoveKind = "expense" | "deposit";
export interface BankOpt { id: string; name: string; currency: string; accountId: string }
/** Values taken from a bank statement line (`?tx=`): the line is matched to the entry once posted. */
export interface Prefill { bankTransactionId?: string; bankAccountId?: string; date?: string; amount?: number; memo?: string; reference?: string; payee?: string; accountId?: string }
interface Line { key: number; accountId: string; description: string; amount: string }

const METHODS = [{ value: "transfer", label: "Bank transfer" }, { value: "cash", label: "Cash" }, { value: "card", label: "Card" }, { value: "other", label: "Other" }];

function n(s: string): number {
  const x = Number(s);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Expense / deposit editor: bank or cash account, the other party, memo, and the counter-account lines in the
 * account's currency with a running total. Lines go to the server as JSON in the hidden `lines` input.
 */
export function MoneyMoveForm({ kind, action, banks, accounts, defaultDate, prefill }: {
  kind: MoneyMoveKind;
  action: (fd: FormData) => Promise<void>;
  banks: BankOpt[];
  accounts: AccountOption[];
  defaultDate: string;
  prefill?: Prefill;
}) {
  const expense = kind === "expense";
  let seq = 0;
  const blank = (over: Partial<Line> = {}): Line => ({ key: ++seq + Math.random(), accountId: "", description: "", amount: "", ...over });
  const fromTx = Boolean(prefill?.bankTransactionId);
  const [bankId, setBankId] = useState(prefill?.bankAccountId ?? banks[0]?.id ?? "");
  const bank = banks.find((b) => b.id === bankId);
  const currency = bank?.currency ?? "IDR";
  const [fxRate, setFxRate] = useState("");
  const [memo, setMemo] = useState(prefill?.memo ?? "");
  const [lines, setLines] = useState<Line[]>(() => [blank({ accountId: prefill?.accountId ?? "", amount: prefill?.amount ? String(prefill.amount) : "" })]);
  const options = useMemo(() => accounts.filter((a) => a.id !== bank?.accountId), [accounts, bank?.accountId]);
  const dec = currency === "IDR" ? 0 : 2;
  const total = lines.reduce((s, l) => s + n(l.amount), 0);
  const rate = n(fxRate);
  const filled = lines.filter((l) => l.accountId && n(l.amount) > 0);
  const touched = lines.filter((l) => l.accountId || n(l.amount) > 0 || l.description.trim());
  const valid = Boolean(bankId) && memo.trim().length > 0 && filled.length > 0 && filled.length === touched.length && (currency === "IDR" || rate > 0);
  const payload = JSON.stringify(filled.map((l) => ({ accountId: l.accountId, description: l.description.trim() || undefined, amount: n(l.amount) })));
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lines" value={payload} />
      {fromTx && <input type="hidden" name="bankTransactionId" value={prefill?.bankTransactionId} />}
      {fromTx && <input type="hidden" name="bankAccountId" value={bankId} />}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-ink-700">{expense ? "Paid from" : "Received into"}</h3>
          <label className="block"><span className="label">Bank / cash account</span>
            <select name={fromTx ? undefined : "bankAccountId"} value={bankId} onChange={(e) => setBankId(e.target.value)} className="input" required disabled={fromTx}>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>)}
            </select>
            {fromTx && <span className="mt-1 block text-xs text-ink-500">Taken from the statement line.</span>}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Date</span><input name="date" type="date" defaultValue={prefill?.date ?? defaultDate} required className="input" /></label>
            <label className="block"><span className="label">Method</span><select name="method" defaultValue="transfer" className="input">{METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
          </div>
          {currency !== "IDR" && (
            <label className="block"><span className="label">FX rate (IDR per 1 {currency})</span><input name="fxRate" value={fxRate} onChange={(e) => setFxRate(e.target.value)} inputMode="decimal" className="input" required placeholder="e.g. 16500" /></label>
          )}
        </div>
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-ink-700">{expense ? "Paid to" : "Received from"}</h3>
          <label className="block"><span className="label">{expense ? "Payee" : "Received from"}</span><input name="payee" defaultValue={prefill?.payee} className="input" placeholder={expense ? "e.g. OCBC, tax office, landlord…" : "e.g. shareholder, bank, lender…"} /></label>
          <label className="block"><span className="label">Memo</span><input name="memo" value={memo} onChange={(e) => setMemo(e.target.value)} required className="input" placeholder={expense ? "What was paid, e.g. Account admin fee September" : "What was received, e.g. Interest September"} /></label>
          <label className="block"><span className="label">Reference</span><input name="reference" defaultValue={prefill?.reference} className="input" placeholder="Transfer reference (optional)" /></label>
        </div>
      </div>
      <TableCard footer={<button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setLines((ls) => [...ls, blank()])}>+ Add line</button>}>
        <table className="table table-data min-w-[760px]">
          <Cols widths={[320, undefined, 180, 44]} />
          <thead><tr><th>{expense ? "Expense / counter account" : "Income / counter account"}</th><th>Description</th><th className="num">Amount ({currency})</th><th></th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td><AccountPicker accounts={options} value={l.accountId} onChange={(id) => update(l.key, { accountId: id })} className="input !py-1" placeholder={expense ? "Expense, liability, asset…" : "Income, liability, equity…"} aria-label="Account" /></td>
                <td><input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} className="input !py-1" placeholder="optional" /></td>
                <td><MoneyField value={l.amount} onChange={(raw) => update(l.key, { amount: raw })} currency={currency} className="input !py-1" aria-label={`Amount (${currency})`} /></td>
                <td className="text-center"><button type="button" className="text-ink-500 hover:text-red-600" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}>×</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={2} className="text-right">{expense ? "Total paid" : "Total received"}</td><td className="num">{currency} {fmtNumber(total, dec)}</td><td></td></tr>
            {currency !== "IDR" && rate > 0 && <tr><td colSpan={2} className="text-right !font-normal text-ink-500">≈ IDR at {fxRate}</td><td className="num !font-normal text-ink-500">{fmtNumber(Math.round(total * rate))}</td><td></td></tr>}
          </tfoot>
        </table>
      </TableCard>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={!valid}>{expense ? "Record expense" : "Record deposit"}</button>
        <span className="text-sm text-ink-500">
          {expense ? `Posts Dr each line / Cr ${bank?.name ?? "bank"}` : `Posts Dr ${bank?.name ?? "bank"} / Cr each line`}
          {!valid && (filled.length === 0 ? " · add a line with an account and an amount" : filled.length !== touched.length ? " · every line needs an account and an amount" : !memo.trim() ? " · a memo is required" : currency !== "IDR" && rate <= 0 ? " · enter the FX rate" : "")}
        </span>
      </div>
    </form>
  );
}
