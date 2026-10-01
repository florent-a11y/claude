import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchesSearch } from "@/lib/crm";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS } from "@/lib/types";
import { Page, Chips, EmptyState, withParams } from "@/components/ui";
import { AutoSubmitInput } from "@/components/client";
import { lookups } from "../_lib/server";
import { ProjectsTable } from "../_components/tables";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

type SP = { status?: string; category?: string; assignee?: string; q?: string };

export default async function Projects({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const [l, all] = await Promise.all([lookups(), db.list("projects", { orderBy: "createdAt", desc: true })]);
  const status = sp.status ?? "open";
  const counts = Object.fromEntries(PROJECT_STATUSES.map((s) => [s, all.filter((p) => p.status === s).length]));
  const openCount = all.filter((p) => p.status !== "done" && p.status !== "cancelled").length;
  const rows = all.filter((p) =>
    (status === "all" || (status === "open" ? p.status !== "done" && p.status !== "cancelled" : p.status === status)) &&
    (!sp.category || p.category === sp.category) &&
    (!sp.assignee || p.assigneeUserId === sp.assignee || (!p.assigneeUserId && p.ownerUserId === sp.assignee)) &&
    matchesSearch([p.number, p.title, p.subject?.name, l.company(p.companyId), l.contact(p.contactId), p.invoiceRef], sp.q),
  ).sort((a, b) => (a.dueDate ?? "9999") < (b.dueDate ?? "9999") ? -1 : 1);
  const base = "/crm/projects";
  return (
    <Page title="Projects" subtitle="One project per matter: visa, incorporation, licence, due diligence… with its checklist and cost of sales." actions={can(me, "crm:write") && <Link href="/crm/projects/new" className="btn-primary">New project</Link>}>
      <div className="mb-3 space-y-2 no-print">
        <Chips items={[{ href: withParams(base, sp, { status: undefined }), label: `Open (${openCount})`, active: status === "open" }, ...PROJECT_STATUSES.map((s) => ({ href: withParams(base, sp, { status: s }), label: `${PROJECT_STATUS_LABELS[s]} (${counts[s]})`, active: status === s })), { href: withParams(base, sp, { status: "all" }), label: `All (${all.length})`, active: status === "all" }]} />
        <Chips items={[{ href: withParams(base, sp, { category: undefined }), label: "All categories", active: !sp.category }, ...SERVICE_CATEGORIES.map((c) => ({ href: withParams(base, sp, { category: c }), label: SERVICE_CATEGORY_LABELS[c].split(" ")[0], active: sp.category === c }))]} />
        <div className="flex flex-wrap items-center gap-2">
          <Chips items={[{ href: withParams(base, sp, { assignee: undefined }), label: "Everyone", active: !sp.assignee }, { href: withParams(base, sp, { assignee: me.id }), label: "Mine", active: sp.assignee === me.id }, ...l.activeUsers.filter((u) => u.id !== me.id).map((u) => ({ href: withParams(base, sp, { assignee: u.id }), label: u.name.split(" ")[0], active: sp.assignee === u.id }))]} />
          <form className="flex items-center gap-2">
            {Object.entries(sp).filter(([k, v]) => k !== "q" && v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <AutoSubmitInput name="q" defaultValue={sp.q} placeholder="Search number, title, person, client…" className="input !w-64 !py-1.5" />
          </form>
        </div>
      </div>
      {rows.length === 0 ? <EmptyState title="No projects match" action={can(me, "crm:write") && <Link href="/crm/projects/new" className="btn-primary">New project</Link>} /> : <div className="card !p-3"><ProjectsTable projects={rows} l={l} /></div>}
    </Page>
  );
}
