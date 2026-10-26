import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { entityAccounts } from "@/lib/books";
import { todayISO } from "@/lib/dates";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../../shared";
import { AssetForm } from "../AssetForm";
import { createAssetAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewAsset({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requirePermission("books:write");
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const accounts = (await entityAccounts(entityId)).filter((a) => a.active);
  const opt = (a: typeof accounts[number]) => ({ id: a.id, code: a.code, name: a.name });
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} />
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Register fixed asset</h2><Link href={`${base(entityId)}/assets`} className="text-xs text-brand-600 underline">Back to assets</Link></div>
      <AssetForm action={createAssetAction.bind(null, entityId)} assetAccounts={accounts.filter((a) => a.subtype === "fixed_asset").map(opt)} accumAccounts={accounts.filter((a) => a.subtype === "accum_depr").map(opt)} expenseAccounts={accounts.filter((a) => a.subtype === "depreciation" || a.type === "expense").sort((x, y) => (x.subtype === "depreciation" ? -1 : 1) - (y.subtype === "depreciation" ? -1 : 1)).map(opt)} defaultDate={todayISO()} />
    </div>
  );
}
