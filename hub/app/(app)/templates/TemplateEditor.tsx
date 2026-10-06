"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { saveTemplate } from "@/lib/actions/templates";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";
import type { Template, TemplateStep } from "@/lib/types";

const blank = (): TemplateStep => ({ type: "task", title: "", description: "", due_in_days: 7, assign_to: "team", internal: false });

export function TemplateEditor({ template, steps: initialSteps }: { template?: Template; steps?: TemplateStep[] }) {
  const [state, action] = useActionState(saveTemplate, idle);
  const [steps, setSteps] = useState<TemplateStep[]>(initialSteps?.length ? initialSteps : [blank()]);

  const update = (i: number, patch: Partial<TemplateStep>) => setSteps((s) => s.map((st, j) => (j === i ? { ...st, ...patch } : st)));
  const move = (i: number, dir: -1 | 1) =>
    setSteps((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const copy = [...s];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });

  return (
    <form action={action} className="space-y-5">
      {template && <input type="hidden" name="id" value={template.id} />}
      <div className="card space-y-4 p-5">
        <div>
          <label className="label">Flow name</label>
          <input name="name" defaultValue={template?.name} required className="input" placeholder="e.g. Company incorporation, Monthly bookkeeping, Visa application" />
        </div>
        <div>
          <label className="label">Description</label>
          <input name="description" defaultValue={template?.description} className="input" placeholder="When to use this flow" />
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((st, i) => (
          <div key={i} className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step {i + 1}</span>
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => move(i, -1)} className="btn btn-ghost btn-sm px-1.5" disabled={i === 0} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} className="btn btn-ghost btn-sm px-1.5" disabled={i === steps.length - 1} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setSteps((s) => s.filter((_, j) => j !== i))} className="btn btn-ghost btn-sm px-1.5 text-slate-400 hover:text-red-600" disabled={steps.length === 1} aria-label="Remove step"><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-4">
                <label className="label">Title</label>
                <input name="step_title" value={st.title} onChange={(e) => update(i, { title: e.target.value })} required className="input" placeholder="e.g. Collect passport copies" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Type</label>
                <select name="step_type" value={st.type} onChange={(e) => update(i, { type: e.target.value as TemplateStep["type"] })} className="input">
                  <option value="task">Task</option>
                  <option value="file_request">File request</option>
                  <option value="approval">Approval</option>
                </select>
              </div>
              <div className="sm:col-span-6">
                <label className="label">Description</label>
                <input name="step_description" value={st.description} onChange={(e) => update(i, { description: e.target.value })} className="input" placeholder="Optional instructions" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Due in (days)</label>
                <input name="step_due" type="number" min={0} value={st.due_in_days ?? ""} onChange={(e) => update(i, { due_in_days: e.target.value === "" ? null : Number(e.target.value) })} className="input" placeholder="No due date" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">{st.type === "approval" ? "Approver" : "Assign to"}</label>
                <select name="step_assign" value={st.assign_to} onChange={(e) => update(i, { assign_to: e.target.value as TemplateStep["assign_to"] })} className="input">
                  <option value="team">Workspace owner (team)</option>
                  <option value="client">First client contact</option>
                  <option value="none">Nobody</option>
                </select>
              </div>
              <div className="flex items-end sm:col-span-2">
                <input type="hidden" name="step_internal" value={st.internal ? "1" : "0"} />
                <label className={`inline-flex items-center gap-2 text-sm text-slate-600 ${st.type === "approval" ? "opacity-40" : ""}`}>
                  <input type="checkbox" checked={st.internal} disabled={st.type === "approval"} onChange={(e) => update(i, { internal: e.target.checked })} className="rounded border-slate-300" /> Internal only
                </label>
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setSteps((s) => [...s, blank()])} className="btn btn-secondary btn-sm"><Plus className="h-4 w-4" /> Add step</button>
      </div>

      <FormMessage state={state} />
      <div className="flex justify-end gap-2"><SubmitButton pendingText="Saving…">{template ? "Save flow" : "Create flow"}</SubmitButton></div>
    </form>
  );
}
