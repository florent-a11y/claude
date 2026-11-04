"use client";
import { useMemo, useState } from "react";
import { fmtNumber, roundMoney } from "@/lib/money";
import { AccountPicker, type AccountOption } from "@/components/AccountPicker";
import { MoneyField } from "@/components/MoneyInput";
import { Cols, TableCard } from "@/components/ui";
import { FxRateField } from "@/components/FxRateField";

export type MoneyMoveKind = "expense" | "deposit";
export interface BankOpt { id: string; name: string; currency: string; accountId: string }
/** Values taken from a bank statement line (`?tx=`): the line is matched to the entry once posted. */
export interface Prefill { bankTransactionId?: string; bankAccountId?: string; date?: string; amount?: number; memo?: string; reference?: string; payee?: string; accountId?: string }
/** A PPh payable account the "+ PPh withheld" button can post to, with the usual rate (0 when it depends on the case). */
export interface WithholdingOption { accountId: string; label: string; rate: number }
interface Line { key: number; accountId: string; description: string; amount: string }

const METHODS = [{ value: "transfer", label: "Bank transfer" }, { value: "cash", label: "Cash" }, { value: "card", label: "Card" }, { value: "other", label: "Other" }];

function n(s: string): number {
  const x = Number(s);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Expense / deposit editor: bank or cash account, the other party, memo, and the counter-account lines in the
 * account's currency with gross, deductions and net totals. A line may be negative: on an expense it is a
 * withholding tax (PPh) deducted from the payment, on a deposit a charge taken from the money received; the bank
 * line is the net. "+ PPh withheld" (expenses only, when the chart has PPh payable accounts) adds such a line at
 * the chosen PPh's rate on the positive lines. Lines go to the server as JSON in the hidden `lines` input, signed.
 */
export function MoneyMoveForm({ kind, action, banks, accounts, defaultDate, prefill, withholding = [] }: {
  kind: MoneyMoveKind;
  action: (fd: FormData) => Promise<void>;
  banks: BankOpt[];
  accounts: AccountOption[];
  defaultDate: string;
  prefill?: Prefill;
  /** PPh payable accounts offered by "+ PPh withheld" (expenses only); the first one is the default pick. */
  withholding?: WithholdingOption[];
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
  const [whIdx, setWhIdx] = useState(0);
  const options = useMemo(() => accounts.filter((a) => a.id !== bank?.accountId), [accounts, bank?.accountId]);
  const dec = currency === "IDR" ? 0 : 2;
  const amounts = lines.map((l) => n(l.amount));
  const gross = amounts.filter((a) => a > 0).reduce((s, a) => s + a, 0);
  const deductions = amounts.filter((a) => a < 0).reduce((s, a) => s + a, 0);
  const total = roundMoney(gross + deductions, currency);
  const rate = n(fxRate);
  const filled = lines.filter((l) => l.accountId && n(l.amount) !== 0);
  const touched = lines.filter((l) => l.accountId || n(l.amount) !== 0 || l.description.trim());
  const valid = Boolean(bankId) && memo.trim().length > 0 && filled.length > 0 && filled.length === touched.length && gross > 0 && total > 0 && (currency === "IDR" || rate > 0);
  const payload = JSON.stringify(filled.map((l) => ({ accountId: l.accountId, description: l.description.trim() || undefined, amount: n(l.amount) })));
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const wh = expense && withholding.length > 0 ? withholding[Math.min(whIdx, withholding.length - 1)] : undefined;
  /** Adds a negative line to the chosen PPh payable account: the rate applied to the positive lines, or just the sign when the rate depends on the case. */
  const addWithholding = () => {
    if (!wh) return;
    const amt = roundMoney(wh.rate * gross, currency);
    const name = wh.label.replace(/\s*\([^()]*\)$/, "");
    setLines((ls) => [...ls, blank({ accountId: wh.accountId, description: `${name} withheld`, amount: amt > 0 ? String(-amt) : "-" })]);
  };
  const bankName = bank?.name ?? "bank";
  const problem = filled.length === 0 ? "add a line with an account and an amount"
    : filled.length !== touched.length ? "every line needs an account and a non-zero amount"
    : gross <= 0 ? "at least one line must be positive"
    : total <= 0 ? (expense ? "withholding cannot exceed the amount paid" : "deductions cannot exceed the amount received")
    : !memo.trim() ? "a memo is required"
    : currency !== "IDR" && rate <= 0 ? "enter the FX rate" : "";
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
            <label className="block"><span className="label">FX rate (IDR per 1 {currency})</span><FxRateField name="fxRate" currency={currency} dateField="date" required onValueChange={(r) => setFxRate(r > 0 ? String(r) : "")} /></label>
          )}
        </div>
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-ink-700">{expense ? "Paid to" : "Received from"}</h3>
          <label className="block"><span className="label">{expense ? "Payee" : "Received from"}</span><input name="payee" defaultValue={prefill?.payee} className="input" placeholder={expense ? "e.g. OCBC, tax office, landlord…" : "e.g. shareholder, bank, lender…"} /></label>
          <label className="block"><span className="label">Memo</span><input name="memo" value={memo} onChange={(e) => setMemo(e.target.value)} required className="input" placeholder={expense ? "What was paid, e.g. Account admin fee September" : "What was received, e.g. Interest September"} /></label>
          <label className="block"><span className="label">Reference</span><input name="reference" defaultValue={prefill?.reference} className="input" placeholder="Transfer reference (optional)" /></label>
        </div>
      </div>
      <TableCard footer={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setLines((ls) => [...ls, blank()])}>+ Add line</button>
          {wh && (
            <>
              <button type="button" className="btn-secondary !py-1 text-xs" onClick={addWithholding} title={`Adds a negative line to the ${wh.label} payable account${wh.rate > 0 ? ` for ${wh.rate * 100}% of the positive lines` : ""}; the bank line becomes the net amount`}>+ PPh withheld</button>
              {withholding.length > 1 && (
                <select value={whIdx} onChange={(e) => setWhIdx(Number(e.target.value))} className="input !w-auto !py-0.5 text-xs" aria-label="Which PPh is withheld">
                  {withholding.map((o, i) => <option key={o.accountId} value={i}>{o.label}</option>)}
                </select>
              )}
            </>
          )}
        </div>
      }>
        <table className="table table-data min-w-[760px]">
          <Cols widths={[320, undefined, 180, 44]} />
          <thead><tr><th>{expense ? "Expense / counter account" : "Income / counter account"}</th><th>Description</th><th className="num" title={expense ? "Negative = withheld or deducted from the payment" : "Negative = deducted from the money received"}>Amount ({currency})</th><th></th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td><AccountPicker accounts={options} value={l.accountId} onChange={(id) => update(l.key, { accountId: id })} className="input !py-1" placeholder={expense ? "Expense, liability, asset…" : "Income, liability, equity…"} aria-label="Account" /></td>
                <td><input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} className="input !py-1" placeholder="optional" /></td>
                <td><MoneyField value={l.amount} onChange={(raw) => update(l.key, { amount: raw })} currency={currency} allowNegative className={`input !py-1${n(l.amount) < 0 ? " text-red-700" : ""}`} aria-label={`Amount (${currency})`} /></td>
                <td className="text-center"><button type="button" className="text-ink-500 hover:text-red-600" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}>×</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={2} className="text-right !font-normal text-ink-500">Total of lines (gross)</td><td className="num !font-normal text-ink-500">{currency} {fmtNumber(gross, dec)}</td><td></td></tr>
            {deductions < 0 && <tr><td colSpan={2} className="text-right !font-normal text-red-700">Withholding / deductions</td><td className="num !font-normal text-red-700">{currency} −{fmtNumber(-deductions, dec)}</td><td></td></tr>}
            <tr><td colSpan={2} className="text-right">{expense ? `Net paid from ${bankName}` : `Net received into ${bankName}`}</td><td className={`num${total < 0 ? " text-red-700" : ""}`}>{currency} {fmtNumber(total, dec)}</td><td></td></tr>
            {currency !== "IDR" && rate > 0 && <tr><td colSpan={2} className="text-right !font-normal text-ink-500">≈ IDR at {fxRate}</td><td className="num !font-normal text-ink-500">{fmtNumber(Math.round(total * rate))}</td><td></td></tr>}
          </tfoot>
        </table>
      </TableCard>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={!valid}>{expense ? "Record expense" : "Record deposit"}</button>
        <span className="text-sm text-ink-500">
          {expense
            ? `Posts Dr each line${deductions < 0 ? " (Cr the negative ones)" : ""} / Cr ${bankName}${deductions < 0 ? " for the net" : ""}`
            : `Posts Dr ${bankName}${deductions < 0 ? " for the net" : ""} / Cr each line${deductions < 0 ? " (Dr the negative ones)" : ""}`}
          {!valid && problem && ` · ${problem}`}
        </span>
      </div>
    </form>
  );
}
