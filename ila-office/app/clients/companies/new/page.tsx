import { requirePermission } from "@/lib/auth";
import { Page } from "@/components/ui";
import { lookups, sortedContacts } from "../../_lib/server";
import { CompanyForm } from "../CompanyForm";
import { createCompany } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New company" };

export default async function NewCompany({ searchParams }: { searchParams: Promise<{ contactId?: string }> }) {
  await requirePermission("crm:write");
  const sp = await searchParams;
  const l = await lookups();
  return (
    <Page title="New company" breadcrumbs={[{ href: "/clients/companies", label: "Companies" }, { label: "New" }]}>
      <CompanyForm contacts={sortedContacts(l)} users={l.activeUsers} action={createCompany} defaultContactId={sp.contactId} />
    </Page>
  );
}
