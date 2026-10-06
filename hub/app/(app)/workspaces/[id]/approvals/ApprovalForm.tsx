"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createApproval } from "@/lib/actions/approvals";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";
import type { PublicUser } from "@/lib/types";

export function ApprovalForm({ workspaceId, members, files, meId }: { workspaceId: string; members: PublicUser[]; files: { id: string; name: string }[]; meId: string }) {
  const [state, action] = useActionState(createApproval.bind(null, workspaceId), idle);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Request approval</button>;
  return (
    <form ref={ref} action={action} className="card w-full space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">What needs approval?</label>
          <input name="title" required className="input" placeholder="e.g. Final logo design, Quotation v2" autoFocus />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Details</label>
          <textarea name="description" rows={2} className="input" placeholder="What the approver should check…" />
        </div>
        <div>
          <label className="label">Approver</label>
          <select name="approver_id" required className="input" defaultValue="">
            <option value="" disabled>Choose a person</option>
            {members.filter((m) => m.id !== meId).map((m) => <option key={m.id} value={m.id}>{m.name}{m.role === "client" ? " (client)" : ""}</option>)}
            {members.some((m) => m.id === meId) && <option value={meId}>Myself</option>}
          </select>
        </div>
        <div>
          <label className="label">Needed by</label>
          <input name="due_date" type="date" className="input" />
        </div>
        <div>
          <label className="label">Attach an existing file</label>
          <select name="file_id" className="input" defaultValue="">
            <option value="">None</option>
            {files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">…or upload a new one</label>
          <input name="file" type="file" className="input" />
        </div>
      </div>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">Cancel</button>
        <SubmitButton className="btn btn-primary btn-sm" pendingText="Sending…">Send request</SubmitButton>
      </div>
    </form>
  );
}
