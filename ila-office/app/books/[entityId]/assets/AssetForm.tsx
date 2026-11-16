"use client";
import { useState } from "react";
import { FISCAL_ASSET_GROUPS, type FiscalAssetGroup } from "@/lib/types";
import { fmtDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
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
  /** Shown, not edited: they come from the purchase. */
  cost: number; acquisitionDate: string;
  /** Depreciation is already posted: the name and the schedule are fixed, the accounts and notes stay open. */
  locked: boolean;
  /** Saving also clears "needs review". */
  confirm: boolean;
  /** Query of the asset page to come back to (a sale started from a statement line). */
  keep?: string;
}

/**
 * Fixed-asset form: registration by hand, and with `edit` the confirmation or correction of a registered asset.
 * The fiscal group auto-fills the useful life and the default method (UU PPh art. 11); on a new asset it also
 * proposes the usual accounts, on a registered one the accounts are left alone (the cost is already posted there).
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
        {edit ? (
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
        <p className="text-xs text-ink-500">{locked ? "Depreciation is already posted on this asset: its name, group, method, useful life and salvage value can no longer change." : group === "land" ? "Land is not depreciated." : `Depreciation starts in the month of acquisition and runs ${months} months.`}</p>
      </div>
      <div className="card space-y-3">
        <label className="block"><span className="label">Asset (cost) account</span><AccountPicker name="assetAccountId" accounts={assetAccounts} value={assetAccountId} onChange={(id) => setAssetAccountId(id)} required /></label>
        <label className="block"><span className="label">Accumulated depreciation account</span><AccountPicker name="accumDeprAccountId" accounts={accumAccounts} value={accumAccountId} onChange={(id) => setAccumAccountId(id)} required /></label>
        <label className="block"><span className="label">Depreciation expense account</span><AccountPicker name="deprExpenseAccountId" accounts={expenseAccounts} defaultValue={edit?.deprExpenseAccountId || pick("6-2100", expenseAccounts)} required /></label>
        {edit && <label className="block"><span className="label">Notes</span><textarea name="notes" rows={3} maxLength={2000} defaultValue={edit.notes ?? ""} className="input" /></label>}
        <SubmitButton>{edit ? (edit.confirm ? "Confirm asset" : "Save changes") : "Register asset"}</SubmitButton>
        <p className="text-xs text-ink-500">{edit
          ? "The cost sits on the asset account the purchase was posted to. Changing an account here does not move what is already in the ledger: post a reclassification journal as well."
          : "An asset bought through a bill, an expense or a manual journal on a fixed-asset account registers itself: use this form only for assets already in the books (opening balances, imported history). Registering does not post the purchase. Monthly depreciation is posted from the Assets tab."}</p>
      </div>
    </form>
  );
}
