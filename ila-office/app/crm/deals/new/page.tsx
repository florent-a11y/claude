import { requirePermission } from "@/lib/auth";
import { Page } from "@/components/ui";
import { lookups } from "../../_lib/server";
import { DealForm } from "../DealForm";
import { createDeal } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New deal" };

export default async function NewDeal({ searchParams }: { searchParams: Promise<{ companyId?: string; contactId?: string; title?: string }> }) {
  await requirePermission("crm:write");
  const sp = await searchParams;
  const l = await lookups();
  return (
    <Page title="New deal" breadcrumbs={[{ href: "/crm/deals", label: "Deals" }, { label: "New" }]}>
      <DealForm l={l} action={createDeal} defaults={{ companyId: sp.companyId, contactId: sp.contactId, title: sp.title }} />
    </Page>
  );
}
