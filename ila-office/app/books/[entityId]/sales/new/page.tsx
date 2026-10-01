import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { entityAccounts } from "@/lib/books";
import { findByTag } from "@/lib/balances";
import { todayISO } from "@/lib/dates";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../../shared";
import { InvoiceForm } from "../InvoiceForm";
import { createInvoiceAction } from "../actions";
import { customerOptions, defaultPaymentInstructions, serviceOptions } from "../_data";

export const dynamic = "force-dynamic";

export default async function NewInvoice({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requirePermission("books:write");
  const { entityId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const [accounts, customers, services, instructions] = await Promise.all([entityAccounts(entityId), customerOptions(), serviceOptions(entity), defaultPaymentInstructions(entityId)]);
  const revenue = accounts.filter((a) => a.active && a.type === "revenue").map((a) => ({ id: a.id, code: a.code, name: a.name }));
  const def = findByTag(accounts, "sales_default")?.id ?? revenue[0]?.id ?? "";
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} />
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold">New invoice</h2><Link href={`${base(entityId)}/sales`} className="text-xs text-brand-600 underline">Back to sales</Link></div>
      <InvoiceForm action={createInvoiceAction.bind(null, entityId)} entity={{ pkp: entity.tax.pkp, ppnRate: entity.tax.ppnRate }} customers={customers} accounts={revenue} services={services} defaultAccountId={def} defaultDate={todayISO()} defaultPaymentInstructions={instructions} />
    </div>
  );
}
