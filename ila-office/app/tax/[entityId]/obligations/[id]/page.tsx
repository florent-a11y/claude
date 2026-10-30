import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, periodLabel, todayISO } from "@/lib/dates";
import { OBLIGATION_LABELS, OBLIGATION_STATUS_LABELS } from "@/lib/types";
import { isOverdue } from "@/lib/tax/calendar";
import { Card, Badge, DL, Notice, statusTone } from "@/components/ui";
import { Attachments } from "@/components/Attachments";
import { relatedLink } from "../../../links";

export const dynamic = "force-dynamic";

/**
 * One obligation of the compliance calendar with its supporting documents: the payment receipt (NTPN / BPE), the
 * filed return and the client's data. Status, assignee and amounts are edited from the calendar itself.
 */
export default async function ObligationDetail({ params, searchParams }: { params: Promise<{ entityId: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { entityId, id } = await params;
  const sp = await searchParams;
  const o = await db.get("tax_obligations", decodeURIComponent(id));
  if (!o || o.entityId !== entityId) notFound();
  const assignee = o.assigneeUserId ? await db.get("users", o.assigneeUserId) : null;
  const canWrite = can(user, "tax:write");
  const year = o.period.slice(0, 4);
  const overdue = isOverdue(o, todayISO());
  const link = relatedLink(o);
  const here = `/tax/${entityId}/obligations/${encodeURIComponent(o.id)}`;
  const calendar = `/tax/${entityId}?year=${year}`;
  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={calendar} className="btn-ghost">‹ Calendar</Link>
          <h2 className="text-lg font-semibold">{o.label} · {periodLabel(o.period)}</h2>
          <Badge tone={statusTone(o.status)}>{OBLIGATION_STATUS_LABELS[o.status]}</Badge>
          {overdue && <Badge tone="red">overdue</Badge>}
        </div>
        {canWrite && <Link href={`${calendar}&o=${encodeURIComponent(o.id)}`} className="btn-secondary">Edit on the calendar</Link>}
      </div>
      {sp.error ? <Notice tone="red">{sp.error}</Notice> : sp.ok ? <Notice tone="green">{sp.ok}</Notice> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card title="Obligation">
            <DL items={[
              ["Type", OBLIGATION_LABELS[o.type]],
              ["Period", periodLabel(o.period)],
              ["Data due", fmtDate(o.dataDue)],
              ["Payment due", fmtDate(o.paymentDue)],
              ["Report due", <span key="r" className={overdue ? "font-semibold text-red-700" : ""}>{fmtDate(o.reportDue)}</span>],
              ["Status", OBLIGATION_STATUS_LABELS[o.status]],
              ["Amount", o.amount !== undefined ? `IDR ${o.amount.toLocaleString("en-US")}` : "—"],
              ["Assignee", assignee?.name ?? "—"],
              ["NTPN", o.ntpn ?? "—"],
              ["Paid on", fmtDate(o.paidAt)],
              ["Reported on", fmtDate(o.reportedAt)],
              ...(link ? [["Source data", <Link key="l" className="text-brand-600 underline" href={link.href}>{link.label}</Link>] as [string, ReactNode]] : []),
              ["Last updated", o.updatedAt ? fmtDateTime(o.updatedAt) : "—"],
            ]} />
            {o.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm">{o.notes}</p>}
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          <Attachments entityId={entityId} docType="obligation" docId={o.id} items={o.attachments ?? []} canWrite={canWrite} backTo={here} />
          <p className="text-xs text-ink-500">Attach the payment receipt (NTPN / BPE from DJP Online or the bank), the filed return (SPT Masa, LKPM or annual report acknowledgement) and the client's approval or data. Anyone who can see this entity's tax pages can open the files.</p>
        </div>
      </div>
    </div>
  );
}
