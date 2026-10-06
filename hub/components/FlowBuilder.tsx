"use client";

import { useActionState, useMemo, useState } from "react";
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
import { CheckSquare, ChevronDown, ChevronUp, Copy, FileUp, GripVertical, Lock, MessageSquare, Plus, ShieldCheck, Trash2, type LucideIcon } from "lucide-react";
import { saveTemplate, buildProject } from "@/lib/actions/templates";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "./SubmitButton";
import { FormMessage } from "./FormMessage";
import { addDays, formatDate } from "@/lib/format";
import type { PublicUser, Template, TemplateStep, TemplateStepType } from "@/lib/types";

type Step = TemplateStep & { id: string; open: boolean };

const TYPES: Record<TemplateStepType, { label: string; hint: string; icon: LucideIcon; color: string; chip: string }> = {
  task: { label: "Task", hint: "Something your team or the client must do", icon: CheckSquare, color: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700" },
  file_request: { label: "File request", hint: "Ask someone to upload a document", icon: FileUp, color: "bg-sky-500", chip: "bg-sky-50 text-sky-700" },
  approval: { label: "Approval", hint: "A formal yes / no on a decision or document", icon: ShieldCheck, color: "bg-amber-500", chip: "bg-amber-50 text-amber-700" },
  message: { label: "Message", hint: "Post a message in the conversation", icon: MessageSquare, color: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
};
const ORDER: TemplateStepType[] = ["task", "file_request", "approval", "message"];

let counter = 0;
const uid = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;
const fresh = (type: TemplateStepType): Step => ({
  id: uid(),
  open: true,
  type,
  title: "",
  description: "",
  due_in_days: type === "message" ? null : 7,
  assign_to: type === "approval" ? "client" : "team",
  assignee_id: null,
  internal: false,
});
const hydrate = (steps: TemplateStep[]): Step[] => steps.map((s) => ({ ...s, id: uid(), open: false }));

export interface BuilderProps {
  mode: "template" | "workspace";
  template?: Pick<Template, "id" | "name" | "description">;
  initialSteps?: TemplateStep[];
  /** Workspace mode: real members to assign to, and flows to start from. */
  workspaceId?: string;
  workspaceName?: string;
  members?: PublicUser[];
  flows?: { id: string; name: string; steps: TemplateStep[] }[];
}

export function FlowBuilder(props: BuilderProps) {
  const action = props.mode === "workspace" ? buildProject.bind(null, props.workspaceId!) : saveTemplate;
  const [state, formAction] = useActionState(action, idle);
  const [steps, setSteps] = useState<Step[]>(() => hydrate(props.initialSteps ?? []));
  const [active, setActive] = useState<{ kind: "palette"; type: TemplateStepType } | { kind: "step"; step: Step } | null>(null);
  const [insertAt, setInsertAt] = useState<{ id: string; after: boolean } | null>(null);
  const [saveAsFlow, setSaveAsFlow] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collision: CollisionDetection = (args) => {
    if (args.active.data.current?.from === "palette") {
      const within = pointerWithin(args);
      const stepHits = within.filter((c) => c.id !== "canvas");
      if (stepHits.length) return stepHits;
      if (within.length) return within;
      return closestCenter(args);
    }
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id !== "canvas") });
  };

  const update = (id: string, patch: Partial<Step>) => setSteps((s) => s.map((st) => (st.id === id ? { ...st, ...patch } : st)));
  const remove = (id: string) => setSteps((s) => s.filter((st) => st.id !== id));
  const duplicate = (id: string) =>
    setSteps((s) => {
      const i = s.findIndex((st) => st.id === id);
      if (i < 0) return s;
      const copy = { ...s[i]!, id: uid(), open: false };
      return [...s.slice(0, i + 1), copy, ...s.slice(i + 1)];
    });
  const append = (type: TemplateStepType) => setSteps((s) => [...s.map((st) => ({ ...st, open: false })), fresh(type)]);

  function placement(e: DragOverEvent | DragEndEvent): { id: string; after: boolean } | null {
    const { over, active } = e;
    if (!over || over.id === "canvas") return null;
    const rect = active.rect.current.translated;
    if (!rect) return { id: String(over.id), after: false };
    const centerY = rect.top + rect.height / 2;
    return { id: String(over.id), after: centerY > over.rect.top + over.rect.height / 2 };
  }

  function onDragStart(e: DragStartEvent) {
    const d = e.active.data.current;
    if (d?.from === "palette") setActive({ kind: "palette", type: d.type as TemplateStepType });
    else {
      const step = steps.find((s) => s.id === e.active.id);
      if (step) setActive({ kind: "step", step });
    }
  }
  function onDragOver(e: DragOverEvent) {
    if (e.active.data.current?.from === "palette") setInsertAt(placement(e));
  }
  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    setActive(null);
    setInsertAt(null);
    if (!over) return;
    if (a.data.current?.from === "palette") {
      const step = fresh(a.data.current.type as TemplateStepType);
      const place = placement(e);
      setSteps((s) => {
        const closed = s.map((st) => ({ ...st, open: false }));
        if (!place) return [...closed, step];
        const i = closed.findIndex((st) => st.id === place.id);
        if (i < 0) return [...closed, step];
        const at = place.after ? i + 1 : i;
        return [...closed.slice(0, at), step, ...closed.slice(at)];
      });
      return;
    }
    if (a.id !== over.id) {
      setSteps((s) => {
        const from = s.findIndex((st) => st.id === a.id);
        const to = s.findIndex((st) => st.id === over.id);
        return from < 0 || to < 0 ? s : arrayMove(s, from, to);
      });
    }
  }

  const payload = useMemo(
    () => JSON.stringify(steps.map(({ id: _id, open: _open, ...rest }) => { void _id; void _open; return rest; })),
    [steps],
  );
  const titled = steps.filter((s) => s.title.trim()).length;

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActive(null); setInsertAt(null); }}>
      <form action={formAction} className="grid gap-5 lg:grid-cols-[15rem_1fr]">
        <input type="hidden" name="steps" value={payload} />
        {props.template && <input type="hidden" name="id" value={props.template.id} />}

        {/* Palette */}
        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Steps</p>
            <p className="mb-3 text-xs text-slate-500">Drag a step onto the plan, or click to add it at the end.</p>
            <div className="space-y-1.5">
              {ORDER.map((t) => <PaletteItem key={t} type={t} onAdd={() => append(t)} />)}
            </div>
          </div>
          {props.mode === "workspace" && props.flows && props.flows.length > 0 && (
            <div className="card p-3">
              <label className="label">Start from a flow</label>
              <select
                className="input"
                defaultValue=""
                onChange={(e) => {
                  const f = props.flows!.find((x) => x.id === e.target.value);
                  if (!f) return;
                  if (steps.length && !window.confirm("Replace the current steps with this flow?")) {
                    e.target.value = "";
                    return;
                  }
                  setSteps(hydrate(f.steps));
                }}
              >
                <option value="">Choose a flow…</option>
                {props.flows.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.steps.length})</option>)}
              </select>
            </div>
          )}
        </aside>

        {/* Canvas */}
        <div className="space-y-4">
          {props.mode === "template" && (
            <div className="card grid gap-3 p-4 sm:grid-cols-2">
              <div>
                <label className="label">Flow name</label>
                <input name="name" defaultValue={props.template?.name} required className="input" placeholder="e.g. Company incorporation" />
              </div>
              <div>
                <label className="label">Description</label>
                <input name="description" defaultValue={props.template?.description} className="input" placeholder="When to use this flow" />
              </div>
            </div>
          )}

          <Canvas empty={steps.length === 0}>
            <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {steps.map((step, i) => (
                <StepCard
                  key={step.id}
                  step={step}
                  index={i}
                  mode={props.mode}
                  members={props.members ?? []}
                  indicator={insertAt?.id === step.id ? (insertAt.after ? "after" : "before") : null}
                  onChange={(patch) => update(step.id, patch)}
                  onRemove={() => remove(step.id)}
                  onDuplicate={() => duplicate(step.id)}
                />
              ))}
            </SortableContext>
          </Canvas>

          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="text-sm text-slate-600">
              {props.mode === "workspace" ? (
                <>
                  <span className="font-medium text-slate-900">{steps.length} {steps.length === 1 ? "step" : "steps"}</span> will be created in <span className="font-medium text-slate-900">{props.workspaceName}</span>.
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input type="checkbox" name="save_as_flow" checked={saveAsFlow} onChange={(e) => setSaveAsFlow(e.target.checked)} className="rounded border-slate-300" />
                    Also save as a reusable flow
                    {saveAsFlow && <input name="flow_name" className="input w-56 py-1 text-xs" placeholder="Flow name" required />}
                  </label>
                </>
              ) : (
                <><span className="font-medium text-slate-900">{steps.length} {steps.length === 1 ? "step" : "steps"}</span> · due dates count from the day the flow is applied.</>
              )}
              {titled < steps.length && <p className="mt-1 text-xs text-amber-700">{steps.length - titled} step{steps.length - titled === 1 ? " has" : "s have"} no title yet.</p>}
            </div>
            <div className="flex items-center gap-3">
              <FormMessage state={state} />
              <SubmitButton pendingText="Saving…">
                {props.mode === "workspace" ? `Create ${steps.length || ""} step${steps.length === 1 ? "" : "s"}` : props.template ? "Save flow" : "Create flow"}
              </SubmitButton>
            </div>
          </div>
        </div>
      </form>

      <DragOverlay dropAnimation={null}>
        {active?.kind === "palette" && <PaletteGhost type={active.type} />}
        {active?.kind === "step" && <StepGhost step={active.step} />}
      </DragOverlay>
    </DndContext>
  );
}

