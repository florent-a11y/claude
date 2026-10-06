"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, Copy, GripVertical, Info, Lock, Plus, Trash2, UserRound, X } from "lucide-react";
import { saveTemplate, buildProject } from "@/lib/actions/templates";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "./SubmitButton";
import { FormMessage } from "./FormMessage";
import { STEP_TYPES } from "@/lib/steps";
import { addDays, formatDate, formatDateTime } from "@/lib/format";
import { BUILT_IN_ROLES, type PublicUser, type TemplateStep, type TemplateStepType } from "@/lib/types";

type Step = TemplateStep & { id: string; open: boolean };

const ACTIONS: TemplateStepType[] = ["approval", "acknowledgement", "file_request", "task"];
const HEADER: Record<TemplateStepType, string> = {
  approval: "border-teal-600 bg-teal-50",
  acknowledgement: "border-amber-600 bg-amber-50",
  file_request: "border-green-600 bg-green-50",
  task: "border-rose-600 bg-rose-50",
  message: "border-indigo-500 bg-indigo-50",
};

let counter = 0;
const uid = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;
const fresh = (type: TemplateStepType): Step => ({
  id: uid(),
  open: true,
  type,
  title: "",
  description: "",
  due_in_days: type === "message" ? null : 7,
  assign_to: type === "message" ? "" : type === "approval" || type === "file_request" ? "Client" : "Manager",
  assignee_id: null,
  internal: false,
});
const hydrate = (steps: TemplateStep[]): Step[] => steps.map((s) => ({ ...s, id: uid(), open: false }));

export interface BuilderProps {
  mode: "template" | "workspace";
  template?: { id: string; name: string; description: string; created_at?: string; creator_name?: string | null };
  initialSteps?: TemplateStep[];
  workspaceId?: string;
  workspaceName?: string;
  members?: PublicUser[];
  flows?: { id: string; name: string; steps: TemplateStep[] }[];
}

