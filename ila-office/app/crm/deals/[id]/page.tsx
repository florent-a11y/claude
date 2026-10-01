import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { dealAgeDays } from "@/lib/crm";
import { fmtDate, nowISO } from "@/lib/dates";
import { DEAL_STAGE_LABELS, DEAL_STAGE_PROBABILITY } from "@/lib/types";
import { Page, Card, DL, Badge, Money, statusTone } from "@/components/ui";
import { ConfirmForm } from "@/components/client";
import { activitiesFor, lookups } from "../../_lib/server";
import { Timeline } from "../../_components/Timeline";
import { TaskPanel } from "../../_components/TaskPanel";
import { ProjectsTable, QuotesTable } from "../../_components/tables";
import { DealForm } from "../DealForm";
import { StageMover } from "../StageMover";
import { deleteDeal, updateDeal } from "../actions";

export const dynamic = "force-dynamic";

export default async function DealDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const deal = await db.get("deals", id);
  if (!deal) notFound();
  const [l, quotes, projects, tasks, activities] = await Promise.all([
    lookups(),
    db.list("quotes", { where: { dealId: id }, orderBy: "createdAt", desc: true }),
    db.list("projects", { where: { dealId: id }, orderBy: "createdAt", desc: true }),
    db.list("tasks", { where: (t) => t.related?.type === "deal" && t.related.id === id }),
    activitiesFor((a) => a.dealId === id),
  ]);
  const write = can(me, "crm:write");
  const path = `/crm/deals/${id}`;
  const qs = `dealId=${id}${deal.companyId ? `&companyId=${deal.companyId}` : ""}${deal.contactId ? `&contactId=${deal.contactId}` : ""}`;
  return (
    <Page title={deal.title} subtitle={<span><Badge tone={statusTone(deal.stage)}>{DEAL_STAGE_LABELS[deal.stage]}</Badge> · <Money amount={deal.amount} currency={deal.currency} /> · {dealAgeDays(deal, nowISO())} days old</span>}
      breadcrumbs={[{ href: "/crm/deals", label: "Deals" }, { label: deal.title }]}
      actions={<>
        {write && <StageMover id={id} stage={deal.stage} compact={false} />}
        {write && <Link href={`/crm/quotes/new?${qs}`} className="btn-secondary">New quote</Link>}
        {write && <Link href={`/crm/projects/new?${qs}`} className="btn-secondary">New project</Link>}
      </>}>
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-4">
          <Card title="Summary">
            <DL items={[
              ["Company", deal.companyId ? <Link className="text-brand-600 underline" href={`/crm/companies/${deal.companyId}`}>{l.company(deal.companyId)}</Link> : "—"],
              ["Contact", deal.contactId ? <Link className="text-brand-600 underline" href={`/crm/contacts/${deal.contactId}`}>{l.contact(deal.contactId)}</Link> : "—"],
              ["Weighted", <Money key="w" amount={deal.amount * DEAL_STAGE_PROBABILITY[deal.stage]} currency={deal.currency} />],
              ["Owner", l.user(deal.ownerUserId)], ["Created", fmtDate(deal.createdAt.slice(0, 10))],
              ["Expected close", fmtDate(deal.expectedCloseDate)], ["Closed", deal.closedAt ? fmtDate(deal.closedAt.slice(0, 10)) : "—"],
              ["Quote", deal.quoteId ? <Link className="text-brand-600 underline" href={`/crm/quotes/${deal.quoteId}`}>open quote</Link> : "—"],
              ["Project", deal.projectId ? <Link className="text-brand-600 underline" href={`/crm/projects/${deal.projectId}`}>open project</Link> : "—"],
            ]} />
          </Card>
          <Card title={`Quotes (${quotes.length})`}><QuotesTable quotes={quotes} l={l} showCompany={false} /></Card>
          <Card title={`Projects (${projects.length})`}><ProjectsTable projects={projects} l={l} showCompany={false} /></Card>
          <TaskPanel tasks={tasks} related={{ type: "deal", id }} backPath={path} l={l} meId={me.id} />
        </div>
        <div className="space-y-4">
          {write ? <DealForm deal={deal} l={l} action={updateDeal.bind(null, id)} /> : <Card title="Details"><DL items={[["Next step", deal.nextStep ?? "—"], ["Source", deal.source ?? "—"], ["Lost reason", deal.lostReason ?? "—"]]} /></Card>}
          <Timeline activities={activities} refs={{ dealId: id, companyId: deal.companyId, contactId: deal.contactId }} backPath={path} canWrite={write} />
          {write && !deal.quoteId && !deal.projectId && <ConfirmForm action={deleteDeal.bind(null, id)} message="Delete this deal permanently?"><button className="text-xs text-red-600 underline">Delete deal</button></ConfirmForm>}
        </div>
      </div>
    </Page>
  );
}
