import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckSquare, LayoutTemplate, Trash2, Play } from "lucide-react";
import { isInternal, requireUser } from "@/lib/auth";
import { getWorkspaceForUser, listMembers } from "@/lib/queries/workspaces";
import { listWorkspaceTasks } from "@/lib/queries/tasks";
import { listTemplates } from "@/lib/queries/templates";
import { deleteTask, setTaskStatus } from "@/lib/actions/tasks";
import { applyTemplateAction } from "@/lib/actions/workspaces";
import { TaskRow } from "@/components/TaskRow";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmButton } from "@/components/ConfirmButton";
import { TaskForm } from "./TaskForm";
import { TaskEditor } from "./TaskEditor";

export const metadata = { title: "Tasks" };

export default async function WorkspaceTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ws = getWorkspaceForUser(id, user);
  if (!ws) notFound();
  const internal = isInternal(user);
  const tasks = listWorkspaceTasks(id, user);
  const members = listMembers(id);
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const templates = internal ? listTemplates() : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-slate-500">{open.length} open · {done.length} done</p>
        <div className="flex flex-wrap items-center gap-2">
          {internal && templates.length > 0 && (
            <form action={applyTemplateAction.bind(null, id)} className="flex items-center gap-1">
              <select name="template_id" className="input w-auto py-1.5 text-xs" defaultValue="">
                <option value="" disabled>Apply a flow…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.step_count} steps)</option>)}
              </select>
              <button className="btn btn-secondary btn-sm" type="submit"><Play className="h-3.5 w-3.5" /> Apply</button>
            </form>
          )}
          {internal && (
            <Link href={`/workspaces/${id}/build`} className="btn btn-secondary btn-sm"><LayoutTemplate className="h-3.5 w-3.5" /> Build project</Link>
          )}
          <TaskForm workspaceId={id} members={members} canInternal={internal} meId={user.id} />
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks yet" hint="Add tasks one by one, or build the whole project plan by dragging steps into place." action={internal && <Link href={`/workspaces/${id}/build`} className="btn btn-primary btn-sm"><LayoutTemplate className="h-4 w-4" /> Build project</Link>} />
      ) : (
        <>
          <div className="card">
            {open.length ? (
              <ul className="divide-y divide-slate-100">
                {open.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    actions={
                      <>
                        <span className="flex items-center gap-1">
                          {t.status === "todo" && (
                            <form action={setTaskStatus.bind(null, t.id, "in_progress")}>
                              <button className="btn btn-ghost btn-sm" title="Start">Start</button>
                            </form>
                          )}
                          {internal && (
                            <form action={deleteTask.bind(null, t.id)}>
                              <ConfirmButton message={`Delete "${t.title}"?`} className="btn btn-ghost btn-sm px-2 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>
                            </form>
                          )}
                        </span>
                        <TaskEditor task={t} members={members} canInternal={internal} />
                      </>
                    }
                  />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Everything is done.</p>
            )}
          </div>
          {done.length > 0 && (
            <details className="card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-600">Completed ({done.length})</summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {done.map((t) => <TaskRow key={t.id} task={t} />)}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
