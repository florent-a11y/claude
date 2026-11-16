import { requirePermission } from "@/lib/auth";
import { Page } from "@/components/ui";
import { lookups, sortedContacts } from "../../_lib/server";
import { CompanyForm } from "../CompanyForm";
import { createCompany } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New company" };

/** `?books=1` (the dashboard's "New client") opens the form for a client ILA keeps the books of: legal form, active, books ticked. */
export default async function NewCompany({ searchParams }: { searchParams: Promise<{ contactId?: string; books?: string }> }) {
  await requirePermission("crm:write");
  const sp = await searchParams;
  const l = await lookups();
  const asClient = sp.books === "1";
  return (
    <Page title={asClient ? "New client" : "New company"} subtitle="One form creates the client record and, with the books box ticked, its set of books: nothing to enter again under Settings → Entities." breadcrumbs={[{ href: "/clients/companies", label: "Client companies" }, { label: "New" }]}>
      <CompanyForm contacts={sortedContacts(l)} users={l.activeUsers} action={createCompany} defaultContactId={sp.contactId} asClient={asClient} />
    </Page>
  );
}
