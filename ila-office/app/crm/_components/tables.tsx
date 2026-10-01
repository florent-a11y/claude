import Link from "next/link";
import { fmtDate, todayISO } from "@/lib/dates";
import { daysLeft, effectiveQuoteStatus, expiryUrgency } from "@/lib/crm";
import { DEAL_STAGE_LABELS, PROJECT_STATUS_LABELS, RENEWAL_KIND_LABELS, SERVICE_CATEGORY_LABELS, type Deal, type Project, type Quote, type Renewal, type TaskItem } from "@/lib/types";
import { Badge, Money, statusTone } from "@/components/ui";
import type { Lookups } from "../_lib/server";

/** Dense related-record tables reused by the contact, company and list pages. */

export function DealsTable({ deals, l, showCompany = true }: { deals: Deal[]; l: Lookups; showCompany?: boolean }) {
  if (deals.length === 0) return <p className="text-sm text-ink-500">No deals.</p>;
  return (
    <div className="overflow-x-auto"><table className="table table-wide">
      <thead><tr><th>Deal</th>{showCompany && <th>Company</th>}<th>Stage</th><th className="num">Amount</th><th>Owner</th><th>Close</th></tr></thead>
      <tbody>{deals.map((d) => (
        <tr key={d.id}>
          <td><Link href={`/crm/deals/${d.id}`} className="font-medium hover:underline">{d.title}</Link>{d.category && <span className="block text-xs text-ink-500">{SERVICE_CATEGORY_LABELS[d.category]}</span>}</td>
          {showCompany && <td className="text-xs">{d.companyId ? <Link href={`/crm/companies/${d.companyId}`} className="hover:underline">{l.company(d.companyId)}</Link> : "—"}</td>}
          <td><Badge tone={statusTone(d.stage)}>{DEAL_STAGE_LABELS[d.stage]}</Badge></td>
          <td className="num"><Money amount={d.amount} currency={d.currency} /></td>
          <td className="text-xs">{l.user(d.ownerUserId)}</td>
          <td className="text-xs">{fmtDate(d.expectedCloseDate)}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

export function QuotesTable({ quotes, l, showCompany = true }: { quotes: Quote[]; l: Lookups; showCompany?: boolean }) {
  const today = todayISO();
  if (quotes.length === 0) return <p className="text-sm text-ink-500">No quotes.</p>;
  return (
    <div className="overflow-x-auto"><table className="table table-wide">
      <thead><tr><th>Number</th><th>Title</th>{showCompany && <th>Client</th>}<th>Status</th><th className="num">Total</th><th>Valid until</th><th>Prepared by</th></tr></thead>
      <tbody>{quotes.map((q) => { const st = effectiveQuoteStatus(q, today); return (
        <tr key={q.id}>
          <td className="whitespace-nowrap"><Link href={`/crm/quotes/${q.id}`} className="font-medium hover:underline">{q.number}</Link></td>
          <td>{q.title}</td>
          {showCompany && <td className="text-xs">{q.companyId ? <Link href={`/crm/companies/${q.companyId}`} className="hover:underline">{l.company(q.companyId)}</Link> : l.contact(q.contactId)}</td>}
          <td><Badge tone={statusTone(st)}>{st}</Badge></td>
          <td className="num"><Money amount={q.total} currency={q.currency} /></td>
          <td className="text-xs">{fmtDate(q.validUntil)}</td>
          <td className="text-xs">{l.user(q.preparedByUserId)}</td>
        </tr>
      ); })}</tbody>
    </table></div>
  );
}

export function ProjectsTable({ projects, l, showCompany = true }: { projects: Project[]; l: Lookups; showCompany?: boolean }) {
  if (projects.length === 0) return <p className="text-sm text-ink-500">No projects.</p>;
  return (
    <div className="overflow-x-auto"><table className="table table-wide">
      <thead><tr><th>Number</th><th>Project</th>{showCompany && <th>Client</th>}<th>Status</th><th>Checklist</th><th className="num">Fee</th><th>Assignee</th><th>Due</th></tr></thead>
      <tbody>{projects.map((p) => { const done = p.checklist.filter((c) => c.done).length; return (
        <tr key={p.id}>
          <td className="whitespace-nowrap"><Link href={`/crm/projects/${p.id}`} className="font-medium hover:underline">{p.number}</Link></td>
          <td>{p.title}<span className="block text-xs text-ink-500">{SERVICE_CATEGORY_LABELS[p.category]}{p.subject?.name ? ` · ${p.subject.name}` : ""}</span></td>
          {showCompany && <td className="text-xs">{p.companyId ? <Link href={`/crm/companies/${p.companyId}`} className="hover:underline">{l.company(p.companyId)}</Link> : l.contact(p.contactId)}</td>}
          <td><Badge tone={statusTone(p.status)}>{PROJECT_STATUS_LABELS[p.status]}</Badge></td>
          <td className="text-xs tabular-nums">{done}/{p.checklist.length}</td>
          <td className="num"><Money amount={p.feeAmount} currency={p.feeCurrency} /></td>
          <td className="text-xs">{l.user(p.assigneeUserId ?? p.ownerUserId)}</td>
          <td className="text-xs">{fmtDate(p.dueDate)}</td>
        </tr>
      ); })}</tbody>
    </table></div>
  );
}

export function DaysLeft({ expiresAt }: { expiresAt: string }) {
  const d = daysLeft(expiresAt, todayISO());
  const tone = expiryUrgency(d);
  return <Badge tone={tone}>{d < 0 ? `${-d} d overdue` : d === 0 ? "today" : `${d} d`}</Badge>;
}

export function RenewalsTable({ renewals, l, showClient = true, actions }: { renewals: Renewal[]; l: Lookups; showClient?: boolean; actions?: (r: Renewal) => React.ReactNode }) {
  if (renewals.length === 0) return <p className="text-sm text-ink-500">No renewals.</p>;
  return (
    <div className="overflow-x-auto"><table className="table table-wide">
      <thead><tr><th>Expires</th><th>Left</th><th>Kind</th><th>Renewal</th>{showClient && <th>Client</th>}<th>Status</th><th>Owner</th>{actions && <th></th>}</tr></thead>
      <tbody>{renewals.map((r) => (
        <tr key={r.id}>
          <td className="whitespace-nowrap text-xs">{fmtDate(r.expiresAt)}</td>
          <td><DaysLeft expiresAt={r.expiresAt} /></td>
          <td className="text-xs">{RENEWAL_KIND_LABELS[r.kind]}</td>
          <td>{r.label}{r.projectId && <Link href={`/crm/projects/${r.projectId}`} className="ml-1 text-xs text-brand-600 underline">project</Link>}{r.renewalProjectId && <Link href={`/crm/projects/${r.renewalProjectId}`} className="ml-1 text-xs text-brand-600 underline">renewal project</Link>}{r.notes && <span className="block text-xs text-ink-500">{r.notes}</span>}</td>
          {showClient && <td className="text-xs">{r.companyId ? <Link href={`/crm/companies/${r.companyId}`} className="hover:underline">{l.company(r.companyId)}</Link> : null}{r.companyId && r.contactId ? " · " : ""}{r.contactId ? <Link href={`/crm/contacts/${r.contactId}`} className="hover:underline">{l.contact(r.contactId)}</Link> : null}{!r.companyId && !r.contactId ? "—" : ""}</td>}
          <td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
          <td className="text-xs">{l.user(r.ownerUserId)}</td>
          {actions && <td className="text-xs">{actions(r)}</td>}
        </tr>
      ))}</tbody>
    </table></div>
  );
}

export function TaskRows({ tasks, l, toggle }: { tasks: TaskItem[]; l: Lookups; toggle: (t: TaskItem) => React.ReactNode }) {
  const today = todayISO();
  if (tasks.length === 0) return <p className="text-sm text-ink-500">No open tasks.</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {tasks.map((t) => {
        const overdue = !t.done && t.dueDate && t.dueDate < today;
        return (
          <li key={t.id} className="flex items-center gap-3 py-1.5">
            {toggle(t)}
            <span className={`flex-1 ${t.done ? "text-ink-500 line-through" : ""}`}>{t.title}</span>
            <span className="text-xs text-ink-500">{l.user(t.assigneeUserId)}</span>
            {t.dueDate && <Badge tone={overdue ? "red" : "slate"}>{fmtDate(t.dueDate)}</Badge>}
          </li>
        );
      })}
    </ul>
  );
}
