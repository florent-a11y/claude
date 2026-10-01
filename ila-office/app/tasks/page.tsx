import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isOverdue, sortTasks } from "@/lib/crm";
import { fmtDate, todayISO } from "@/lib/dates";
import { fullName } from "@/lib/util";
import type { TaskItem } from "@/lib/types";
import { Page, Card, Badge, Chips, Field, Select, EmptyState, withParams } from "@/components/ui";
import { SubmitButton, ConfirmForm } from "@/components/client";
import { lookups } from "@/app/crm/_lib/server";
import { createTask, deleteTask, toggleTask } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "My tasks" };

export default async function Tasks({ searchParams }: { searchParams: Promise<{ all?: string; done?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const [l, all, projects, deals, quotes] = await Promise.all([lookups(), db.list("tasks"), db.list("projects", { where: (p) => p.status !== "done" && p.status !== "cancelled" }), db.list("deals", { where: (d) => d.stage !== "closed_won" && d.stage !== "closed_lost" }), db.list("quotes", { where: (q) => q.status === "draft" || q.status === "sent" })]);
  const today = todayISO();
  const mine = sp.all ? all : all.filter((t) => t.assigneeUserId === me.id || (!t.assigneeUserId));
  const rows = sortTasks(sp.done ? mine : mine.filter((t) => !t.done), today);
  const overdue = rows.filter((t) => isOverdue(t, today)).length;
  const base = "/tasks";
  const relatedLabel = (r: TaskItem["related"]) => {
    if (!r) return null;
    const href = { contact: `/crm/contacts/${r.id}`, company: `/crm/companies/${r.id}`, deal: `/crm/deals/${r.id}`, project: `/crm/projects/${r.id}`, quote: `/crm/quotes/${r.id}`, entity: `/books/${r.id}`, obligation: `/tax` }[r.type];
    const name = r.type === "contact" ? l.contact(r.id) : r.type === "company" ? l.company(r.id) : r.type === "deal" ? deals.find((d) => d.id === r.id)?.title ?? "deal" : r.type === "project" ? projects.find((p) => p.id === r.id)?.number ?? "project" : r.type === "quote" ? quotes.find((q) => q.id === r.id)?.number ?? "quote" : r.type;
    return <Link href={href} className="text-xs text-brand-600 underline">{name}</Link>;
  };
  const relatedOptions = [
    { value: "", label: "— none —" },
    ...projects.map((p) => ({ value: `project:${p.id}`, label: `Project ${p.number} ${p.title}` })),
    ...deals.map((d) => ({ value: `deal:${d.id}`, label: `Deal: ${d.title}` })),
    ...quotes.map((q) => ({ value: `quote:${q.id}`, label: `Quote ${q.number}` })),
    ...[...l.companies.values()].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: `company:${c.id}`, label: `Company: ${c.name}` })),
    ...[...l.contacts.values()].sort((a, b) => fullName(a).localeCompare(fullName(b))).map((c) => ({ value: `contact:${c.id}`, label: `Contact: ${fullName(c)}` })),
  ];
  return (
    <Page title={sp.all ? "All tasks" : "My tasks"} subtitle={overdue ? <span className="text-red-700">{overdue} overdue</span> : "Nothing overdue"}>
      <div className="mb-3 flex flex-wrap items-center gap-2 no-print">
        <Chips items={[{ href: withParams(base, sp, { all: undefined }), label: "Mine", active: !sp.all }, { href: withParams(base, sp, { all: "1" }), label: "Everyone", active: !!sp.all }]} />
        <Chips items={[{ href: withParams(base, sp, { done: undefined }), label: "Open", active: !sp.done }, { href: withParams(base, sp, { done: "1" }), label: "Including done", active: !!sp.done }]} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title={`${rows.length} task${rows.length === 1 ? "" : "s"}`}>
          {rows.length === 0 ? <EmptyState title="All clear" hint="Add a task on the right, or from any contact, company, deal or project page." /> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {rows.map((t) => {
                const late = isOverdue(t, today);
                return (
                  <li key={t.id} className="flex items-center gap-3 py-2">
                    <form action={toggleTask.bind(null, t.id, base)}><button className={`h-4 w-4 rounded border ${t.done ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white"} text-[10px] leading-none`} aria-label="toggle">{t.done ? "✓" : ""}</button></form>
                    <div className="min-w-0 flex-1">
                      <p className={t.done ? "text-ink-500 line-through" : "font-medium"}>{t.title}</p>
                      <p className="flex flex-wrap gap-2 text-xs text-ink-500">{relatedLabel(t.related)}{sp.all && <span>{l.user(t.assigneeUserId)}</span>}{t.done && t.doneAt && <span>done {fmtDate(t.doneAt.slice(0, 10))}</span>}</p>
                    </div>
                    {t.dueDate && <Badge tone={t.done ? "slate" : late ? "red" : t.dueDate === today ? "amber" : "slate"}>{late ? "overdue · " : ""}{fmtDate(t.dueDate)}</Badge>}
                    <ConfirmForm action={deleteTask.bind(null, t.id, base)} message="Delete this task?"><button className="text-xs text-ink-500 hover:text-red-600">×</button></ConfirmForm>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="New task">
          <form action={createTask.bind(null, base)} className="space-y-3">
            <Field label="Title"><input name="title" required className="input" placeholder="Chase passport copy from client" /></Field>
            <Field label="Due date"><input name="dueDate" type="date" className="input" /></Field>
            <Field label="Assignee"><Select name="assigneeUserId" defaultValue={me.id} options={l.activeUsers.map((u) => ({ value: u.id, label: u.name }))} /></Field>
            <Field label="Related record"><Select name="related" defaultValue="" options={relatedOptions} /></Field>
            <SubmitButton>Add task</SubmitButton>
          </form>
        </Card>
      </div>
    </Page>
  );
}