function PaletteItem({ type, onAdd }: { type: TemplateStepType; onAdd: () => void }) {
  const t = TYPES[type];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette-${type}`, data: { from: "palette", type } });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`flex cursor-grab items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left shadow-sm transition hover:border-indigo-300 active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`} title={t.hint}>
      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white ${t.color}`}><t.icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{t.label}</span>
        <span className="block truncate text-[11px] text-slate-500">{t.hint}</span>
      </span>
      <button type="button" onClick={onAdd} onPointerDown={(e) => e.stopPropagation()} className="btn btn-ghost btn-sm px-1.5" aria-label={`Add ${t.label}`}><Plus className="h-4 w-4" /></button>
    </div>
  );
}

function PaletteGhost({ type }: { type: TemplateStepType }) {
  const t = TYPES[type];
  return (
    <div className="flex w-56 items-center gap-2.5 rounded-lg border border-indigo-300 bg-white px-2.5 py-2 shadow-lg">
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-white ${t.color}`}><t.icon className="h-4 w-4" /></span>
      <span className="text-sm font-medium text-slate-900">{t.label}</span>
    </div>
  );
}

function StepGhost({ step }: { step: Step }) {
  const t = TYPES[step.type];
  return (
    <div className="flex w-[32rem] max-w-[90vw] items-center gap-3 rounded-xl border border-indigo-300 bg-white px-3 py-2.5 shadow-lg">
      <GripVertical className="h-4 w-4 text-slate-400" />
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-white ${t.color}`}><t.icon className="h-4 w-4" /></span>
      <span className="truncate text-sm font-medium text-slate-900">{step.title || `Untitled ${t.label.toLowerCase()}`}</span>
    </div>
  );
}

