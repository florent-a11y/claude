"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronRight, Loader2, Lock, X } from "lucide-react";
import { createTask } from "@/lib/actions/tasks";
import { createApproval } from "@/lib/actions/approvals";
import { applyTemplateAction } from "@/lib/actions/workspaces";
import { STEP_TYPES, type StepKind } from "@/lib/steps";
import { rolesOf } from "@/lib/roles";
import type { PublicUser, TemplateStep } from "@/lib/types";

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-2xl bg-white shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost px-2" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

const ADDABLE: StepKind[] = ["approval", "acknowledgement", "file_request", "task"];

/** Moxo's "Add New Action": pick a type, then fill the short form. */
export function AddActionModal({ workspaceId, members, meId, canInternal, onClose }: { workspaceId: string; members: PublicUser[]; meId: string; canInternal: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<StepKind | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!kind) return;
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      if (kind !== "approval") fd.set("kind", kind);
      const r = kind === "approval" ? await createApproval(workspaceId, {}, fd) : await createTask(workspaceId, {}, fd);
      if (r.error) setError(r.error);
      else onClose();
    });
  }

  return (
    <Modal title="Add New Action" onClose={onClose}>
      {!kind ? (
        <>
          <h3 className="text-lg font-semibold text-slate-900">Select Action Type</h3>
          <p className="mb-4 text-sm text-slate-500">Please select the type of action you want to add to this workspace.</p>
          <ul className="space-y-1">
            {ADDABLE.map((k) => {
              const t = STEP_TYPES[k];
              return (
                <li key={k}>
                  <button type="button" onClick={() => setKind(k)} className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left hover:border-slate-200 hover:bg-slate-50">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-white ${t.color}`}><t.icon className="h-4 w-4" /></span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-slate-800">{t.label}</span>
                      <span className="block text-xs text-slate-500">{t.hint}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-white ${STEP_TYPES[kind].color}`}>{(() => { const I = STEP_TYPES[kind].icon; return <I className="h-4 w-4" />; })()}</span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{STEP_TYPES[kind].label}</p>
              <button type="button" onClick={() => setKind(null)} className="text-xs text-indigo-600 hover:underline">Choose another type</button>
            </div>
          </div>
          <div>
            <label className="label">Title</label>
            <input name="title" required autoFocus className="input" placeholder={kind === "approval" ? "What needs approval?" : kind === "file_request" ? "Which document do you need?" : kind === "acknowledgement" ? "What should they confirm they have read?" : "What needs to be done?"} />
          </div>
          <div>
            <label className="label">Instructions (optional)</label>
            <textarea name="description" rows={2} className="input" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">{kind === "approval" ? "Approver" : "Assigned to"}</label>
              <select name={kind === "approval" ? "approver_id" : "assignee_id"} required={kind === "approval"} className="input" defaultValue={kind === "approval" ? "" : meId}>
                {kind === "approval" ? <option value="" disabled>Choose a person</option> : <option value="">Unassigned</option>}
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role === "client" ? " (client)" : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Due date</label>
              <input name="due_date" type="date" className="input" />
            </div>
          </div>
          {kind !== "approval" && canInternal && (
            <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="internal" className="rounded border-slate-300" /> <Lock className="h-3 w-3" /> Internal (hidden from clients)</label>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
            <button type="submit" disabled={pending} className="btn btn-primary btn-sm">{pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add {STEP_TYPES[kind].label}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Start a flow in this workspace: choose the template, then say who plays each role. */
export function StartFlowModal({ workspaceId, members, flows, ownerId, onClose }: { workspaceId: string; members: PublicUser[]; flows: { id: string; name: string; steps: TemplateStep[] }[]; ownerId: string | null; onClose: () => void }) {
  const [flowId, setFlowId] = useState(flows[0]?.id ?? "");
  const flow = flows.find((f) => f.id === flowId);
  const roles = useMemo(() => (flow ? rolesOf(flow.steps) : []), [flow]);
  const firstClient = members.find((m) => m.role === "client")?.id ?? "";
  const defaultFor = (role: string) => (role === "Client" ? firstClient : role === "Manager" ? (ownerId ?? "") : "");
  const action = applyTemplateAction.bind(null, workspaceId);

  return (
    <Modal title="Start a flow" onClose={onClose}>
      {flows.length === 0 ? (
        <p className="text-sm text-slate-600">No flow templates yet. Create one in the Library first.</p>
      ) : (
        <form action={action} className="space-y-4">
          <div>
            <label className="label">Flow template</label>
            <select name="template_id" value={flowId} onChange={(e) => setFlowId(e.target.value)} className="input">
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.steps.length} steps)</option>)}
            </select>
          </div>
          {flow && (
            <ol className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              {flow.steps.map((s, i) => {
                const t = STEP_TYPES[s.type === "message" ? "message" : s.type];
                return (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-4 text-right text-slate-400">{i + 1}.</span>
                    <span className={`inline-flex h-4 w-4 items-center justify-center rounded ${t.color} text-white`}><t.icon className="h-2.5 w-2.5" /></span>
                    <span className="truncate">{s.title}</span>
                    {s.assign_to && s.type !== "message" && <span className="ml-auto shrink-0 rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200">{s.assign_to}</span>}
                  </li>
                );
              })}
            </ol>
          )}
          {roles.length > 0 && (
            <div>
              <p className="label">Roles</p>
              <p className="mb-2 text-xs text-slate-500">Who plays each role in this workspace. Steps are assigned accordingly.</p>
              <div className="space-y-2">
                {roles.map((role) => (
                  <label key={role} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0 truncate rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{role}</span>
                    <select name={`role:${role}`} defaultValue={defaultFor(role)} className="input py-1.5 text-sm">
                      <option value="">Nobody yet</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role === "client" ? " (client)" : ""}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm">Start flow</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
