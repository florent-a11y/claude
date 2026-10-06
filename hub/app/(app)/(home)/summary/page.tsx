import Link from "next/link";
import { AlertTriangle, Briefcase, Building2, CheckSquare, Plus, ShieldCheck } from "lucide-react";
import { isInternal, requireUser } from "@/lib/auth";
import { countClients } from "@/lib/queries/clients";
import { countMyOpenTasks, listMyTasks } from "@/lib/queries/tasks";
import { countApprovalsForMe, listApprovalsForMe } from "@/lib/queries/approvals";
import { listRecentActivity } from "@/lib/queries/messages";
import { countWorkspaces, listStaleWorkspaces, listWorkspaces } from "@/lib/queries/workspaces";
import { WorkspaceCard } from "@/components/WorkspaceCard";
import { TaskRow } from "@/components/TaskRow";
import { ActivityItem } from "@/components/ActivityItem";
import { SectionTitle } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { dueLabel, timeAgo } from "@/lib/format";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Stat({ icon: Icon, label, value, href, tone = "text-indigo-600 bg-indigo-50", sub }: {
  icon: typeof Briefcase; label: string; value: number | string; href: string; tone?: string; sub?: string;
}) {
  return (
    <Link href={href} className="card flex items-center gap-3 p-4 transition hover:border-indigo-300">
      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}><Icon className="h-5 w-5" /></span>
      <span>
        <span className="block text-2xl font-semibold leading-tight text-slate-900">{value}</span>
        <span className="block text-xs text-slate-500">{label}{sub ? ` · ${sub}` : ""}</span>
      </span>
    </Link>
  );
}

export const metadata = { title: "Summary" };

export default async function SummaryPage() {
  const user = await requireUser();
  const myTasks = countMyOpenTasks(user.id);
  const tasks = listMyTasks(user).slice(0, 8);
  const approvals = listApprovalsForMe(user.id).slice(0, 5);
  const activity = listRecentActivity(user, 12);

  if (!isInternal(user)) {
    const workspaces = listWorkspaces(user, { status: "all" });
    return (
      <div className="h-[calc(100vh-7.5rem)] overflow-y-auto pr-1">
        <h1 className="text-xl font-semibold text-slate-900">{greeting()}, {user.name.split(" ")[0]}</h1>
        <p className="mb-6 text-sm text-slate-500">Here is what is happening on your projects.</p>
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <Stat icon={Briefcase} label="Your workspaces" value={workspaces.length} href="/workspaces" />
          <Stat icon={CheckSquare} label="Tasks for you" value={myTasks.open} href="/tasks" tone="text-sky-600 bg-sky-50" sub={myTasks.overdue ? `${myTasks.overdue} overdue` : undefined} />
          <Stat icon={ShieldCheck} label="Waiting for your approval" value={approvals.length} href="/approvals" tone="text-amber-600 bg-amber-50" />
        </div>
        <SectionTitle>Your workspaces</SectionTitle>
        {workspaces.length ? (
          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{workspaces.map((ws) => <WorkspaceCard key={ws.id} ws={ws} />)}</div>
        ) : (
          <EmptyState icon={Briefcase} title="No workspaces yet" hint="Your project team will add you to a workspace soon." />
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <SectionTitle aside={<Link href="/tasks" className="text-xs text-indigo-600 hover:underline">All tasks</Link>}>Tasks for you</SectionTitle>
            <div className="card divide-y divide-slate-100">
              {tasks.length ? <ul className="divide-y divide-slate-100">{tasks.map((t) => <TaskRow key={t.id} task={t} showWorkspace />)}</ul> : <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing assigned to you.</p>}
            </div>
          </section>
          <section>
            <SectionTitle>Recent activity</SectionTitle>
            <div className="card">
              {activity.length ? <ul className="divide-y divide-slate-100">{activity.map((m) => <ActivityItem key={m.id} m={m} />)}</ul> : <p className="px-4 py-6 text-center text-sm text-slate-500">No activity yet.</p>}
            </div>
          </section>
        </div>
      </div>
    );
  }

  const stale = listStaleWorkspaces(user, 5);
  return (
    <div className="h-[calc(100vh-7.5rem)] overflow-y-auto pr-1">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{greeting()}, {user.name.split(" ")[0]}</h1>
          <p className="text-sm text-slate-500">Your projects, follow-ups and what needs you today.</p>
        </div>
        <Link href="/workspaces/new" className="btn btn-primary"><Plus className="h-4 w-4" /> New workspace</Link>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Briefcase} label="Active workspaces" value={countWorkspaces("active")} href="/workspaces" />
        <Stat icon={CheckSquare} label="My open tasks" value={myTasks.open} href="/tasks" tone="text-sky-600 bg-sky-50" sub={myTasks.overdue ? `${myTasks.overdue} overdue` : undefined} />
        <Stat icon={ShieldCheck} label="Waiting for my approval" value={countApprovalsForMe(user.id)} href="/approvals" tone="text-amber-600 bg-amber-50" />
        <Stat icon={Building2} label="Clients" value={countClients()} href="/clients" tone="text-violet-600 bg-violet-50" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <SectionTitle aside={<Link href="/workspaces" className="text-xs text-indigo-600 hover:underline">All workspaces</Link>}>
              <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-500" /> Needs a follow-up</span>
            </SectionTitle>
            {stale.length ? (
              <div className="card divide-y divide-slate-100">
                {stale.map((ws) => (
                  <Link key={ws.id} href={`/workspaces/${ws.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ws.client_color ?? "#94a3b8" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{ws.name}</span>
                      <span className="block truncate text-xs text-slate-500">{ws.client_name ?? "No client"} · {ws.open_tasks} open tasks</span>
                    </span>
                    <span className="text-xs text-amber-700">Quiet since {timeAgo(ws.last_activity_at)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="card px-4 py-5 text-sm text-slate-500">Every active workspace had activity in the last 5 days. Nice.</p>
            )}
          </section>

          <section>
            <SectionTitle aside={<Link href="/tasks" className="text-xs text-indigo-600 hover:underline">All tasks</Link>}>My tasks</SectionTitle>
            <div className="card">
              {tasks.length ? <ul className="divide-y divide-slate-100">{tasks.map((t) => <TaskRow key={t.id} task={t} showWorkspace />)}</ul> : <p className="px-4 py-6 text-center text-sm text-slate-500">No open tasks assigned to you.</p>}
            </div>
          </section>

          {approvals.length > 0 && (
            <section>
              <SectionTitle aside={<Link href="/approvals" className="text-xs text-indigo-600 hover:underline">All approvals</Link>}>Waiting for my approval</SectionTitle>
              <div className="card divide-y divide-slate-100">
                {approvals.map((a) => (
                  <Link key={a.id} href={`/workspaces/${a.workspace_id}/approvals`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <Avatar name={a.requester_name ?? "?"} color={a.requester_color} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{a.title}</span>
                      <span className="block truncate text-xs text-slate-500">{a.workspace_name} · requested by {a.requester_name}</span>
                    </span>
                    {a.due_date && <span className="text-xs text-slate-500">Due {dueLabel(a.due_date)}</span>}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <section>
          <SectionTitle>Recent activity</SectionTitle>
          <div className="card">
            {activity.length ? <ul className="divide-y divide-slate-100">{activity.map((m) => <ActivityItem key={m.id} m={m} />)}</ul> : <p className="px-4 py-6 text-center text-sm text-slate-500">No activity yet. Create a workspace to get started.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
