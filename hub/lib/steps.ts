import { BadgeCheck, FileUp, ListChecks, MessageSquare, Stamp, type LucideIcon } from "lucide-react";
import type { ApprovalWithMeta, TaskWithMeta } from "./types";

export type StepKind = "task" | "file_request" | "acknowledgement" | "approval";
export type StepStatus = "not_started" | "in_progress" | "completed" | "rejected" | "cancelled";

/** One row of a workspace's Flow tab: a to-do, file request, acknowledgement or approval in a common shape. */
export interface Step {
  id: string;
  kind: StepKind;
  title: string;
  description: string;
  status: StepStatus;
  assignee: { id: string; name: string; color: string | null } | null;
  due_date: string | null;
  internal: boolean;
  created_at: string;
  created_by: string | null;
  /** Approvals: who asked. */
  requester: string | null;
  decision_note: string;
  file_id: string | null;
  file_name: string | null;
}

export const STEP_TYPES: Record<StepKind | "message", { label: string; icon: LucideIcon; color: string; tint: string; text: string; hint: string }> = {
  approval: { label: "Approval", icon: Stamp, color: "bg-teal-700", tint: "bg-teal-50", text: "text-teal-700", hint: "A formal yes or no on a decision or document" },
  acknowledgement: { label: "Acknowledgement", icon: BadgeCheck, color: "bg-amber-700", tint: "bg-amber-50", text: "text-amber-700", hint: "Ask someone to confirm they have read something" },
  file_request: { label: "File Request", icon: FileUp, color: "bg-green-700", tint: "bg-green-50", text: "text-green-700", hint: "Ask someone to upload a document" },
  task: { label: "To-Do", icon: ListChecks, color: "bg-rose-700", tint: "bg-rose-50", text: "text-rose-700", hint: "Something to be done, with an owner and a date" },
  message: { label: "Message", icon: MessageSquare, color: "bg-indigo-600", tint: "bg-indigo-50", text: "text-indigo-700", hint: "Post a message in the chat" },
};

export const STATUS_LABEL: Record<StepStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export function taskToStep(t: TaskWithMeta): Step {
  return {
    id: t.id,
    kind: t.kind,
    title: t.title,
    description: t.description,
    status: t.status === "done" ? "completed" : t.status === "in_progress" ? "in_progress" : "not_started",
    assignee: t.assignee_id && t.assignee_name ? { id: t.assignee_id, name: t.assignee_name, color: t.assignee_color } : null,
    due_date: t.due_date,
    internal: !!t.internal,
    created_at: t.created_at,
    created_by: t.created_by,
    requester: null,
    decision_note: "",
    file_id: null,
    file_name: null,
  };
}

export function approvalToStep(a: ApprovalWithMeta): Step {
  return {
    id: a.id,
    kind: "approval",
    title: a.title,
    description: a.description,
    status: a.status === "approved" ? "completed" : a.status === "rejected" ? "rejected" : a.status === "cancelled" ? "cancelled" : "not_started",
    assignee: a.approver_id && a.approver_name ? { id: a.approver_id, name: a.approver_name, color: a.approver_color } : null,
    due_date: a.due_date,
    internal: false,
    created_at: a.created_at,
    created_by: a.requested_by,
    requester: a.requester_name,
    decision_note: a.decision_note,
    file_id: a.file_id,
    file_name: a.file_name,
  };
}

/** Tasks and approvals of a workspace as one ordered list of steps. */
export function toSteps(tasks: TaskWithMeta[], approvals: ApprovalWithMeta[]): Step[] {
  return [...tasks.map(taskToStep), ...approvals.map(approvalToStep)].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}
