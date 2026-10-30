import { notFound } from "next/navigation";
import { can, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page, Notice } from "@/components/ui";
import { Attachments } from "@/components/Attachments";
import { EntityForm } from "../EntityForm";
import { updateEntity } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditEntity({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("admin");
  const { id } = await params;
  const sp = await searchParams;
  const [entity, companies, accounts] = await Promise.all([db.get("entities", id), db.list("companies", { orderBy: "name" }), db.count("accounts", { entityId: id })]);
  if (!entity) notFound();
  const action = updateEntity.bind(null, id);
  const here = `/settings/entities/${id}`;
  return (
    <Page title={entity.name} subtitle={`${accounts} accounts in the chart of accounts`} breadcrumbs={[{ href: "/settings/entities", label: "Entities" }, { label: entity.name }]}>
      {sp.error ? <div className="mb-4"><Notice tone="red">{sp.error}</Notice></div> : sp.ok ? <div className="mb-4"><Notice tone="green">{sp.ok}</Notice></div> : null}
      <EntityForm entity={entity} companies={companies} action={action} />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Attachments entityId={entity.id} docType="entity" docId={entity.id} items={entity.attachments ?? []} canWrite={can(user, "admin")} backTo={here} />
        <div className="text-xs text-ink-500 md:pt-1"><p className="font-semibold text-ink-700">Corporate documents</p><p className="mt-1">Deed of establishment (akta) and amendments, SK Kemenkumham, NIB and OSS licences, the NPWP and PKP confirmation letters, domicile letter. Administrators only; the files are visible to the team on this page.</p></div>
      </div>
    </Page>
  );
}