function Canvas({ empty, children }: { empty: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas" });
  return (
    <div ref={setNodeRef} className={`min-h-[12rem] rounded-xl border-2 border-dashed p-3 transition ${isOver && empty ? "border-indigo-400 bg-indigo-50/50" : "border-slate-200 bg-slate-50/50"}`}>
      {empty ? (
        <div className="flex h-44 flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-slate-700">Your plan is empty</p>
          <p className="mt-1 text-xs text-slate-500">Drag steps from the left, in the order they should happen.</p>
        </div>
      ) : (
        <ol className="space-y-2">{children}</ol>
      )}
    </div>
  );
}

function StepCard({ step, index, mode, members, indicator, onChange, onRemove, onDuplicate }: {
  step: Step;
  index: number;
  mode: "template" | "workspace";
  members: PublicUser[];
  indicator: "before" | "after" | null;
  onChange: (patch: Partial<Step>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const t = TYPES[step.type];
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: step.id, data: { from: "canvas" } });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const assignValue = step.assignee_id ? `user:${step.assignee_id}` : step.assign_to;
  const dueDate = step.due_in_days == null ? null : addDays(step.due_in_days);
  const assigneeLabel = step.assignee_id
    ? members.find((m) => m.id === step.assignee_id)?.name ?? "Member"
    : step.assign_to === "team" ? "workspace owner" : step.assign_to === "client" ? "first client contact" : "nobody";

  return (
    <li ref={setNodeRef} style={style} className={`relative ${isDragging ? "opacity-40" : ""}`}>
      {indicator === "before" && <span className="absolute -top-1.5 left-2 right-2 h-0.5 rounded bg-indigo-500" />}
      {indicator === "after" && <span className="absolute -bottom-1.5 left-2 right-2 h-0.5 rounded bg-indigo-500" />}
      <div className="card">
        <div className="flex items-center gap-2 px-2 py-2">
          <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} className="cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing" aria-label="Drag to reorder">
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="w-5 text-right text-xs font-semibold text-slate-400">{index + 1}</span>
          <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white ${t.color}`} title={t.label}><t.icon className="h-4 w-4" /></span>
          <input
            value={step.title}
            onChange={(e) => onChange({ title: e.target.value })}
            autoFocus={step.open && !step.title}
            placeholder={`${t.label} title`}
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-slate-900 placeholder:font-normal placeholder:text-slate-400 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
          />
          <span className="hidden items-center gap-2 text-[11px] text-slate-500 sm:flex">
            <span className={`badge ${t.chip}`}>{t.label}</span>
            {step.type !== "message" && (
              <span>{step.due_in_days == null ? "no due date" : `${step.due_in_days}d${dueDate && mode === "workspace" ? ` · ${formatDate(dueDate)}` : ""}`}</span>
            )}
            {step.type !== "message" && <span>→ {assigneeLabel}</span>}
            {step.internal && <Lock className="h-3 w-3 text-amber-500" />}
          </span>
          <button type="button" onClick={onDuplicate} className="btn btn-ghost btn-sm px-1.5 text-slate-400" aria-label="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onRemove} className="btn btn-ghost btn-sm px-1.5 text-slate-400 hover:text-red-600" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => onChange({ open: !step.open })} className="btn btn-ghost btn-sm px-1.5" aria-label={step.open ? "Collapse" : "Edit details"}>
            {step.open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
        {step.open && (
          <div className="grid gap-3 border-t border-slate-100 px-4 py-3 sm:grid-cols-6">
            <div className="sm:col-span-6">
              <label className="label">{step.type === "message" ? "Message" : "Instructions (optional)"}</label>
              <textarea value={step.description} onChange={(e) => onChange({ description: e.target.value })} rows={2} className="input" placeholder={step.type === "message" ? "The message to post, e.g. a welcome note explaining the next steps" : "What exactly needs to happen"} />
            </div>
            {step.type !== "message" && (
              <>
                <div className="sm:col-span-2">
                  <label className="label">Due in (days)</label>
                  <input type="number" min={0} value={step.due_in_days ?? ""} onChange={(e) => onChange({ due_in_days: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} className="input" placeholder="No due date" />
                  {dueDate && mode === "workspace" && <p className="mt-1 text-xs text-slate-400">{formatDate(dueDate)}</p>}
                </div>
                <div className="sm:col-span-3">
                  <label className="label">{step.type === "approval" ? "Approver" : "Assign to"}</label>
                  <select
                    value={assignValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v.startsWith("user:")) onChange({ assignee_id: v.slice(5), assign_to: "none" });
                      else onChange({ assignee_id: null, assign_to: v as TemplateStep["assign_to"] });
                    }}
                    className="input"
                  >
                    <option value="team">Workspace owner (team)</option>
                    <option value="client">First client contact</option>
                    <option value="none">Nobody</option>
                    {members.length > 0 && (
                      <optgroup label="Members">
                        {members.map((m) => <option key={m.id} value={`user:${m.id}`}>{m.name}{m.role === "client" ? " (client)" : ""}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
              </>
            )}
            {step.type !== "approval" && (
              <div className="flex items-end sm:col-span-1">
                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={step.internal} onChange={(e) => onChange({ internal: e.target.checked })} className="rounded border-slate-300" /> Internal
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
