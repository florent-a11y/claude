"use client";
import { useState } from "react";
import { FISCAL_ASSET_GROUPS, type FiscalAssetGroup } from "@/lib/types";
import { SubmitButton } from "@/components/client";

export interface AccountOpt { id: string; code: string; name: string }

/** Fixed-asset registration: the fiscal group auto-fills the useful life and the default method (UU PPh art. 11). */
export function AssetForm({ action, assetAccounts, accumAccounts, expenseAccounts, defaultDate }: { action: (fd: FormData) => Promise<void>; assetAccounts: AccountOpt[]; accumAccounts: AccountOpt[]; expenseAccounts: AccountOpt[]; defaultDate: string }) {
  const [group, setGroup] = useState<FiscalAssetGroup>("group1");
  const [months, setMonths] = useState(String(FISCAL_ASSET_GROUPS.group1.usefulLifeYears * 12));
  const [method, setMethod] = useState<"straight_line" | "declining_balance">("straight_line");
  const g = FISCAL_ASSET_GROUPS[group];
  const pick = (code: string, list: AccountOpt[]) => list.find((a) => a.code === code)?.id ?? list[0]?.id;
  const defaults: Record<FiscalAssetGroup, { asset: string; accum: string }> = {
    group1: { asset: "1-2300", accum: "1-2310" }, group2: { asset: "1-2200", accum: "1-2210" }, group3: { asset: "1-2300", accum: "1-2310" }, group4: { asset: "1-2300", accum: "1-2310" },
    building_permanent: { asset: "1-2100", accum: "1-2110" }, building_non_permanent: { asset: "1-2100", accum: "1-2110" }, land: { asset: "1-2000", accum: "1-2110" },
  };
  const [assetAccountId, setAssetAccountId] = useState(pick("1-2300", assetAccounts) ?? "");
  const [accumAccountId, setAccumAccountId] = useState(pick("1-2310", accumAccounts) ?? "");
  const onGroup = (v: FiscalAssetGroup) => {
    setGroup(v);
    setMonths(String(FISCAL_ASSET_GROUPS[v].usefulLifeYears * 12));
    if (FISCAL_ASSET_GROUPS[v].decliningRate === 0) setMethod("straight_line");
    const d = defaults[v];
    setAssetAccountId(pick(d.asset, assetAccounts) ?? assetAccountId);
    setAccumAccountId(pick(d.accum, accumAccounts) ?? accumAccountId);
  };
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-3">
        <label className="block"><span className="label">Asset name</span><input name="name" required className="input" placeholder="MacBook Pro 14 — finance" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Acquisition date</span><input name="acquisitionDate" type="date" defaultValue={defaultDate} required className="input" /></label>
          <label className="block"><span className="label">Cost (IDR)</span><input name="cost" inputMode="numeric" required className="input text-right" /></label>
          <label className="block"><span className="label">Salvage value (IDR)</span><input name="salvageValue" inputMode="numeric" defaultValue="0" className="input text-right" /></label>
          <label className="block"><span className="label">Bill id (optional)</span><input name="billId" className="input" /></label>
        </div>
        <label className="block"><span className="label">Fiscal group (UU PPh art. 11)</span>
          <select name="fiscalGroup" value={group} onChange={(e) => onGroup(e.target.value as FiscalAssetGroup)} className="input">{(Object.keys(FISCAL_ASSET_GROUPS) as FiscalAssetGroup[]).map((k) => <option key={k} value={k}>{FISCAL_ASSET_GROUPS[k].label}</option>)}</select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Useful life (months)</span><input name="usefulLifeMonths" value={months} onChange={(e) => setMonths(e.target.value)} inputMode="numeric" className="input text-right" disabled={group === "land"} /></label>
          <label className="block"><span className="label">Method</span>
            <select name="method" value={method} onChange={(e) => setMethod(e.target.value as "straight_line" | "declining_balance")} className="input" disabled={group === "land"}>
              <option value="straight_line">Straight line ({Math.round(g.straightLineRate * 100)}% / year)</option>
              {g.decliningRate > 0 && <option value="declining_balance">Declining balance ({Math.round(g.decliningRate * 100)}% / year)</option>}
            </select>
          </label>
        </div>
        <p className="text-xs text-ink-500">{group === "land" ? "Land is not depreciated." : `Depreciation starts in the month of acquisition and runs ${months} months.`}</p>
      </div>
      <div className="card space-y-3">
        <label className="block"><span className="label">Asset (cost) account</span><select name="assetAccountId" value={assetAccountId} onChange={(e) => setAssetAccountId(e.target.value)} className="input">{assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
        <label className="block"><span className="label">Accumulated depreciation account</span><select name="accumDeprAccountId" value={accumAccountId} onChange={(e) => setAccumAccountId(e.target.value)} className="input">{accumAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
        <label className="block"><span className="label">Depreciation expense account</span><select name="deprExpenseAccountId" defaultValue={pick("6-2100", expenseAccounts)} className="input">{expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
        <SubmitButton>Register asset</SubmitButton>
        <p className="text-xs text-ink-500">Registering does not post the purchase: book it through a bill (Dr asset account) or a journal. Monthly depreciation is posted from the Assets tab.</p>
      </div>
    </form>
  );
}
