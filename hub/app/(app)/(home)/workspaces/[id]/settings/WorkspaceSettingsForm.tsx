"use client";

import { useActionState } from "react";
import { updateWorkspace } from "@/lib/actions/workspaces";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";
import type { PublicUser, Workspace } from "@/lib/types";

export function WorkspaceSettingsForm({ ws, clients, team }: { ws: Workspace; clients: { id: string; name: string }[]; team: PublicUser[] }) {
  const [state, action] = useActionState(updateWorkspace.bind(null, ws.id), idle);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Name</label>
          <input name="name" defaultValue={ws.name} required className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Description</label>
          <textarea name="description" rows={3} defaultValue={ws.description} className="input" />
        </div>
        <div>
          <label className="label">Client</label>
          <select name="client_id" defaultValue={ws.client_id ?? ""} className="input">
            <option value="">No client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select name="status" defaultValue={ws.status} className="input">
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label className="label">Owner (responsible)</label>
          <select name="owner_id" defaultValue={ws.owner_id ?? ""} className="input">
            <option value="">Nobody</option>
            {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Target date</label>
          <input name="due_date" type="date" defaultValue={ws.due_date ?? ""} className="input" />
        </div>
      </div>
      <FormMessage state={state} success="Saved." />
      <div className="flex justify-end"><SubmitButton pendingText="Saving…">Save changes</SubmitButton></div>
    </form>
  );
}
