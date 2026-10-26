import { requirePermission } from "@/lib/auth";
import { Page } from "@/components/ui";
import { ServiceForm } from "../ServiceForm";
import { createService } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New service" };

export default async function NewService() {
  await requirePermission("crm:write");
  return (
    <Page title="New service" subtitle="Add a line to the price list. Quotes and invoices pick from active services." breadcrumbs={[{ href: "/clients/services", label: "Price list" }, { label: "New" }]}>
      <ServiceForm action={createService} />
    </Page>
  );
}
