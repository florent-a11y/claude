import Link from "next/link";
import { Check, FileUp, RotateCcw } from "lucide-react";
import { Avatar } from "./Avatar";
import { InternalBadge, PriorityBadge, TaskStatusBadge } from "./Badge";
import { setTaskStatus } from "@/lib/actions/tasks";
import { dueLabel, isOverdue } from "@/lib/format";
import type { TaskWithMeta } from "@/lib/types";

export function TaskRow({ task, showWorkspace = false, actions }: { task: TaskWithMeta; showWorkspace?: boolean; actions?: React.ReactNode }) {
  const done = task.status === "done";
  const overdue = isOverdue(task.due_date, done);
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      <form action={setTaskStatus.bind(null, task.id, done ? "todo" : "done")}>
        <button
          type="submit"
          title={done ? "Reopen" : "Mark as done"}
          className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md border transition ${
            done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent hover:border-indigo-500 hover:text-indigo-500"
          }`}
        >
          {done ? <RotateCcw className="h-3 w-3" /> : <Check className="h-3 w-3" />}
        </button>
      </form>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {task.kind === "file_request" && <FileUp className="h-3.5 w-3.5 text-slate-400" />}
          <span className={`text-sm font-medium ${done ? "text-slate-400 line-through" : "text-slate-900"}`}>{task.title}</span>
          <PriorityBadge priority={task.priority} />
          {task.status === "in_progress" && <TaskStatusBadge status={task.status} />}
          {!!task.internal && <InternalBadge />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
          {showWorkspace && (
            <Link href={`/workspaces/${task.workspace_id}/tasks`} className="hover:text-indigo-600 hover:underline">
              {task.client_name ? `${task.client_name} · ` : ""}{task.workspace_name}
            </Link>
          )}
          {task.due_date && <span className={overdue ? "font-medium text-red-600" : ""}>{overdue ? "Overdue · " : "Due "}{dueLabel(task.due_date)}</span>}
          {task.description && <span className="truncate text-slate-400">{task.description.slice(0, 80)}</span>}
        </div>
      </div>
      {task.assignee_name ? (
        <Avatar name={task.assignee_name} color={task.assignee_color} size="sm" />
      ) : (
        <span className="text-xs text-slate-400">Unassigned</span>
      )}
      {actions}
    </li>
  );
}
