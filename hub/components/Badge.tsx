import type { ApprovalStatus, TaskPriority, TaskStatus, WorkspaceStatus } from "@/lib/types";

type Tone = "slate" | "green" | "amber" | "red" | "indigo" | "sky" | "violet";
const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  indigo: "bg-indigo-50 text-indigo-700",
  sky: "bg-sky-50 text-sky-700",
  violet: "bg-violet-50 text-violet-700",
};

export function Badge({ tone = "slate", children, className = "" }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={`badge ${TONES[tone]} ${className}`}>{children}</span>;
}

export function WorkspaceStatusBadge({ status }: { status: WorkspaceStatus }) {
  const map: Record<WorkspaceStatus, [Tone, string]> = {
    active: ["green", "Active"],
    on_hold: ["amber", "On hold"],
    completed: ["indigo", "Completed"],
    archived: ["slate", "Archived"],
  };
  const [tone, label] = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const map: Record<TaskStatus, [Tone, string]> = { todo: ["slate", "To do"], in_progress: ["sky", "In progress"], done: ["green", "Done"] };
  const [tone, label] = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (priority === "normal") return null;
  return <Badge tone={priority === "high" ? "red" : "slate"}>{priority === "high" ? "High" : "Low"}</Badge>;
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const map: Record<ApprovalStatus, [Tone, string]> = {
    pending: ["amber", "Pending"],
    approved: ["green", "Approved"],
    rejected: ["red", "Rejected"],
    cancelled: ["slate", "Cancelled"],
  };
  const [tone, label] = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function InternalBadge() {
  return (
    <Badge tone="amber" className="ring-1 ring-amber-200/60">
      Internal
    </Badge>
  );
}
