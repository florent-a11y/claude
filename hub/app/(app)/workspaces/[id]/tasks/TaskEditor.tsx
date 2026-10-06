"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { updateTask } from "@/lib/actions/tasks";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";
import type { PublicUser, TaskWithMeta } from "@/lib/types";

export function TaskEditor({ task, members, canInternal }: { task: TaskWithMeta; members: PublicUser[]; canInternal: boolean }) {
  const [state, action] = useActionState(updateTask.bind(null, task.id), idle);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost btn-sm px-2" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
    );
  }
  return (
    <form action={action} className="mt-1 basis-full space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Title</label>
          <input name="title" defaultValue={task.title} required className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Details</label>
          <textarea name="description" rows={2} defaultValue={task.description} className="input" />
        </div>
        <div>
          <label className="label">Status</label>
          <select name="status" defaultValue={task.status} className="input">
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div>
          <label className="label">Assign to</label>
          <select name="assignee_id" defaultValue={task.assignee_id ?? ""} className="input">
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role === "client" ? " (client)" : ""}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Due date</label>
          <input name="due_date" type="date" defaultValue={task.due_date ?? ""} className="input" />
        </div>
        <div>
          <label className="label">Priority</label>
          <select name="priority" defaultValue={task.priority} className="input">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      {canInternal && (
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="internal" defaultChecked={!!task.internal} className="rounded border-slate-300" /> Internal (hidden from clients)
        </label>
      )}
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">Cancel</button>
        <SubmitButton className="btn btn-primary btn-sm" pendingText="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}
