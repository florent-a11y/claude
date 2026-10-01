import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { checklistProgress, PROJECT_TRANSITIONS, projectCostSummary } from "@/lib/crm";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { PROJECT_STATUS_LABELS, SERVICE_CATEGORY_LABELS } from "@/lib/types";
import { Page, Card, DL, Badge, Money, Field, Select, Notice, statusTone } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { activeServices, activitiesFor, lookups } from "../../_lib/server";
import { Timeline } from "../../_components/Timeline";
import { TaskPanel } from "../../_components/TaskPanel";
import { ProjectForm } from "../ProjectForm";
import { addChecklistItem, addCostLine, approveCostLine, markCostPaid, removeChecklistItem, removeCostLine, setProjectStatus, toggleChecklist, updateProject } from "../actions";

export const dynamic = "force-dynamic";

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const p = await db.get("projects", id);
  if (!p) notFound();
  const [l, services, vendors, renewals, tasks, activities, deals, quotes] = await Promise.all([
    lookups(), activeServices(), db.list("vendors", { where: { active: true }, orderBy: "name" }), db.list("renewals", { where: { projectId: id } }),
    db.list("tasks", { where: (t) => t.related?.type === "project" && t.related.id === id }), activitiesFor((a) => a.projectId === id),
    db.list("deals", { orderBy: "createdAt", desc: true }), db.list("quotes", { orderBy: "createdAt", desc: true }),
  ]);
  const write = can(me, "crm:write");
  const canApprove = write && (me.role === "admin" || p.ownerUserId === me.id);
  const service = p.serviceId ? services.find((s) => s.id === p.serviceId) : undefined;
  const progress = checklistProgress(p.checklist);
  const cost = projectCostSummary(p);
  const path = `/crm/projects/${id}`;
  const transitions = PROJECT_TRANSITIONS[p.status];
  return (
    <Page title={`${p.number} · ${p.title}`} subtitle={<span><Badge tone={statusTone(p.status)}>{PROJECT_STATUS_LABELS[p.status]}</Badge> · {SERVICE_CATEGORY_LABELS[p.category]}{service ? ` · ${service.name}` : ""} · checklist {progress.done}/{progress.total}</span>}
      breadcrumbs={[{ href: "/crm/projects", label: "Projects" }, { label: p.number }]}
      actions={write && transitions.map((s) => (
        <form key={s} action={setProjectStatus.bind(null, id)}><input type="hidden" name="status" value={s} /><SubmitButton className={s === "done" ? "btn-primary" : s === "cancelled" ? "btn-ghost text-red-700" : "btn-secondary"} pendingText="…">{s === "done" ? "Mark done" : PROJECT_STATUS_LABELS[s]}</SubmitButton></form>
      ))}>
      {p.status === "done" && renewals.length > 0 && <div className="mb-3"><Notice tone="green">Renewal tracked: {renewals.map((r) => <Link key={r.id} className="underline" href="/crm/renewals">{r.label} · expires {fmtDate(r.expiresAt)}</Link>)}</Notice></div>}
      {cost.pendingIDR > 0 && <div className="mb-3"><Notice tone="amber">{fmtMoney(cost.pendingIDR, "IDR")} of vendor costs await approval by the project owner ({l.user(p.ownerUserId)}).</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-4">
          <Card title="Summary">
            <DL items={[
              ["Company", p.companyId ? <Link className="text-brand-600 underline" href={`/crm/companies/${p.companyId}`}>{l.company(p.companyId)}</Link> : "—"],
              ["Contact", p.contactId ? <Link className="text-brand-600 underline" href={`/crm/contacts/${p.contactId}`}>{l.contact(p.contactId)}</Link> : "—"],
              ["Subject", p.subject ? <span>{p.subject.name}{p.subject.nationality ? ` (${p.subject.nationality})` : ""}{p.subject.passportNumber ? <span className="block text-xs text-ink-500">Passport {p.subject.passportNumber}{p.subject.dateOfBirth ? ` · born ${fmtDate(p.subject.dateOfBirth)}` : ""}</span> : null}</span> : "—"],
              ["Deal", p.dealId ? <Link className="text-brand-600 underline" href={`/crm/deals/${p.dealId}`}>open deal</Link> : "—"],
              ["Quote", p.quoteId ? <Link className="text-brand-600 underline" href={`/crm/quotes/${p.quoteId}`}>open quote</Link> : "—"],
              ["Owner", l.user(p.ownerUserId)], ["Assignee", l.user(p.assigneeUserId)],
              ["Fee", <Money key="f" amount={p.feeAmount} currency={p.feeCurrency} />], ["Invoice", p.invoiceRef ?? "—"],
              ["Started", fmtDate(p.startedAt)], ["Due", fmtDate(p.dueDate)], ["Submitted", fmtDate(p.submittedAt)], ["Completed", fmtDate(p.completedAt)],
              ["Expires", p.expiresAt ? fmtDate(p.expiresAt) : service?.renewalMonths ? <span className="text-ink-500">{service.renewalMonths} months after completion</span> : "—"],
              ["Drive", p.driveFolderUrl ? <a className="text-brand-600 underline" href={p.driveFolderUrl} target="_blank" rel="noreferrer">Open folder</a> : "—"],
            ]} />
            {p.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm">{p.notes}</p>}
          </Card>
          <Card title="Cost of sales & margin">
            <DL items={[
              ["Fee", <Money key="a" amount={p.feeAmount} currency={p.feeCurrency} />],
              ["Costs (IDR)", <Money key="b" amount={cost.costIDR} />],
              ["Approved", <Money key="c" amount={cost.approvedIDR} />], ["Pending approval", <Money key="d" amount={cost.pendingIDR} />],
              ...(cost.costUSD ? [["Costs (USD part)", <Money key="e" amount={cost.costUSD} currency="USD" />] as [string, React.ReactNode]] : []),
              ["Margin", cost.marginIDR === null ? <span className="text-ink-500">fee not in IDR</span> : <span className={cost.marginIDR < 0 ? "text-red-700" : "text-green-800"}><Money amount={cost.marginIDR} /> ({cost.marginPct}%)</span>],
            ]} />
          </Card>
          <TaskPanel tasks={tasks} related={{ type: "project", id }} backPath={path} l={l} meId={me.id} />
        </div>
        <div className="space-y-4">
          <Card title={`Checklist · ${progress.pct}%`}>
            <div className="mb-2 h-1.5 w-full overflow-hidden rounded bg-slate-100"><div className="h-full bg-brand-600" style={{ width: `${progress.pct}%` }} /></div>
            <ul className="divide-y divide-slate-100 text-sm">
              {p.checklist.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-1.5">
                  {write ? <form action={toggleChecklist.bind(null, id, c.id)}><button className={`h-4 w-4 rounded border ${c.done ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white"} text-[10px] leading-none`} aria-label="toggle">{c.done ? "✓" : ""}</button></form> : <span className={`h-4 w-4 rounded border ${c.done ? "bg-brand-600" : "bg-white"}`} />}
                  <span className={`flex-1 ${c.done ? "text-ink-500 line-through" : ""}`}>{c.label}</span>
                  {c.dueDate && !c.done && <Badge tone="amber">{fmtDate(c.dueDate)}</Badge>}
                  {c.done && c.doneAt && <span className="text-xs text-ink-500">{fmtDateTime(c.doneAt)}{c.doneBy ? ` · ${l.user(c.doneBy)}` : ""}</span>}
                  {write && <ConfirmForm action={removeChecklistItem.bind(null, id, c.id)} message="Remove this checklist item?"><button className="text-xs text-ink-500 hover:text-red-600">×</button></ConfirmForm>}
                </li>
              ))}
            </ul>
            {write && <form action={addChecklistItem.bind(null, id)} className="mt-3 flex gap-2"><input name="label" required className="input !py-1.5" placeholder="Add a step…" /><input name="dueDate" type="date" className="input !w-40 !py-1.5" /><SubmitButton className="btn-secondary !py-1.5" pendingText="…">Add</SubmitButton></form>}
          </Card>
          <Card title="Cost of sales (vendor costs)">
            {p.costOfSales.length === 0 ? <p className="text-sm text-ink-500">No cost lines yet. Add government fees, notary, Kanim or BKPM agent costs as they are engaged; the project owner approves them.</p> : (
              <div className="overflow-x-auto"><table className="table">
                <thead><tr><th>Description</th><th>Vendor</th><th className="num">IDR</th><th className="num">USD</th><th>Status</th>{write && <th></th>}</tr></thead>
                <tbody>{p.costOfSales.map((c) => (
                  <tr key={c.id}>
                    <td>{c.description}{c.note && <span className="block text-xs text-ink-500">{c.note}</span>}</td>
                    <td className="text-xs">{c.vendorId ? <Link href={`/crm/vendors/${c.vendorId}`} className="hover:underline">{c.vendorName}</Link> : c.vendorName ?? "—"}</td>
                    <td className="num"><Money amount={c.amountIDR} /></td>
                    <td className="num text-xs">{c.amountUSD ? <Money amount={c.amountUSD} currency="USD" /> : "—"}</td>
                    <td className="text-xs">{c.approved ? <Badge tone="green">approved</Badge> : <Badge tone="amber">pending</Badge>}{c.paidAt && <Badge tone="blue" className="ml-1">paid {fmtDate(c.paidAt)}</Badge>}{c.approved && c.approvedByUserId && <span className="block text-ink-500">{l.user(c.approvedByUserId)}</span>}</td>
                    {write && <td className="whitespace-nowrap text-xs">
                      {!c.approved && canApprove && <form action={approveCostLine.bind(null, id, c.id)} className="inline"><button className="btn-secondary !px-2 !py-0.5 text-xs">Approve</button></form>}
                      {c.approved && !c.paidAt && <form action={markCostPaid.bind(null, id, c.id)} className="ml-1 inline"><button className="text-brand-600 underline">Paid</button></form>}
                      <ConfirmForm action={removeCostLine.bind(null, id, c.id)} message="Remove this cost line?" className="ml-1 inline"><button className="text-ink-500 hover:text-red-600">×</button></ConfirmForm>
                    </td>}
                  </tr>
                ))}</tbody>
                <tfoot><tr className="font-semibold"><td colSpan={2} className="pt-2 text-right">Total</td><td className="num pt-2"><Money amount={cost.costIDR} /></td><td className="num pt-2 text-xs">{cost.costUSD ? <Money amount={cost.costUSD} currency="USD" /> : ""}</td><td colSpan={2}></td></tr></tfoot>
              </table></div>
            )}
            {write && (
              <details className="mt-3"><summary className="cursor-pointer text-sm text-brand-600 underline">Add cost line</summary>
                <form action={addCostLine.bind(null, id)} className="mt-2 grid gap-2 md:grid-cols-4">
                  <Field label="Description" className="md:col-span-2"><input name="description" required className="input" placeholder="PNBP Investor KITAS 2 years" /></Field>
                  <Field label="Vendor"><Select name="vendorId" defaultValue="" options={[{ value: "", label: "— free text —" }, ...vendors.map((v) => ({ value: v.id, label: `${v.name} (${v.category})` }))]} /></Field>
                  <Field label="or vendor name"><input name="vendorName" className="input" placeholder="Own arrangement" /></Field>
                  <Field label="Amount IDR"><input name="amountIDR" type="number" min={0} required className="input" /></Field>
                  <Field label="Amount USD (if paid in USD)"><input name="amountUSD" type="number" min={0} step="0.01" className="input" /></Field>
                  <Field label="Note" className="md:col-span-2"><input name="note" className="input" /></Field>
                  <div className="md:col-span-4"><SubmitButton className="btn-secondary">Add cost</SubmitButton></div>
                </form>
              </details>
            )}
          </Card>
          {write && (
            <details className="card"><summary className="cursor-pointer text-sm font-semibold text-ink-700">Edit project details</summary>
              <div className="mt-3"><ProjectForm project={p} services={services} l={l} action={updateProject.bind(null, id)} deals={deals.map((d) => ({ id: d.id, title: d.title }))} quotes={quotes.map((q) => ({ id: q.id, number: q.number, title: q.title }))} /></div>
            </details>
          )}
          <Timeline activities={activities} refs={{ projectId: id, dealId: p.dealId, companyId: p.companyId, contactId: p.contactId }} backPath={path} canWrite={write} />
        </div>
      </div>
    </Page>
  );
}
