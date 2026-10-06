"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createTask } from "@/lib/actions/tasks";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";
import type { PublicUser } from "@/lib/types";

export function TaskForm({ workspaceId, members, canInternal, meId }: { workspaceId: string; members: PublicUser[]; canInternal: boolean; meId: string }) {
  const [state, action] = useActionState(createTask.bind(null, workspaceId), idle);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> New task</button>
    );
  }
  return (
    <form ref={formRef} action={action} className="card w-full space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Title</label>
          <input name="title" required className="input" placeholder="What needs to be done?" autoFocus />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Details (optional)</label>
          <textarea name="description" rows={2} className="input" />
        </div>
        <div>
          <label className="label">Type</label>
          <select name="kind" className="input" defaultValue="task">
            <option value="task">Task</option>
            <option value="file_request">File request (ask someone to upload a document)</option>
            <option value="acknowledgement">Acknowledgement (ask someone to confirm they have read it)</option>
          </select>
        </div>
        <div>
          <label className="label">Assign to</label>
          <select name="assignee_id" className="input" defaultValue={meId}>
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role === "client" ? " (client)" : ""}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Due date</label>
          <input name="due_date" type="date" className="input" />
        </div>
        <div>
          <label className="label">Priority</label>
          <select name="priority" className="input" defaultValue="normal">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      {canInternal && (
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="internal" className="rounded border-slate-300" /> Internal task (hidden from clients)
        </label>
      )}
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">Cancel</button>
        <SubmitButton className="btn btn-primary btn-sm" pendingText="Adding…">Add task</SubmitButton>
      </div>
    </form>
  );
}
