import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountBalances, naturalBalance } from "@/lib/balances";
import { postedEntries } from "@/lib/posting";
import { addDays, daysBetween, fmtDate, fmtDateTime, todayISO } from "@/lib/dates";
import { fmtMoney, toIDR } from "@/lib/money";
import { byId } from "@/lib/util";
import { DEAL_STAGE_PROBABILITY, OBLIGATION_STATUS_LABELS, PROJECT_STATUS_LABELS, RENEWAL_KIND_LABELS, type ObligationStatus, type TaskItem } from "@/lib/types";
import { Page, Card, Stat, Badge, EmptyState, statusTone } from "@/components/ui";

export const dynamic = "force-dynamic";

const RENEWAL_WINDOW_DAYS = 60;

/** Cross-module home: what needs attention today for the signed-in user, ILA's own cash and receivables, and shortcuts. */
export default async function Home() {
  const user = await requireUser();
  const today = todayISO();
  const month = today.slice(0, 7);
  const horizon = addDays(today, RENEWAL_WINDOW_DAYS);

  const [entities, companies, deals, projects, renewals, obligations, myTasks, activities] = await Promise.all([
    db.list("entities", { where: (e) => e.status !== "closed" }),
    db.list("companies"),
    db.list("deals", { where: (d) => d.stage !== "closed_won" && d.stage !== "closed_lost" }),
    db.list("projects", { where: (p) => p.status !== "done" && p.status !== "cancelled" }),
    db.list("renewals", { where: (r) => (r.status === "upcoming" || r.status === "reminded" || r.status === "quoted") && r.expiresAt <= horizon, orderBy: "expiresAt" }),
    db.list("tax_obligations", { where: (o) => o.status !== "reported" && o.status !== "nil" }),
    db.list("tasks", { where: (t) => !t.done && t.assigneeUserId === user.id }),
    db.list("activities", { orderBy: "at", desc: true, limit: 8 }),
  ]);
  const own = entities.find((e) => e.isOwn);
  const [ownInvoices, ownAccounts, ownEntries] = own
    ? await Promise.all([
        db.list("invoices", { where: (i) => i.entityId === own.id && (i.status === "sent" || i.status === "partial") }),
        db.list("accounts", { where: (a) => a.entityId === own.id && a.active && (a.subtype === "bank" || a.subtype === "cash") }),
        postedEntries(own.id),
      ])
    : [[], [], []];

  const companyById = byId(companies);
  const entityById = byId(entities);
  const companyName = (id?: string) => (id ? companyById.get(id)?.name : undefined);

  // Pipeline: weighted by stage probability, per currency.
  const weighted = new Map<string, number>();
  for (const d of deals) weighted.set(d.currency, (weighted.get(d.currency) ?? 0) + d.amount * DEAL_STAGE_PROBABILITY[d.stage]);
  const weightedIDR = weighted.get("IDR") ?? 0;
  const weightedOther = [...weighted.entries()].filter(([c]) => c !== "IDR").map(([c, v]) => fmtMoney(v, c)).join(" + ");

  const waitingClient = projects.filter((p) => p.status === "waiting_client").sort((a, b) => (a.updatedAt ?? a.createdAt) < (b.updatedAt ?? b.createdAt) ? 1 : -1);

  // Obligations: due this month by status; overdue across all entities.
  const dueThisMonth = obligations.filter((o) => o.reportDue.slice(0, 7) === month || o.period === month);
  const byStatus = new Map<ObligationStatus, number>();
  for (const o of dueThisMonth) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
  const overdue = obligations.filter((o) => o.reportDue < today).sort((a, b) => a.reportDue.localeCompare(b.reportDue));

  // ILA's own receivables and cash.
  const arIDR = ownInvoices.reduce((s, i) => s + toIDR(i.total - i.amountPaid, i.currency, i.fxRate), 0);
  const arOverdue = ownInvoices.filter((i) => i.dueDate < today).length;
  const balances = accountBalances(ownEntries);
  const cashLines = ownAccounts.map((a) => ({ account: a, balance: naturalBalance(a, balances.get(a.id)) })).filter((x) => x.balance !== 0);
  const cashIDR = cashLines.reduce((s, x) => s + x.balance, 0);

  const tasks = [...myTasks].sort((a, b) => (a.dueDate ?? "9999") < (b.dueDate ?? "9999") ? -1 : 1).slice(0, 10);

  return (
    <Page title={`Good day, ${user.name.split(" ")[0]}`} subtitle={<span>{fmtDate(today)} · {entities.length} entities · {deals.length} open deals · {projects.length} open projects</span>}
      actions={<><Link href="/crm/deals/new" className="btn-secondary">New deal</Link><Link href="/crm/quotes/new" className="btn-secondary">New quote</Link><Link href="/crm/projects/new" className="btn-primary">New project</Link></>}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Weighted pipeline" value={fmtMoney(weightedIDR, "IDR")} hint={<Link href="/crm/deals" className="hover:underline">{deals.length} open deals{weightedOther ? ` · + ${weightedOther}` : ""}</Link>} />
        <Stat label="Open projects" value={projects.length} hint={<Link href="/crm/projects" className="hover:underline">{waitingClient.length} waiting on client · {projects.filter((p) => p.status === "waiting_payment").length} waiting payment</Link>} />
        <Stat label={`Renewals ≤ ${RENEWAL_WINDOW_DAYS} days`} value={renewals.length} tone={renewals.some((r) => r.expiresAt < today) ? "text-red-700" : ""} hint={<Link href="/crm/renewals" className="hover:underline">{renewals.filter((r) => r.expiresAt < today).length} already expired</Link>} />
        <Stat label="Tax obligations this month" value={dueThisMonth.length} tone={overdue.length ? "text-red-700" : ""} hint={<Link href="/tax" className="hover:underline">{[...byStatus.entries()].map(([s, n]) => `${n} ${OBLIGATION_STATUS_LABELS[s].toLowerCase()}`).join(" · ") || "nothing due"}{overdue.length ? ` · ${overdue.length} overdue` : ""}</Link>} />
        <Stat label="ILA receivables" value={fmtMoney(arIDR, "IDR")} hint={own ? <Link href={`/books/${own.id}/invoices`} className="hover:underline">{ownInvoices.length} open invoices · {arOverdue} overdue</Link> : "No own entity yet"} />
        <Stat label="ILA cash & bank" value={fmtMoney(cashIDR, "IDR")} tone={cashIDR < 0 ? "text-red-700" : ""} hint={own ? <Link href={`/books/${own.id}`} className="hover:underline">{cashLines.length ? cashLines.map((x) => `${x.account.name} ${fmtMoney(x.balance, "IDR")}`).join(" · ") : "no postings yet"}</Link> : "No own entity yet"} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="My open tasks" actions={<Link href="/tasks" className="text-xs text-brand-600 underline">All tasks</Link>}>
          {tasks.length === 0 ? <EmptyState title="Nothing assigned to you" hint="Tasks created on projects, deals and obligations show up here." /> : (
            <table className="table">
              <thead><tr><th>Task</th><th>Due</th><th>Related</th></tr></thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td className="whitespace-nowrap text-xs">{t.dueDate ? <span className={t.dueDate < today ? "font-semibold text-red-700" : t.dueDate === today ? "font-semibold text-amber-800" : ""}>{fmtDate(t.dueDate)}</span> : "—"}</td>
                    <td className="text-xs">{relatedLink(t.related, { companyName })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Projects waiting on the client" actions={<Link href="/crm/projects?status=waiting_client" className="text-xs text-brand-600 underline">All projects</Link>}>
          {waitingClient.length === 0 ? <EmptyState title="No project is blocked on a client" /> : (
            <table className="table">
              <thead><tr><th>Project</th><th>Client</th><th>Checklist</th><th>Due</th></tr></thead>
              <tbody>
                {waitingClient.slice(0, 8).map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/crm/projects/${p.id}`} className="font-medium hover:underline">{p.title}</Link><span className="ml-1 text-xs text-ink-500">{p.number}</span></td>
                    <td className="text-xs">{p.companyId ? <Link href={`/crm/companies/${p.companyId}`} className="hover:underline">{companyName(p.companyId)}</Link> : p.subject?.name ?? "—"}</td>
                    <td className="text-xs">{p.checklist.filter((c) => c.done).length}/{p.checklist.length}</td>
                    <td className="whitespace-nowrap text-xs">{p.dueDate ? <span className={p.dueDate < today ? "text-red-700" : ""}>{fmtDate(p.dueDate)}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title={`Renewals due within ${RENEWAL_WINDOW_DAYS} days`} actions={<Link href="/crm/renewals" className="text-xs text-brand-600 underline">Renewal tracker</Link>}>
          {renewals.length === 0 ? <EmptyState title="No KITAS, address or licence expires soon" /> : (
            <table className="table">
              <thead><tr><th>Renewal</th><th>Client</th><th>Expires</th><th>Status</th></tr></thead>
              <tbody>
                {renewals.slice(0, 8).map((r) => {
                  const days = daysBetween(today, r.expiresAt);
                  return (
                    <tr key={r.id}>
                      <td><Link href={r.projectId ? `/crm/projects/${r.projectId}` : "/crm/renewals"} className="font-medium hover:underline">{r.label}</Link><span className="ml-1 text-xs text-ink-500">{RENEWAL_KIND_LABELS[r.kind]}</span></td>
                      <td className="text-xs">{r.companyId ? <Link href={`/crm/companies/${r.companyId}`} className="hover:underline">{companyName(r.companyId)}</Link> : "—"}</td>
                      <td className="whitespace-nowrap text-xs"><span className={days < 0 ? "font-semibold text-red-700" : days <= 14 ? "font-semibold text-amber-800" : ""}>{fmtDate(r.expiresAt)}</span><span className="ml-1 text-ink-500">({days < 0 ? `${-days} d ago` : `in ${days} d`})</span></td>
                      <td><Badge tone={days < 0 ? "red" : statusTone(r.status)}>{days < 0 ? "expired" : r.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Overdue tax obligations" actions={<Link href="/tax" className="text-xs text-brand-600 underline">All clients calendar</Link>}>
          {overdue.length === 0 ? <EmptyState title="Nothing is past its reporting deadline" /> : (
            <table className="table">
              <thead><tr><th>Entity</th><th>Obligation</th><th>Report due</th><th>Status</th></tr></thead>
              <tbody>
                {overdue.slice(0, 10).map((o) => (
                  <tr key={o.id}>
                    <td className="text-xs"><Link href={`/tax/${o.entityId}`} className="font-medium hover:underline">{entityById.get(o.entityId)?.name ?? o.entityId}</Link></td>
                    <td className="text-xs">{o.label}<span className="ml-1 text-ink-500">{o.period}</span></td>
                    <td className="whitespace-nowrap text-xs text-red-700">{fmtDate(o.reportDue)} ({daysBetween(o.reportDue, today)} d)</td>
                    <td><Badge tone={statusTone(o.status)}>{OBLIGATION_STATUS_LABELS[o.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Recent activity">
          {activities.length === 0 ? <EmptyState title="No activity logged yet" /> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {activities.map((a) => (
                <li key={a.id} className="flex gap-3 py-2">
                  <span className="w-28 shrink-0 text-xs text-ink-500">{fmtDateTime(a.at)}</span>
                  <span className="min-w-0 flex-1">
                    <Badge tone="slate" className="mr-1">{a.kind}</Badge>
                    {activityLink(a)}
                    {a.byName && <span className="ml-1 text-xs text-ink-500">· {a.byName}</span>}
                    {a.body && <span className="block truncate text-xs text-ink-500">{a.body}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Quick links">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {[
              ["/crm/contacts/new", "New contact"], ["/crm/companies/new", "New company"], ["/crm/deals", "Deal pipeline"], ["/crm/quotes", "Quotes"],
              ["/crm/projects", "Projects"], ["/crm/renewals", "Renewals"], ["/crm/services", "Service catalogue"], ["/crm/vendors", "Vendors"],
              ...(own ? [[`/books/${own.id}`, "ILA books"], [`/books/${own.id}/invoices`, "ILA invoices"], [`/tax/${own.id}`, "ILA tax"], [`/payroll/${own.id}`, "ILA payroll"]] : []),
              ["/tax", "All clients calendar"], ["/settings/entities", "Entities"], ["/settings/import", "Import data"], ["/settings/users", "Users"],
            ].map(([href, label]) => <Link key={href} href={href} className="rounded-lg border border-slate-200 px-3 py-2 hover:bg-brand-50">{label}</Link>)}
          </div>
          {entities.filter((e) => !e.isOwn).length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Client books</p>
              <div className="flex flex-wrap gap-1 text-xs">
                {entities.filter((e) => !e.isOwn).slice(0, 24).map((e) => <span key={e.id} className="rounded-full bg-slate-100 px-2 py-0.5"><Link href={`/books/${e.id}`} className="hover:underline">{e.name}</Link> · <Link href={`/tax/${e.id}`} className="hover:underline">tax</Link></span>)}
              </div>
            </div>
          )}
          <p className="mt-3 text-xs text-ink-500">Project statuses: {Object.values(PROJECT_STATUS_LABELS).slice(0, 5).join(" → ")}.</p>
        </Card>
      </div>
    </Page>
  );
}

function relatedLink(related: TaskItem["related"], ctx: { companyName: (id?: string) => string | undefined }) {
  if (!related) return "—";
  const { type, id } = related;
  const href = type === "project" ? `/crm/projects/${id}` : type === "deal" ? `/crm/deals/${id}` : type === "quote" ? `/crm/quotes/${id}` : type === "contact" ? `/crm/contacts/${id}`
    : type === "company" ? `/crm/companies/${id}` : type === "entity" ? `/books/${id}` : `/tax/${id.split(":")[0]}`;
  const label = type === "company" ? ctx.companyName(id) ?? "company" : type === "obligation" ? `obligation ${id.split(":").slice(1).join(" ")}` : type;
  return <Link href={href} className="text-brand-600 hover:underline">{label}</Link>;
}

function activityLink(a: { subject: string; projectId?: string; dealId?: string; companyId?: string; contactId?: string; quoteId?: string; entityId?: string }) {
  const href = a.projectId ? `/crm/projects/${a.projectId}` : a.dealId ? `/crm/deals/${a.dealId}` : a.quoteId ? `/crm/quotes/${a.quoteId}` : a.companyId ? `/crm/companies/${a.companyId}`
    : a.contactId ? `/crm/contacts/${a.contactId}` : a.entityId ? `/books/${a.entityId}` : undefined;
  return href ? <Link href={href} className="hover:underline">{a.subject}</Link> : <span>{a.subject}</span>;
}

