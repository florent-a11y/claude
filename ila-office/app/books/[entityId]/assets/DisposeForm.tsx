"use client";
import { useState } from "react";
import { disposalPreview, type ScheduleInput } from "@/lib/ledger";
import type { FixedAsset } from "@/lib/types";
import { fmtDate, lastDayOfMonth, periodLabel } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { SubmitButton } from "@/components/client";
import { MoneyField, rawToSubmit } from "@/components/MoneyInput";

export type DisposeAsset = ScheduleInput & Pick<FixedAsset, "depreciatedThrough" | "status" | "accumulatedDepreciation">;
export interface DisposeDefaults { date: string; proceeds?: number; /** A bank account id, "receivable" or "none". */ proceedsTo: string }
/** The statement line (money in) the sale was started from: its bank account receives the proceeds. */
export interface DisposeTx { id: string; bankAccountId: string; bankName: string; currency: string; amount: number }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Sell / dispose: date, where the proceeds went (a bank account, other receivables when sold on credit, or none
 * when scrapped or written off) and a live preview of what will be posted. The preview is `disposalPreview`
 * (lib/ledger.ts), the same arithmetic `disposeAsset` posts with, so the gain or loss shown is the one booked.
 */
export function DisposeForm({ action, asset, fiscalYearStartMonth, banks, defaults, tx, keep }: {
  action: (fd: FormData) => Promise<void>;
  asset: DisposeAsset;
  fiscalYearStartMonth: number;
  banks: Array<{ id: string; name: string; currency: string }>;
  defaults: DisposeDefaults;
  tx?: DisposeTx;
  keep?: string;
}) {
  const [date, setDate] = useState(defaults.date);
  const [to, setTo] = useState(tx ? tx.bankAccountId : defaults.proceedsTo);
  const [raw, setRaw] = useState(defaults.proceeds ? String(defaults.proceeds) : "");
  const none = to === "none";
  const proceeds = none ? 0 : Number(rawToSubmit(raw) || 0);
  const p = ISO_DATE.test(date) ? disposalPreview(asset, date, proceeds, { fiscalYearStartMonth }) : null;
  const tooEarly = ISO_DATE.test(date) && date < asset.acquisitionDate;
  const months = p?.catchUp.periods ?? [];
  const row = (label: string, value: string, cls = "") => <div className="contents"><dt className="text-ink-500">{label}</dt><dd className={`text-right tabular-nums ${cls}`}>{value}</dd></div>;
  return (
    <form action={action} className="space-y-3">
      {keep && <input type="hidden" name="keep" value={keep} />}
      {tx && <input type="hidden" name="bankTransactionId" value={tx.id} />}
      <label className="block"><span className="label">Date of sale or disposal</span><input name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} min={asset.acquisitionDate} required className="input" /></label>
      {tx ? (
        <p className="text-sm"><span className="label">Proceeds received in</span>{tx.bankName} <span className="text-xs text-ink-500">(statement line {fmtMoney(tx.amount, tx.currency)})</span><input type="hidden" name="proceedsTo" value={tx.bankAccountId} /></p>
      ) : (
        <label className="block"><span className="label">Proceeds</span>
          <select name="proceedsTo" value={to} onChange={(e) => setTo(e.target.value)} className="input">
            <option value="none">None: scrapped or written off</option>
            {banks.map((b) => <option key={b.id} value={b.id}>Received in {b.name}</option>)}
            <option value="receivable">Sold on credit (other receivables)</option>
          </select>
        </label>
      )}
      <label className="block"><span className="label">Proceeds (IDR)</span>
        <MoneyField value={none ? "" : raw} onChange={setRaw} currency="IDR" disabled={none} required={!none} aria-label="Proceeds in IDR" />
        <input type="hidden" name="proceeds" value={none ? "0" : rawToSubmit(raw)} />
        {tx && tx.currency !== "IDR" && <span className="mt-1 block text-xs text-ink-500">The statement line is in {tx.currency}: enter its value in rupiah.</span>}
      </label>
      {p && !tooEarly && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
            {row("Cost", fmtMoney(p.cost))}
            {row(p.catchUp.amount > 0 ? "Accumulated depreciation after catch-up" : "Accumulated depreciation", fmtMoney(p.accumulated))}
            {row("Net book value", fmtMoney(p.netBookValue), "font-medium")}
            {row("Proceeds", fmtMoney(p.proceeds))}
            {row(p.gainLoss > 0 ? "Gain on disposal" : p.gainLoss < 0 ? "Loss on disposal" : "Gain or loss", fmtMoney(Math.abs(p.gainLoss)), `font-semibold ${p.gainLoss > 0 ? "text-green-700" : p.gainLoss < 0 ? "text-red-700" : ""}`)}
          </dl>
          {p.catchUp.amount > 0 && <p className="mt-2 text-xs text-ink-500">Depreciation of {fmtMoney(p.catchUp.amount)} for {months.length === 1 ? periodLabel(months[0]) : `${periodLabel(months[0])} to ${periodLabel(months[months.length - 1])} (${months.length} months)`} is posted first, dated {fmtDate(lastDayOfMonth(p.through))}. The month of the disposal is not depreciated.</p>}
          {p.postedAhead && <p className="mt-2 text-xs text-ink-500">Depreciation is already posted through {periodLabel(asset.depreciatedThrough ?? "")}, past this date: the net book value in the books is used as it stands.</p>}
        </div>
      )}
      {tooEarly && <p className="text-xs text-red-700">The date is before the acquisition date ({fmtDate(asset.acquisitionDate)}).</p>}
      <SubmitButton className="btn-danger" pendingText="Posting…">{none ? "Dispose" : "Sell asset"}</SubmitButton>
      <p className="text-xs text-ink-500">Posts Dr accumulated depreciation / Dr proceeds / Cr asset cost, with the gain or loss on its own account; the asset stays in the register as disposed.</p>
    </form>
  );
}
