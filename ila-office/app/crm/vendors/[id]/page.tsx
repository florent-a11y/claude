import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page } from "@/components/ui";
import { VendorForm } from "../VendorForm";
import { updateVendor } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditVendor({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("crm:write");
  const { id } = await params;
  const vendor = await db.get("vendors", id);
  if (!vendor) notFound();
  return (
    <Page title={vendor.name} breadcrumbs={[{ href: "/crm/vendors", label: "Vendors" }, { label: vendor.name }]}>
      <VendorForm vendor={vendor} action={updateVendor.bind(null, id)} />
    </Page>
  );
}
