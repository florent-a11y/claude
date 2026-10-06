"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, CircleDashed, Clock, LayoutTemplate, Lock, Plus, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { ActionDetails } from "./ActionDetails";
import { AddActionModal, StartFlowModal } from "./ActionModals";
import { STATUS_LABEL, STEP_TYPES, type Step } from "@/lib/steps";
import { dueLabel, isOverdue } from "@/lib/format";
import type { PublicUser, Role, TemplateStep } from "@/lib/types";

export interface FlowOption {
  id: string;
  name: string;
  steps: TemplateStep[];
}

export function StepsTimeline({ steps, workspaceId, me, canManage, members, flows, ownerId }: {
  steps: Step[];
  workspaceId: string;
  me: { id: string; name: string; color: string; role: Role };
  canManage: boolean;
  members: PublicUser[];
  flows: FlowOption[];
  ownerId: string | null;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(params.get("step"));
  const [modal, setModal] = useState<"add" | "flow" | null>(null);
  useEffect(() => {
    const s = params.get("step");
    if (s) setSelected(s);
  }, [params]);
  const current = steps.find((s) => s.id === selected) ?? null;
  const close = () => {
    setSelected(null);
    if (params.get("step")) router.replace(`/workspaces/${workspaceId}`);
  };

  return (
    <div className="px-5 pb-6 pt-2">
      {steps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">No steps yet</p>
          <p className="mt-1 text-xs text-slate-500">{canManage ? "Start a flow, or add actions one by one. Each step shows who it is waiting on." : "Your project team has not added any steps yet."}</p>
        </div>
      ) : (
        <ol className="relative">
          {steps.map((s, i) => {
            const t = STEP_TYPES[s.kind];
            const active = s.id === selected;
            const overdue = isOverdue(s.due_date, s.status === "completed" || s.status === "cancelled");
            return (
              <li key={s.id} className="relative flex gap-4">
                <div className="flex w-6 shrink-0 flex-col items-center">
                  <Rail status={s.status} />
                  {i < steps.length - 1 && <span className={`w-0.5 flex-1 ${s.status === "completed" ? "bg-emerald-500" : "bg-slate-200"}`} />}
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(active ? null : s.id)}
                  className={`mb-3 flex w-full items-center gap-4 rounded-xl border bg-white px-4 py-3.5 text-left shadow-sm transition ${active ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-slate-200 hover:border-slate-300"}`}
                  aria-expanded={active}
                  data-step={s.id}
                >
                  <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${t.tint} ${t.text}`}><t.icon className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`truncate text-base ${s.status === "completed" ? "text-slate-500" : "font-medium text-slate-900"}`}>{s.title}</span>
                      {s.internal && <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                    </span>
                    <span className={`block text-sm ${s.status === "in_progress" ? "text-sky-700" : s.status === "rejected" ? "text-red-600" : "text-slate-500"}`}>
                      {STATUS_LABEL[s.status]}
                      {s.due_date && s.status !== "completed" && <span className={overdue ? " text-red-600" : ""}> · {overdue ? "overdue" : "due"} {dueLabel(s.due_date)}</span>}
                    </span>
                  </span>
                  {s.assignee ? <Avatar name={s.assignee.name} color={s.assignee.color} size="md" /> : <span className="text-xs text-slate-400">Unassigned</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {canManage && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-10">
          <button type="button" onClick={() => setModal("add")} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Add action</button>
          <button type="button" onClick={() => setModal("flow")} className="btn btn-secondary btn-sm"><LayoutTemplate className="h-3.5 w-3.5" /> Start a flow</button>
          <Link href={`/workspaces/${workspaceId}/build`} className="btn btn-ghost btn-sm">Build a custom plan</Link>
        </div>
      )}

      {modal === "add" && <AddActionModal workspaceId={workspaceId} members={members} meId={me.id} canInternal={canManage} onClose={() => setModal(null)} />}
      {modal === "flow" && <StartFlowModal workspaceId={workspaceId} members={members} flows={flows} ownerId={ownerId} onClose={() => setModal(null)} />}

      {current && (
        <ActionDetails step={current} index={steps.findIndex((s) => s.id === current.id) + 1} workspaceId={workspaceId} me={me} canManage={canManage} onClose={close} />
      )}
    </div>
  );
}

function Rail({ status }: { status: Step["status"] }) {
  if (status === "completed") return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3.5 w-3.5" /></span>;
  if (status === "in_progress") return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-white"><Clock className="h-3.5 w-3.5" /></span>;
  if (status === "rejected" || status === "cancelled") return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white"><X className="h-3.5 w-3.5" /></span>;
  return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-300"><CircleDashed className="h-6 w-6" /></span>;
}
