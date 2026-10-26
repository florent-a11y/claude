import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { SERVICE_CATEGORY_LABELS } from "@/lib/types";
import { Page } from "@/components/ui";
import { ServiceForm } from "../ServiceForm";
import { updateService } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditService({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("crm:write");
  const { id } = await params;
  const service = await db.get("services", id);
  if (!service) notFound();
  return (
    <Page title={service.name} subtitle={<span><span className="font-mono">{service.code}</span> · {SERVICE_CATEGORY_LABELS[service.category]}</span>}
      breadcrumbs={[{ href: "/clients/services", label: "Price list" }, { href: `/clients/services?category=${service.category}`, label: SERVICE_CATEGORY_LABELS[service.category] }, { label: service.code }]}>
      <ServiceForm service={service} action={updateService.bind(null, id)} />
    </Page>
  );
}
