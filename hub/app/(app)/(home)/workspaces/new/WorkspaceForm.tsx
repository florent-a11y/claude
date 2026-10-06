"use client";

import { useActionState } from "react";
import { createWorkspace } from "@/lib/actions/workspaces";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";
import { Avatar } from "@/components/Avatar";
import type { PublicUser, Template } from "@/lib/types";

export function WorkspaceForm({ clients, team, clientUsers, templates, defaultClientId }: {
  clients: { id: string; name: string }[];
  team: PublicUser[];
  clientUsers: (PublicUser & { client_name: string | null })[];
  templates: Pick<Template, "id" | "name">[];
  defaultClientId?: string;
}) {
  const [state, action] = useActionState(createWorkspace, idle);
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">Workspace name</label>
          <input id="name" name="name" required className="input" placeholder="e.g. Company registration — PT Example" autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="client_id">Client</label>
          <select id="client_id" name="client_id" className="input" defaultValue={defaultClientId ?? ""}>
            <option value="">No client (internal project)</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="due_date">Target date</label>
          <input id="due_date" name="due_date" type="date" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={3} className="input" placeholder="Scope, context, what success looks like…" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="template_id">Start from a flow (optional)</label>
          <select id="template_id" name="template_id" className="input" defaultValue="">
            <option value="">Blank workspace</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-400">A flow pre-creates the tasks, file requests and approvals of a standard engagement.</p>
        </div>
      </div>

      <fieldset>
        <legend className="label">Team members</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {team.map((u) => (
            <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
              <input type="checkbox" name="member_ids" value={u.id} className="rounded border-slate-300" />
              <Avatar name={u.name} color={u.color} size="xs" />
              <span className="truncate">{u.name}</span>
              <span className="ml-auto truncate text-xs text-slate-400">{u.title}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">You are added automatically.</p>
      </fieldset>

      {clientUsers.length > 0 && (
        <fieldset>
          <legend className="label">Client contacts (portal access)</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {clientUsers.map((u) => (
              <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="checkbox" name="member_ids" value={u.id} className="rounded border-slate-300" />
                <Avatar name={u.name} color={u.color} size="xs" />
                <span className="truncate">{u.name}</span>
                <span className="ml-auto truncate text-xs text-slate-400">{u.client_name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <SubmitButton pendingText="Creating…">Create workspace</SubmitButton>
      </div>
    </form>
  );
}
