import type { TaskItem } from "@/lib/types";
import { sortTasks } from "@/lib/crm";
import { todayISO } from "@/lib/dates";
import { Card, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { createTask, toggleTask } from "@/app/tasks/actions";
import type { Lookups } from "../_lib/server";
import { TaskRows } from "./tables";

/** Open tasks related to a record plus a one-line add form. */
export function TaskPanel({ tasks, related, backPath, l, meId }: { tasks: TaskItem[]; related: { type: NonNullable<TaskItem["related"]>["type"]; id: string }; backPath: string; l: Lookups; meId: string }) {
  const open = sortTasks(tasks.filter((t) => !t.done), todayISO());
  return (
    <Card title={`Tasks (${open.length})`}>
      <TaskRows tasks={open} l={l} toggle={(t) => <form action={toggleTask.bind(null, t.id, backPath)}><button className="checkbox h-4 w-4 rounded border border-slate-300 bg-white" aria-label="Mark done" /></form>} />
      <form action={createTask.bind(null, backPath)} className="mt-3 grid gap-2 md:grid-cols-[1fr_9rem_10rem_auto]">
        <input type="hidden" name="related" value={`${related.type}:${related.id}`} />
        <input name="title" required className="input !py-1.5" placeholder="New task…" />
        <input name="dueDate" type="date" className="input !py-1.5" />
        <Select name="assigneeUserId" defaultValue={meId} options={l.activeUsers.map((u) => ({ value: u.id, label: u.name }))} className="input !py-1.5" />
        <SubmitButton className="btn-secondary !py-1.5" pendingText="Adding…">Add</SubmitButton>
      </form>
    </Card>
  );
}
