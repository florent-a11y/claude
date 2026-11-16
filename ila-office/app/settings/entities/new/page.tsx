import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page, Notice } from "@/components/ui";
import { EntityForm } from "../EntityForm";
import { createEntity } from "../../actions";
import { entityInputFromCompany } from "../create-entity";
import { unlinkedBooksFor } from "../entity-sync";

export const dynamic = "force-dynamic";
export const metadata = { title: "New entity" };

/**
 * `?companyId=` prefills the form from a client company (legal details, type, country) and links the books to it.
 * Without a company the action creates the client record too (createEntity), so an entity never exists on one side only.
 */
export default async function NewEntity({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  await requirePermission("admin");
  const sp = await searchParams;
  const [companies, company] = await Promise.all([db.list("companies", { orderBy: "name" }), sp.companyId ? db.get("companies", sp.companyId) : Promise.resolve(null)]);
  const prefill = company ? entityInputFromCompany(company) : undefined;
  // Books of the same name or NPWP that no client company uses yet: linking them is better than a second set.
  const existing = company && !company.entityId ? unlinkedBooksFor(company, await db.list("entities")) : [];
  return (
    <Page title="New entity" subtitle={company ? `Books for ${company.name}` : "Creating a client under Clients › Client companies also creates its books; use this form for the tax profile or for an entity without a client record."} breadcrumbs={[{ href: "/settings/entities", label: "Entities" }, { label: "New" }]}>
      {company?.entityId && <div className="mb-4"><Notice tone="amber">{company.name} already has books (entity {company.entityId}). Creating another entity will relink the company to the new one.</Notice></div>}
      {company && existing.length > 0 && <div className="mb-4"><Notice tone="amber">Books that look like {company.name} already exist: {existing.map((e, i) => <span key={e.id}>{i > 0 && ", "}<Link className="font-medium underline" href={`/settings/entities/${e.id}`}>{e.name}</Link></span>)}. Open them and pick {company.name} under “Client company” instead of creating a second set.</Notice></div>}
      {company && !company.entityId && <div className="mb-4"><Notice tone="blue">Prefilled from the client company {company.name}: check the tax profile (regime, PKP, LKPM, payroll) before creating the books.</Notice></div>}
      <EntityForm companies={companies} prefill={prefill} action={createEntity} />
    </Page>
  );
}
