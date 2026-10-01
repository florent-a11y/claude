import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page } from "@/components/ui";
import { lookups, sortedContacts } from "../../../_lib/server";
import { CompanyForm } from "../../CompanyForm";
import { updateCompany } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditCompany({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("crm:write");
  const { id } = await params;
  const [company, l] = await Promise.all([db.get("companies", id), lookups()]);
  if (!company) notFound();
  return (
    <Page title={`Edit ${company.name}`} breadcrumbs={[{ href: "/crm/companies", label: "Companies" }, { href: `/crm/companies/${id}`, label: company.name }, { label: "Edit" }]}>
      <CompanyForm company={company} contacts={sortedContacts(l)} users={l.activeUsers} action={updateCompany.bind(null, id)} />
    </Page>
  );
}
