import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page, Notice } from "@/components/ui";
import { EntityForm } from "../EntityForm";
import { createEntity } from "../../actions";
import { entityInputFromCompany } from "../create-entity";

export const dynamic = "force-dynamic";
export const metadata = { title: "New entity" };

/** `?companyId=` prefills the form from a client company (legal details, type, country) and links the books to it. */
export default async function NewEntity({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  await requirePermission("admin");
  const sp = await searchParams;
  const [companies, company] = await Promise.all([db.list("companies", { orderBy: "name" }), sp.companyId ? db.get("companies", sp.companyId) : Promise.resolve(null)]);
  const prefill = company ? entityInputFromCompany(company) : undefined;
  return (
    <Page title="New entity" subtitle={company ? `Books for ${company.name}` : undefined} breadcrumbs={[{ href: "/settings/entities", label: "Entities" }, { label: "New" }]}>
      {company?.entityId && <div className="mb-4"><Notice tone="amber">{company.name} already has books (entity {company.entityId}). Creating another entity will relink the company to the new one.</Notice></div>}
      {company && !company.entityId && <div className="mb-4"><Notice tone="blue">Prefilled from the client company {company.name}: check the tax profile (regime, PKP, LKPM, payroll) before creating the books.</Notice></div>}
      <EntityForm companies={companies} prefill={prefill} action={createEntity} />
    </Page>
  );
}
