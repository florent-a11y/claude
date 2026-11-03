import { notFound } from "next/navigation";
import { can, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page, Notice } from "@/components/ui";
import { Attachments, CRM_SCOPE } from "@/components/Attachments";
import { VendorForm } from "../VendorForm";
import { updateVendor } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditVendor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("crm:write");
  const { id } = await params;
  const sp = await searchParams;
  const vendor = await db.get("vendors", id);
  if (!vendor) notFound();
  const here = `/clients/vendors/${id}`;
  return (
    <Page title={vendor.name} breadcrumbs={[{ href: "/clients/vendors", label: "Vendors" }, { label: vendor.name }]}>
      {sp.error ? <div className="mb-4"><Notice tone="red">{sp.error}</Notice></div> : sp.ok ? <div className="mb-4"><Notice tone="green">{sp.ok}</Notice></div> : null}
      <VendorForm vendor={vendor} action={updateVendor.bind(null, id)} />
      <Attachments entityId={CRM_SCOPE} docType="vendor" docId={vendor.id} items={vendor.attachments ?? []} canWrite={can(user, "crm:write")} backTo={here} className="mt-4 max-w-3xl" />
    </Page>
  );
}
