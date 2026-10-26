import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page } from "@/components/ui";
import { EntityForm } from "../EntityForm";
import { createEntity } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New entity" };

export default async function NewEntity() {
  await requirePermission("admin");
  const companies = await db.list("companies", { orderBy: "name" });
  return (
    <Page title="New entity" breadcrumbs={[{ href: "/settings/entities", label: "Entities" }, { label: "New" }]}>
      <EntityForm companies={companies} action={createEntity} />
    </Page>
  );
}
