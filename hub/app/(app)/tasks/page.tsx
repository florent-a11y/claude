import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { isInternal, requireUser } from "@/lib/auth";
import { listAllOpenTasks, listMyTasks } from "@/lib/queries/tasks";
import { listTeam } from "@/lib/queries/users";
import { PageHeader } from "@/components/PageHeader";
import { TaskRow } from "@/components/TaskRow";
import { EmptyState } from "@/components/EmptyState";
import type { TaskWithMeta } from "@/lib/types";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string; who?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const internal = isInternal(user);
  const view = internal && (sp.view === "team" || sp.view === "overdue") ? sp.view : "mine";
  const tasks: TaskWithMeta[] =
    view === "mine" ? listMyTasks(user) : listAllOpenTasks({ assigneeId: sp.who, overdue: view === "overdue" });

  const groups = new Map<string, TaskWithMeta[]>();
  for (const t of tasks) {
    const key = `${t.workspace_id}|${t.client_name ? `${t.client_name} · ` : ""}${t.workspace_name}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const tab = (key: string, label: string) => (
    <Link href={`/tasks?view=${key}`} className={`rounded-md px-2.5 py-1 text-xs font-medium ${view === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{label}</Link>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Tasks" description={internal ? "Everything open across your active workspaces." : "What your project team is waiting on from you."} />
      {internal && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">{tab("mine", "Mine")}{tab("team", "Team")}{tab("overdue", "Overdue")}</div>
          {view !== "mine" && (
            <form action="/tasks" className="flex items-center gap-1">
              <input type="hidden" name="view" value={view} />
              <select name="who" defaultValue={sp.who ?? ""} className="input w-auto py-1.5 text-xs">
                <option value="">Anyone</option>
                <option value="unassigned">Unassigned</option>
                {listTeam().map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button className="btn btn-secondary btn-sm">Filter</button>
            </form>
          )}
        </div>
      )}
      {tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Nothing here" hint={view === "mine" ? "No open tasks are assigned to you." : "No open tasks match this view."} />
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([key, list]) => {
            const [wsId, label] = key.split("|");
            return (
              <section key={key} className="card">
                <Link href={`/workspaces/${wsId}/tasks`} className="block border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-indigo-600">{label}</Link>
                <ul className="divide-y divide-slate-100">{list.map((t) => <TaskRow key={t.id} task={t} />)}</ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
