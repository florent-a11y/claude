import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page } from "@/components/ui";
import { lookups, sortedContacts } from "../../../_lib/server";
import { CompanyForm } from "../../CompanyForm";
import { updateCompany } from "../../actions";
import { missingLegalDetails } from "@/app/settings/entities/entity-sync";

export const dynamic = "force-dynamic";

export default async function EditCompany({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("crm:write");
  const { id } = await params;
  const [company, l] = await Promise.all([db.get("companies", id), lookups()]);
  if (!company) notFound();
  // Legal details are shared with the books: a field still empty here shows the entity's value, and saving stores it on both.
  const entity = company.entityId ? await db.get("entities", company.entityId) : null;
  const shown = entity?.crmCompanyId === id ? { ...company, ...missingLegalDetails(company, entity) } : company;
  return (
    <Page title={`Edit ${company.name}`} breadcrumbs={[{ href: "/clients/companies", label: "Client companies" }, { href: `/clients/companies/${id}`, label: company.name }, { label: "Edit" }]}>
      <CompanyForm company={shown} contacts={sortedContacts(l)} users={l.activeUsers} action={updateCompany.bind(null, id)} />
    </Page>
  );
}
