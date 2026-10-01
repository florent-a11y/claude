import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page } from "@/components/ui";
import { EntityForm } from "../EntityForm";
import { updateEntity } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditEntity({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("admin");
  const { id } = await params;
  const [entity, companies, accounts] = await Promise.all([db.get("entities", id), db.list("companies", { orderBy: "name" }), db.count("accounts", { entityId: id })]);
  if (!entity) notFound();
  const action = updateEntity.bind(null, id);
  return (
    <Page title={entity.name} subtitle={`${accounts} accounts in the chart of accounts`} breadcrumbs={[{ href: "/settings/entities", label: "Entities" }, { label: entity.name }]}>
      <EntityForm entity={entity} companies={companies} action={action} />
    </Page>
  );
}
