import { requirePermission } from "@/lib/auth";
import { Page } from "@/components/ui";
import { lookups, sortedCompanies } from "../../_lib/server";
import { ContactForm } from "../ContactForm";
import { createContact } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New contact" };

export default async function NewContact({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  await requirePermission("crm:write");
  const sp = await searchParams;
  const l = await lookups();
  return (
    <Page title="New contact" breadcrumbs={[{ href: "/crm/contacts", label: "Contacts" }, { label: "New" }]}>
      <ContactForm companies={sortedCompanies(l)} users={l.activeUsers} action={createContact} defaultCompanyId={sp.companyId} />
    </Page>
  );
}
