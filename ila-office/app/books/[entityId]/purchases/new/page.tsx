import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { entityAccounts } from "@/lib/books";
import { findByCode } from "@/lib/balances";
import { todayISO } from "@/lib/dates";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../../shared";
import { BillForm } from "../BillForm";
import { createBillAction } from "../actions";
import { vendorOptions } from "../_data";

export const dynamic = "force-dynamic";

export default async function NewBill({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requirePermission("books:write");
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const [accounts, vendors] = await Promise.all([entityAccounts(entityId), vendorOptions()]);
  const opts = accounts.filter((a) => a.active && a.type !== "revenue" && !["ar", "ap", "bank", "cash", "accum_depr", "retained_earnings", "current_earnings"].includes(a.subtype)).map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type }));
  const def = findByCode(accounts, "6-9000")?.id ?? opts.find((a) => a.type === "expense")?.id ?? opts[0]?.id ?? "";
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} />
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold">New bill</h2><Link href={`${base(entityId)}/purchases`} className="text-xs text-brand-600 underline">Back to purchases</Link></div>
      <BillForm action={createBillAction.bind(null, entityId)} entity={{ pkp: entity.tax.pkp, ppnRate: entity.tax.ppnRate }} vendors={vendors} accounts={opts} defaultAccountId={def} defaultDate={todayISO()} />
    </div>
  );
}
