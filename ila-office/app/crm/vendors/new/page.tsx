import { requirePermission } from "@/lib/auth";
import { Page } from "@/components/ui";
import { VendorForm } from "../VendorForm";
import { createVendor } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New vendor" };

export default async function NewVendor() {
  await requirePermission("crm:write");
  return (
    <Page title="New vendor" breadcrumbs={[{ href: "/crm/vendors", label: "Vendors" }, { label: "New" }]}>
      <VendorForm action={createVendor} />
    </Page>
  );
}
