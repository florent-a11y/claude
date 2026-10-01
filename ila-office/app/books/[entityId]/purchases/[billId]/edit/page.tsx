import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { entityAccounts } from "@/lib/books";
import { findByCode } from "@/lib/balances";
import { todayISO } from "@/lib/dates";
import { ErrorNotice, base, first, requireEntity, type Search } from "../../../shared";
import { BillForm } from "../../BillForm";
import { updateBillAction } from "../../actions";
import { vendorOptions } from "../../_data";

export const dynamic = "force-dynamic";

export default async function EditBill({ params, searchParams }: { params: Promise<{ entityId: string; billId: string }>; searchParams: Search }) {
  await requirePermission("books:write");
  const { entityId, billId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const bill = await db.get("bills", billId);
  if (!bill || bill.entityId !== entityId) notFound();
  if (bill.status !== "draft") redirect(`${base(entityId)}/purchases/${billId}`);
  const [accounts, vendors] = await Promise.all([entityAccounts(entityId), vendorOptions()]);
  const opts = accounts.filter((a) => (a.active || bill.lines.some((l) => l.accountId === a.id)) && a.type !== "revenue" && !["ar", "ap", "bank", "cash", "accum_depr", "retained_earnings", "current_earnings"].includes(a.subtype)).map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type }));
  const def = findByCode(accounts, "6-9000")?.id ?? opts[0]?.id ?? "";
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} />
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Edit {bill.number} (draft)</h2><Link href={`${base(entityId)}/purchases/${billId}`} className="text-xs text-brand-600 underline">Back to bill</Link></div>
      <BillForm action={updateBillAction.bind(null, entityId, billId)} entity={{ pkp: entity.tax.pkp, ppnRate: entity.tax.ppnRate }} vendors={vendors} accounts={opts} defaultAccountId={def} defaultDate={todayISO()} bill={bill} />
    </div>
  );
}