/** Moxo-style flow builder: a palette of actions on the left, a vertical flow diagram in the middle, roles and details. */
export function FlowBuilder(props: BuilderProps) {
  const action = props.mode === "workspace" ? buildProject.bind(null, props.workspaceId!) : saveTemplate;
  const [state, formAction] = useActionState(action, idle);
  const [steps, setSteps] = useState<Step[]>(() => hydrate(props.initialSteps ?? []));
  const [tab, setTab] = useState<"add" | "roles" | "details">("add");
  const [customRoles, setCustomRoles] = useState<string[]>(() => [...new Set((props.initialSteps ?? []).map((s) => s.assign_to).filter((r) => r && !(BUILT_IN_ROLES as readonly string[]).includes(r)))]);
  const [newRole, setNewRole] = useState("");
  const [active, setActive] = useState<{ kind: "palette"; type: TemplateStepType } | { kind: "step"; step: Step } | null>(null);
  const [insertAt, setInsertAt] = useState<{ id: string; after: boolean } | null>(null);
  const [plusAt, setPlusAt] = useState<number | null>(null);
  const [saveAsFlow, setSaveAsFlow] = useState(false);

  const roles = useMemo(() => {
    const used = new Set(steps.map((s) => s.assign_to).filter(Boolean));
    return [...BUILT_IN_ROLES, ...[...new Set([...customRoles, ...used])].filter((r) => !(BUILT_IN_ROLES as readonly string[]).includes(r))];
  }, [steps, customRoles]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const collision: CollisionDetection = (args) => {
    if (args.active.data.current?.from === "palette") {
      const within = pointerWithin(args);
      const hits = within.filter((c) => c.id !== "canvas");
      if (hits.length) return hits;
      if (within.length) return within;
      return closestCenter(args);
    }
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id !== "canvas") });
  };

  const update = (id: string, patch: Partial<Step>) => setSteps((s) => s.map((st) => (st.id === id ? { ...st, ...patch } : st)));
  const remove = (id: string) => setSteps((s) => s.filter((st) => st.id !== id));
  const duplicate = (id: string) => setSteps((s) => { const i = s.findIndex((st) => st.id === id); return i < 0 ? s : [...s.slice(0, i + 1), { ...s[i]!, id: uid(), open: false }, ...s.slice(i + 1)]; });
  const insert = (type: TemplateStepType, at: number) => setSteps((s) => { const closed = s.map((st) => ({ ...st, open: false })); return [...closed.slice(0, at), fresh(type), ...closed.slice(at)]; });
  const append = (type: TemplateStepType) => insert(type, steps.length);

  function placement(e: DragOverEvent | DragEndEvent): { id: string; after: boolean } | null {
    const { over, active: a } = e;
    if (!over || over.id === "canvas") return null;
    const rect = a.rect.current.translated;
    if (!rect) return { id: String(over.id), after: false };
    return { id: String(over.id), after: rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 };
  }
  function onDragStart(e: DragStartEvent) {
    const d = e.active.data.current;
    if (d?.from === "palette") setActive({ kind: "palette", type: d.type as TemplateStepType });
    else { const st = steps.find((s) => s.id === e.active.id); if (st) setActive({ kind: "step", step: st }); }
  }
  function onDragOver(e: DragOverEvent) { if (e.active.data.current?.from === "palette") setInsertAt(placement(e)); }
  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    setActive(null); setInsertAt(null);
    if (!over) return;
    if (a.data.current?.from === "palette") {
      const place = placement(e);
      const i = place ? steps.findIndex((st) => st.id === place.id) : -1;
      insert(a.data.current.type as TemplateStepType, i < 0 ? steps.length : place!.after ? i + 1 : i);
      return;
    }
    if (a.id !== over.id) setSteps((s) => { const from = s.findIndex((st) => st.id === a.id); const to = s.findIndex((st) => st.id === over.id); return from < 0 || to < 0 ? s : arrayMove(s, from, to); });
  }

  const payload = useMemo(() => JSON.stringify(steps.map(({ id: _i, open: _o, ...rest }) => { void _i; void _o; return rest; })), [steps]);
  const untitled = steps.filter((s) => !s.title.trim()).length;
  const welcome = steps[0]?.type === "message" ? steps[0] : null;

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActive(null); setInsertAt(null); }}>
      <form action={formAction} className="flex h-[calc(100vh-5.5rem)] flex-col">
        <input type="hidden" name="steps" value={payload} />
        {props.template && <input type="hidden" name="id" value={props.template.id} />}

        {/* Title bar */}
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
          <Link href={props.mode === "workspace" ? `/workspaces/${props.workspaceId}` : "/templates"} className="btn btn-ghost px-2" aria-label="Close"><X className="h-4 w-4" /></Link>
          <span className="text-base font-semibold text-slate-900">{props.mode === "workspace" ? `Build plan · ${props.workspaceName}` : props.template?.name || "New flow template"}</span>
          <span className="badge bg-orange-500 text-white">{props.mode === "workspace" ? "BUILDING PLAN" : props.template ? "EDITING TEMPLATE" : "NEW TEMPLATE"}</span>
          <span className="ml-auto flex items-center gap-3">
            {untitled > 0 && <span className="text-xs text-amber-700">{untitled} step{untitled === 1 ? " has" : "s have"} no title</span>}
            <FormMessage state={state} />
            <SubmitButton pendingText="Saving…">{props.mode === "workspace" ? `Create ${steps.length} step${steps.length === 1 ? "" : "s"}` : props.template ? "Save template" : "Create template"}</SubmitButton>
          </span>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left panel */}
          <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
            <div className="flex border-b border-slate-200">
              {([["add", "+ Add"], ["roles", "Roles"], ["details", "Details"]] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={`tab flex-1 justify-center px-2 ${tab === k ? "tab-active" : ""}`}>{k === "roles" && <UserRound className="h-3.5 w-3.5" />}{k === "details" && <Info className="h-3.5 w-3.5" />}{label}</button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className={tab === "add" ? "" : "hidden"}>
                <p className="mb-2 text-sm font-semibold text-slate-900">Actions</p>
                <div className="space-y-2">{ACTIONS.map((t) => <PaletteItem key={t} type={t} onAdd={() => append(t)} />)}</div>
                <p className="mb-2 mt-5 text-sm font-semibold text-slate-900">Layout</p>
                <div className="space-y-2"><PaletteItem type="message" onAdd={() => append("message")} /></div>
                <p className="mt-4 text-xs text-slate-400">Drag an action onto the flow, or click + to add it at the end.</p>
              </div>
              <div className={tab === "roles" ? "" : "hidden"}>
                <p className="mb-1 text-sm font-semibold text-slate-900">Roles</p>
                <p className="mb-3 text-xs text-slate-500">Steps are assigned to roles. When the flow starts in a workspace, you choose who plays each role.</p>
                <ul className="space-y-1.5">
                  {roles.map((r) => (
                    <li key={r} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <span className="font-medium text-slate-800">{r}</span>
                      <span className="text-xs text-slate-400">{(BUILT_IN_ROLES as readonly string[]).includes(r) ? (r === "Client" ? "first client contact" : "workspace owner") : `${steps.filter((s) => s.assign_to === r).length} step(s)`}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-1">
                  <input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="e.g. Tax and Accounting" className="input py-1.5 text-sm" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (newRole.trim()) { setCustomRoles((c) => [...new Set([...c, newRole.trim().slice(0, 60)])]); setNewRole(""); } } }} />
                  <button type="button" onClick={() => { if (newRole.trim()) { setCustomRoles((c) => [...new Set([...c, newRole.trim().slice(0, 60)])]); setNewRole(""); } }} className="btn btn-secondary btn-sm">Add</button>
                </div>
              </div>
              <div className={tab === "details" ? "" : "hidden"}>
                {props.mode === "template" ? (
                  <div className="space-y-3">
                    <div><label className="label">Template name</label><input name="name" defaultValue={props.template?.name} required className="input" placeholder="e.g. LKPM Report" /></div>
                    <div><label className="label">Description</label><textarea name="description" rows={3} defaultValue={props.template?.description} className="input" placeholder="This template is used for…" /></div>
                    <dl className="space-y-3 border-t border-slate-100 pt-3 text-sm">
                      <div><dt className="text-xs uppercase tracking-wide text-slate-500">Type</dt><dd className="text-slate-800">Flow</dd></div>
                      <div><dt className="text-xs uppercase tracking-wide text-slate-500">Length</dt><dd className="text-slate-800">{steps.length} Steps</dd></div>
                      {props.template?.created_at && <div><dt className="text-xs uppercase tracking-wide text-slate-500">Created by</dt><dd className="text-slate-800">{props.template.creator_name ?? "—"} on {formatDateTime(props.template.created_at)}</dd></div>}
                    </dl>
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    <p className="text-slate-700">{steps.length} step{steps.length === 1 ? "" : "s"} will be created in <span className="font-medium">{props.workspaceName}</span>. Due dates count from today.</p>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="save_as_flow" checked={saveAsFlow} onChange={(e) => setSaveAsFlow(e.target.checked)} className="rounded border-slate-300" /> Also save as a reusable template</label>
                    {saveAsFlow && <input name="flow_name" className="input" placeholder="Template name" required />}
                    {props.flows && props.flows.length > 0 && (
                      <div>
                        <label className="label">Start from a template</label>
                        <select className="input" defaultValue="" onChange={(e) => { const f = props.flows!.find((x) => x.id === e.target.value); if (!f) return; if (steps.length && !window.confirm("Replace the current steps with this template?")) { e.target.value = ""; return; } setSteps(hydrate(f.steps)); }}>
                          <option value="">Choose…</option>
                          {props.flows.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.steps.length})</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* Canvas */}
          <Canvas>
            <div className="mx-auto w-full max-w-xl py-8">
              <div className="rounded-xl border-2 border-slate-300 bg-white px-6 py-4 text-center shadow-sm">
                <p className="text-lg font-semibold text-slate-900">Flow Start</p>
                {welcome ? (
                  <p className="mt-1 truncate text-xs text-slate-500">Welcome message: “{welcome.description || welcome.title || "…"}”</p>
                ) : (
                  <button type="button" onClick={() => insert("message", 0)} className="mt-1 rounded-md bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-100">Add Welcome Message</button>
                )}
              </div>
              <Connector index={0} open={plusAt === 0} onToggle={() => setPlusAt(plusAt === 0 ? null : 0)} onPick={(t) => { insert(t, 0); setPlusAt(null); }} />
              <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {steps.map((step, i) => (
                  <div key={step.id}>
                    <StepCard
                      step={step}
                      index={i}
                      mode={props.mode}
                      members={props.members ?? []}
                      roles={roles}
                      indicator={insertAt?.id === step.id ? (insertAt.after ? "after" : "before") : null}
                      onChange={(patch) => update(step.id, patch)}
                      onRemove={() => remove(step.id)}
                      onDuplicate={() => duplicate(step.id)}
                      onAddRole={(r) => setCustomRoles((c) => [...new Set([...c, r])])}
                    />
                    <Connector index={i + 1} open={plusAt === i + 1} onToggle={() => setPlusAt(plusAt === i + 1 ? null : i + 1)} onPick={(t) => { insert(t, i + 1); setPlusAt(null); }} last={i === steps.length - 1} />
                  </div>
                ))}
              </SortableContext>
              {steps.length === 0 && <p className="mt-2 text-center text-sm text-slate-500">Drag an action here, or use the + above.</p>}
            </div>
          </Canvas>
        </div>
      </form>

      <DragOverlay dropAnimation={null}>
        {active?.kind === "palette" && <PaletteGhost type={active.type} />}
        {active?.kind === "step" && <StepGhost step={active.step} />}
      </DragOverlay>
    </DndContext>
  );
}

function Canvas({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas" });
  return (
    <div ref={setNodeRef} className={`flex-1 overflow-y-auto px-6 ${isOver ? "bg-indigo-50/40" : ""}`} style={{ backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
      {children}
    </div>
  );
}

function Connector({ index, open, onToggle, onPick, last = false }: { index: number; open: boolean; onToggle: () => void; onPick: (t: TemplateStepType) => void; last?: boolean }) {
  void index;
  return (
    <div className="relative flex h-14 flex-col items-center">
      <span className="h-4 w-0.5 bg-slate-300" />
      <button type="button" onClick={onToggle} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-indigo-600 shadow-sm hover:border-indigo-400" aria-label="Insert a step here"><Plus className="h-4 w-4" /></button>
      {!last && <span className="h-4 w-0.5 flex-1 bg-slate-300" />}
      {open && (
        <div className="absolute left-1/2 top-9 z-20 w-56 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {ACTIONS.concat("message").map((t) => {
            const T = STEP_TYPES[t];
            return (
              <button key={t} type="button" onClick={() => onPick(t)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-slate-50">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded ${T.color} text-white`}><T.icon className="h-3.5 w-3.5" /></span>{T.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaletteItem({ type, onAdd }: { type: TemplateStepType; onAdd: () => void }) {
  const t = STEP_TYPES[type];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette-${type}`, data: { from: "palette", type } });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`flex cursor-grab items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition hover:border-indigo-300 active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`} title={t.hint}>
      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white ${t.color}`}><t.icon className="h-4 w-4" /></span>
      <span className="flex-1 text-sm font-medium text-slate-900">{t.label}</span>
      <button type="button" onClick={onAdd} onPointerDown={(e) => e.stopPropagation()} className="btn btn-ghost btn-sm px-1.5" aria-label={`Add ${t.label}`}><Plus className="h-4 w-4" /></button>
      <GripVertical className="h-4 w-4 text-slate-300" />
    </div>
  );
}

function PaletteGhost({ type }: { type: TemplateStepType }) {
  const t = STEP_TYPES[type];
  return <div className="flex w-56 items-center gap-3 rounded-lg border border-indigo-300 bg-white px-3 py-2.5 shadow-lg"><span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-white ${t.color}`}><t.icon className="h-4 w-4" /></span><span className="text-sm font-medium">{t.label}</span></div>;
}

function StepGhost({ step }: { step: Step }) {
  const t = STEP_TYPES[step.type];
  return <div className="w-[32rem] max-w-[90vw] rounded-xl border-2 border-indigo-400 bg-white px-4 py-3 shadow-lg"><span className="text-sm font-medium text-slate-900">{step.title || `Untitled ${t.label.toLowerCase()}`}</span></div>;
}

function StepCard({ step, index, mode, members, roles, indicator, onChange, onRemove, onDuplicate, onAddRole }: {
  step: Step;
  index: number;
  mode: "template" | "workspace";
  members: PublicUser[];
  roles: string[];
  indicator: "before" | "after" | null;
  onChange: (patch: Partial<Step>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onAddRole: (r: string) => void;
}) {
  const t = STEP_TYPES[step.type];
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: step.id, data: { from: "canvas" } });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const dueDate = step.due_in_days == null ? null : addDays(step.due_in_days);
  const assignValue = step.assignee_id ? `user:${step.assignee_id}` : step.assign_to ? `role:${step.assign_to}` : "__none";
  const assigneeLabel = step.assignee_id ? members.find((m) => m.id === step.assignee_id)?.name ?? "Member" : step.assign_to || "Nobody";

  return (
    <div ref={setNodeRef} style={style} data-step-type={step.type} className={`relative ${isDragging ? "opacity-40" : ""}`}>
      {indicator === "before" && <span className="absolute -top-2 left-0 right-0 h-1 rounded bg-indigo-500" />}
      {indicator === "after" && <span className="absolute -bottom-2 left-0 right-0 h-1 rounded bg-indigo-500" />}
      <div className={`overflow-hidden rounded-xl border-2 bg-white shadow-sm ${HEADER[step.type].split(" ")[0]}`}>
        <div className={`flex items-center gap-2 px-3 py-2 ${HEADER[step.type].split(" ")[1]}`}>
          <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} className="cursor-grab rounded p-0.5 text-slate-400 hover:text-slate-700 active:cursor-grabbing" aria-label="Drag to reorder"><GripVertical className="h-4 w-4" /></button>
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded ${t.color} text-white`}><t.icon className="h-3.5 w-3.5" /></span>
          <span className="text-sm font-semibold text-slate-900">{t.label}</span>
          {step.internal && <Lock className="h-3.5 w-3.5 text-amber-600" />}
          <span className="ml-auto text-sm text-slate-600">Step {index + 1}</span>
          <button type="button" onClick={onDuplicate} className="btn btn-ghost btn-sm px-1" aria-label="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onRemove} className="btn btn-ghost btn-sm px-1 hover:text-red-600" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => onChange({ open: !step.open })} className="btn btn-ghost btn-sm px-1" aria-label={step.open ? "Collapse" : "Edit details"}>{step.open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
        </div>
        <div className="px-4 py-3">
          <input
            value={step.title}
            onChange={(e) => onChange({ title: e.target.value })}
            autoFocus={step.open && !step.title}
            placeholder={step.type === "message" ? "Short label for this message" : `${t.label} title`}
            className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
          />
          {step.type !== "message" && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1 text-sm text-slate-600">
              <span>Assigned to:</span>
              <span className="badge bg-slate-100 text-slate-700">{assigneeLabel}</span>
              {step.due_in_days != null && <span className="text-xs text-slate-400">· due in {step.due_in_days}d{mode === "workspace" && dueDate ? ` (${formatDate(dueDate)})` : ""}</span>}
            </div>
          )}
          {step.open && (
            <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-6">
              <div className="sm:col-span-6">
                <label className="label">{step.type === "message" ? "Message" : "Instructions (optional)"}</label>
                <textarea value={step.description} onChange={(e) => onChange({ description: e.target.value })} rows={2} className="input" placeholder={step.type === "message" ? "The message to post, e.g. a welcome note explaining the next steps" : "What exactly needs to happen"} />
              </div>
              {step.type !== "message" && (
                <>
                  <div className="sm:col-span-2">
                    <label className="label">Due in (days)</label>
                    <input type="number" min={0} value={step.due_in_days ?? ""} onChange={(e) => onChange({ due_in_days: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} className="input" placeholder="No due date" />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="label">{step.type === "approval" ? "Approver" : "Assigned to"}</label>
                    <select
                      value={assignValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v.startsWith("user:")) onChange({ assignee_id: v.slice(5), assign_to: "" });
                        else if (v === "__none") onChange({ assignee_id: null, assign_to: "" });
                        else if (v === "__custom") { const name = window.prompt("New role name (e.g. Tax and Accounting)"); if (name?.trim()) { onAddRole(name.trim().slice(0, 60)); onChange({ assignee_id: null, assign_to: name.trim().slice(0, 60) }); } }
                        else onChange({ assignee_id: null, assign_to: v.slice(5) });
                      }}
                      className="input"
                    >
                      <optgroup label="Roles">
                        {roles.map((r) => <option key={r} value={`role:${r}`}>{r}{r === "Client" ? " (first client contact)" : r === "Manager" ? " (workspace owner)" : ""}</option>)}
                        <option value="__custom">New role…</option>
                      </optgroup>
                      {members.length > 0 && <optgroup label="Members">{members.map((m) => <option key={m.id} value={`user:${m.id}`}>{m.name}{m.role === "client" ? " (client)" : ""}</option>)}</optgroup>}
                      <option value="__none">Nobody</option>
                    </select>
                  </div>
                </>
              )}
              {step.type !== "approval" && (
                <div className="flex items-end sm:col-span-1">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={step.internal} onChange={(e) => onChange({ internal: e.target.checked })} className="rounded border-slate-300" /> Internal</label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
