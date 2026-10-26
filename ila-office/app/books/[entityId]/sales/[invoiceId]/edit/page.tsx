import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { entityAccounts } from "@/lib/books";
import { findByTag } from "@/lib/balances";
import { todayISO } from "@/lib/dates";
import { ErrorNotice, base, first, requireEntity, type Search } from "../../../shared";
import { InvoiceForm } from "../../InvoiceForm";
import { updateInvoiceAction } from "../../actions";
import { customerOptions, serviceOptions } from "../../_data";

export const dynamic = "force-dynamic";

export default async function EditInvoice({ params, searchParams }: { params: Promise<{ entityId: string; invoiceId: string }>; searchParams: Search }) {
  await requirePermission("books:write");
  const { entityId, invoiceId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const invoice = await db.get("invoices", invoiceId);
  if (!invoice || invoice.entityId !== entityId) notFound();
  if (invoice.status !== "draft") redirect(`${base(entityId)}/sales/${invoiceId}`);
  const [accounts, customers, services] = await Promise.all([entityAccounts(entityId), customerOptions(), serviceOptions(entity)]);
  const revenue = accounts.filter((a) => (a.active || invoice.lines.some((l) => l.accountId === a.id)) && a.type === "revenue").map((a) => ({ id: a.id, code: a.code, name: a.name }));
  const def = findByTag(accounts, "sales_default")?.id ?? revenue[0]?.id ?? "";
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} />
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Edit {invoice.number} (draft)</h2><Link href={`${base(entityId)}/sales/${invoiceId}`} className="text-xs text-brand-600 underline">Back to invoice</Link></div>
      <InvoiceForm action={updateInvoiceAction.bind(null, entityId, invoiceId)} entity={{ pkp: entity.tax.pkp, ppnRate: entity.tax.ppnRate }} customers={customers} accounts={revenue} services={services} defaultAccountId={def} defaultDate={todayISO()} invoice={invoice} />
    </div>
  );
}
