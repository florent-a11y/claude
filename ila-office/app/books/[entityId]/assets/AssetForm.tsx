"use client";
import { useState } from "react";
import { FISCAL_ASSET_GROUPS, type FiscalAssetGroup } from "@/lib/types";
import { depreciationSchedule } from "@/lib/ledger";
import { fmtDate, periodLabel, periodOf } from "@/lib/dates";
import { fmtMoney, roundMoney } from "@/lib/money";
import { SubmitButton } from "@/components/client";
import { AccountPicker } from "@/components/AccountPicker";
import { MoneyInput } from "@/components/MoneyInput";

export interface AccountOpt { id: string; code: string; name: string }
type Method = "straight_line" | "declining_balance";

/** An asset already in the register, shown in the same form to be confirmed (registered automatically) or corrected. */
export interface AssetEdit {
  name: string; fiscalGroup: FiscalAssetGroup; method: Method; usefulLifeMonths: number; salvageValue: number;
  /** An account id may be empty on an asset registered automatically in a chart without that account. */
  assetAccountId: string; accumDeprAccountId: string; deprExpenseAccountId: string; notes?: string;
  /** Shown, not edited: they come from the purchase (edited only on the review of a take-on, below). */
  cost: number; acquisitionDate: string;
  /**
   * An asset brought in from the ledger that still waits for review (lib/asset-takeon.ts): its cost, its acquisition
   * date and what the previous books had depreciated are confirmed with the rest. `lastMonth` is the last completed
   * month, to say what a first run would post at once.
   */
  takeOn?: { accumulated: number; through?: string; fiscalYearStartMonth: number; lastMonth: string };
  /** Depreciation is already posted: the name and the schedule are fixed, the accounts and notes stay open. */
  locked: boolean;
  /** Saving also clears "needs review". */
  confirm: boolean;
  /** Query of the asset page to come back to (a sale started from a statement line). */
  keep?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fixed-asset form: registration by hand, and with `edit` the confirmation or correction of a registered asset.
 * The fiscal group auto-fills the useful life and the default method (UU PPh art. 11); on a new asset it also
 * proposes the usual accounts, on a registered one the accounts are left alone (the cost is already posted there).
 * With `edit.takeOn` the form also takes the depreciation of the previous books and shows, live, what the register
 * will post from then on: `depreciationSchedule` (lib/ledger.ts), the arithmetic the monthly run posts with.
 */
export function AssetForm({ action, assetAccounts, accumAccounts, expenseAccounts, defaultDate, edit }: { action: (fd: FormData) => Promise<void>; assetAccounts: AccountOpt[]; accumAccounts: AccountOpt[]; expenseAccounts: AccountOpt[]; defaultDate: string; edit?: AssetEdit }) {
  const [group, setGroup] = useState<FiscalAssetGroup>(edit?.fiscalGroup ?? "group1");
  const [months, setMonths] = useState(String(edit ? edit.usefulLifeMonths : FISCAL_ASSET_GROUPS.group1.usefulLifeYears * 12));
  const [method, setMethod] = useState<Method>(edit?.method ?? "straight_line");
  const g = FISCAL_ASSET_GROUPS[group];
  const pick = (code: string, list: AccountOpt[]) => list.find((a) => a.code === code)?.id ?? list[0]?.id;
  const defaults: Record<FiscalAssetGroup, { asset: string; accum: string }> = {
    group1: { asset: "1-2300", accum: "1-2310" }, group2: { asset: "1-2200", accum: "1-2210" }, group3: { asset: "1-2300", accum: "1-2310" }, group4: { asset: "1-2300", accum: "1-2310" },
    building_permanent: { asset: "1-2100", accum: "1-2110" }, building_non_permanent: { asset: "1-2100", accum: "1-2110" }, land: { asset: "1-2000", accum: "1-2110" },
  };
  const [assetAccountId, setAssetAccountId] = useState(edit ? edit.assetAccountId : pick("1-2300", assetAccounts) ?? "");
  const [accumAccountId, setAccumAccountId] = useState(edit ? edit.accumDeprAccountId : pick("1-2310", accumAccounts) ?? "");
  const locked = Boolean(edit?.locked);
  // Review of an asset brought in from the ledger: the figures the live line is computed from.
  const takeOn = edit?.takeOn;
  const [cost, setCost] = useState(edit?.cost ?? 0);
  const [salvage, setSalvage] = useState(edit?.salvageValue ?? 0);
  const [acquired, setAcquired] = useState(edit?.acquisitionDate ?? defaultDate);
  const [carried, setCarried] = useState(takeOn?.accumulated ?? 0);
  const [through, setThrough] = useState(takeOn?.through ?? "");
  const [never, setNever] = useState(Boolean(takeOn && !takeOn.through));
  const forward = ((): { problem?: string; text?: string; catchUp?: string } | null => {
    if (!takeOn) return null;
    if (!ISO_DATE.test(acquired)) return { problem: "Enter the acquisition date." };
    if (!(cost > 0)) return { problem: "Enter the cost." };
    const room = roundMoney(cost - salvage);
    if (salvage < 0 || room < 0) return { problem: "The salvage value must be between zero and the cost." };
    if (!never && carried > room + 0.005) return { problem: `The accumulated depreciation cannot be more than the cost less the salvage value (${fmtMoney(room)}).` };
    if (!never && through && through < periodOf(acquired)) return { problem: "“Depreciated through” cannot be before the acquisition month." };
    if (!never && carried >= 0.005 && !through) return { problem: "Enter the month the asset was depreciated through." };
    if (group === "land") return { text: "Land is not depreciated." };
    const rows = depreciationSchedule(
      { cost, salvageValue: salvage, acquisitionDate: acquired, method, usefulLifeMonths: Math.max(0, Math.trunc(Number(months) || 0)), fiscalGroup: group, takeOn: never ? { accumulated: 0 } : { accumulated: carried, through: through || undefined } },
      { fiscalYearStartMonth: takeOn.fiscalYearStartMonth },
    );
    if (rows.length === 0) return { text: "Nothing is left to depreciate: the register will post nothing on this asset." };
    const last = rows[rows.length - 1];
    const behind = rows.filter((r) => r.period <= takeOn.lastMonth);
    return {
      text: `Going forward: ${fmtMoney(rows[0].amount)} per month${method === "declining_balance" ? " at first (declining balance: set again each fiscal year)" : ""} from ${periodLabel(rows[0].period)} to ${periodLabel(last.period)} (${rows.length} month${rows.length === 1 ? "" : "s"}).`,
      catchUp: behind.length ? `The first run posts ${fmtMoney(roundMoney(behind.reduce((t, r) => t + r.amount, 0)))} at once: the ${behind.length === 1 ? `month of ${periodLabel(behind[0].period)}` : `${behind.length} months from ${periodLabel(behind[0].period)} to ${periodLabel(behind[behind.length - 1].period)}`}, already past.` : undefined,
    };
  })();
  const onGroup = (v: FiscalAssetGroup) => {
    setGroup(v);
    setMonths(String(FISCAL_ASSET_GROUPS[v].usefulLifeYears * 12));
    if (FISCAL_ASSET_GROUPS[v].decliningRate === 0) setMethod("straight_line");
    if (edit) return;
    const d = defaults[v];
    setAssetAccountId(pick(d.asset, assetAccounts) ?? assetAccountId);
    setAccumAccountId(pick(d.accum, accumAccounts) ?? accumAccountId);
  };
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {edit?.confirm && <input type="hidden" name="confirm" value="1" />}
      {edit?.keep && <input type="hidden" name="keep" value={edit.keep} />}
      <div className="card space-y-3">
        <label className="block"><span className="label">Asset name</span><input name="name" required className="input" placeholder="MacBook Pro 14 — finance" defaultValue={edit?.name} disabled={locked} maxLength={160} /></label>
        {edit && takeOn ? (
          <>
            <input type="hidden" name="takeOnReview" value="1" />
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="label">Acquisition date</span><input name="acquisitionDate" type="date" value={acquired} onChange={(e) => setAcquired(e.target.value)} required className="input" /></label>
              <label className="block"><span className="label">Cost (IDR)</span><MoneyInput name="cost" currency="IDR" defaultValue={edit.cost} onValueChange={setCost} required /></label>
              <label className="block"><span className="label">Salvage value (IDR)</span><MoneyInput name="salvageValue" currency="IDR" defaultValue={edit.salvageValue} onValueChange={setSalvage} /></label>
            </div>
            <p className="text-xs text-ink-500">Date and cost come from the ledger. An opening entry carries the date the books were taken over, not the day the asset was bought: enter the real acquisition date, the months left to depreciate are counted from it.</p>
          </>
        ) : edit ? (
          <div className="grid grid-cols-2 gap-3">
            <p className="text-sm"><span className="label">Cost and acquisition</span>{fmtMoney(edit.cost)} · {fmtDate(edit.acquisitionDate)}</p>
            <label className="block"><span className="label">Salvage value (IDR)</span>{locked ? <span className="block py-2 text-sm">{fmtMoney(edit.salvageValue)}</span> : <MoneyInput name="salvageValue" currency="IDR" defaultValue={edit.salvageValue} />}</label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Acquisition date</span><input name="acquisitionDate" type="date" defaultValue={defaultDate} required className="input" /></label>
            <label className="block"><span className="label">Cost (IDR)</span><MoneyInput name="cost" currency="IDR" required placeholder="" /></label>
            <label className="block"><span className="label">Salvage value (IDR)</span><MoneyInput name="salvageValue" currency="IDR" defaultValue={0} /></label>
            <label className="block"><span className="label">Bill id (optional)</span><input name="billId" className="input" /></label>
          </div>
        )}
        <label className="block"><span className="label">Fiscal group (UU PPh art. 11)</span>
          <select name="fiscalGroup" value={group} onChange={(e) => onGroup(e.target.value as FiscalAssetGroup)} className="input" disabled={locked}>{(Object.keys(FISCAL_ASSET_GROUPS) as FiscalAssetGroup[]).map((k) => <option key={k} value={k}>{FISCAL_ASSET_GROUPS[k].label}</option>)}</select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Useful life (months)</span><input name="usefulLifeMonths" value={months} onChange={(e) => setMonths(e.target.value)} inputMode="numeric" className="input text-right" disabled={locked || group === "land"} /></label>
          <label className="block"><span className="label">Method</span>
            <select name="method" value={method} onChange={(e) => setMethod(e.target.value as Method)} className="input" disabled={locked || group === "land"}>
              <option value="straight_line">Straight line ({Math.round(g.straightLineRate * 100)}% / year)</option>
              {g.decliningRate > 0 && <option value="declining_balance">Declining balance ({Math.round(g.decliningRate * 100)}% / year)</option>}
            </select>
          </label>
        </div>
        {takeOn && forward ? (
          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
            <legend className="label px-1">Depreciation in the previous books</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="label">Accumulated depreciation to date (IDR)</span><MoneyInput name="takeOnAccumulated" currency="IDR" defaultValue={takeOn.accumulated} onValueChange={setCarried} disabled={never} /></label>
              <label className="block"><span className="label">Depreciated through (month)</span><input name="takeOnThrough" type="month" value={never ? "" : through} onChange={(e) => setThrough(e.target.value)} min={ISO_DATE.test(acquired) ? periodOf(acquired) : undefined} placeholder="YYYY-MM" disabled={never} className="input" /></label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="neverDepreciated" value="1" checked={never} onChange={(e) => setNever(e.target.checked)} className="checkbox" />Never depreciated: start from the acquisition month</label>
            {forward.problem ? <p className="text-xs text-red-700">{forward.problem}</p> : (
              <p className="text-sm"><span className="font-medium">{forward.text}</span>{forward.catchUp && <span className="mt-1 block text-xs text-amber-700">{forward.catchUp}</span>}</p>
            )}
          </fieldset>
        ) : (
          <p className="text-xs text-ink-500">{locked ? "Depreciation is already posted on this asset: its name, group, method, useful life and salvage value can no longer change." : group === "land" ? "Land is not depreciated." : `Depreciation starts in the month of acquisition and runs ${months} months.`}</p>
        )}
      </div>
      <div className="card space-y-3">
        <label className="block"><span className="label">Asset (cost) account</span><AccountPicker name="assetAccountId" accounts={assetAccounts} value={assetAccountId} onChange={(id) => setAssetAccountId(id)} required /></label>
        <label className="block"><span className="label">Accumulated depreciation account</span><AccountPicker name="accumDeprAccountId" accounts={accumAccounts} value={accumAccountId} onChange={(id) => setAccumAccountId(id)} required /></label>
        <label className="block"><span className="label">Depreciation expense account</span><AccountPicker name="deprExpenseAccountId" accounts={expenseAccounts} defaultValue={edit?.deprExpenseAccountId || pick("6-2100", expenseAccounts)} required /></label>
        {edit && <label className="block"><span className="label">Notes</span><textarea name="notes" rows={3} maxLength={2000} defaultValue={edit.notes ?? ""} className="input" /></label>}
        <SubmitButton>{edit ? (edit.confirm ? "Confirm asset" : "Save changes") : "Register asset"}</SubmitButton>
        <p className="text-xs text-ink-500">{takeOn
          ? "Nothing is posted by confirming: the cost and the depreciation to date are already in the ledger. What is changed here changes the register only; the “Ledger and register” check on the Assets page shows whether the two still agree. From then on the monthly run posts the depreciation."
          : edit
          ? "The cost sits on the asset account the purchase was posted to. Changing an account here does not move what is already in the ledger: post a reclassification journal as well."
          : "An asset bought through a bill, an expense or a manual journal on a fixed-asset account registers itself, and the assets the ledger already carries (QuickBooks history, opening balances) are brought in from the Assets tab with their depreciation to date: this form is for an asset neither covers. Registering does not post the purchase. Monthly depreciation is posted from the Assets tab."}</p>
      </div>
    </form>
  );
}
