"use client";

import Link from "next/link";
import { FileText, Lock } from "lucide-react";
import { Thread } from "./Thread";
import { type BubbleReference, MessageBubble } from "./MessageBubble";
import { postMessage } from "@/lib/actions/messages";
import { formatTime } from "@/lib/format";
import { STEP_TYPES } from "@/lib/steps";
import type { MessageWithMeta, Role } from "@/lib/types";

/** The workspace chat: messages (with "Re: <step>" references when they are comments on a step) and grey event lines. */
export function Conversation({ workspaceId, initial, me, canInternal, className }: {
  workspaceId: string;
  initial: MessageWithMeta[];
  me: { id: string; name: string; color: string; role: Role };
  canInternal: boolean;
  className?: string;
}) {
  return (
    <Thread
      initial={initial}
      meId={me.id}
      pollUrl={`/api/workspaces/${workspaceId}/messages`}
      send={(fd) => postMessage(workspaceId, fd)}
      canInternal={canInternal}
      placeholder="Send message… (Shift + Enter to insert a new line)"
      emptyText="No messages yet. Say hello to kick things off."
      className={className ?? "h-full border-0 shadow-none"}
      mergeIncoming={(prev, fresh) => {
        const updates = new Map(fresh.filter((f) => f.ref_id && f.ref).map((f) => [f.ref_id!, f.ref!]));
        return updates.size ? prev.map((m) => (m.ref_id && updates.has(m.ref_id) ? { ...m, ref: updates.get(m.ref_id)! } : m)) : prev;
      }}
      renderItem={(m, mine) => {
        if (m.kind === "system") return <SystemLine m={m} workspaceId={workspaceId} />;
        if (m.ref) return <MessageBubble m={m} mine={mine} reference={referenceOf(m)} />;
        return undefined;
      }}
    />
  );
}

function referenceOf(m: MessageWithMeta): BubbleReference | undefined {
  const r = m.ref;
  if (!r) return undefined;
  if (r.kind === "task") {
    const t = STEP_TYPES[r.task.kind];
    return { title: r.task.title, sub: `${t.label}${r.task.assignee_name ? ` · ${r.task.assignee_name}` : ""}`, icon: t.icon, tone: t.color };
  }
  if (r.kind === "approval") {
    const t = STEP_TYPES.approval;
    return { title: r.approval.title, sub: `${t.label}${r.approval.approver_name ? ` · ${r.approval.approver_name}` : ""}`, icon: t.icon, tone: t.color };
  }
  return { title: r.file.name, sub: "File", icon: FileText, tone: "bg-slate-500" };
}

function SystemLine({ m, workspaceId }: { m: MessageWithMeta; workspaceId: string }) {
  const href = m.ref_type === "task" || m.ref_type === "approval" ? `/workspaces/${workspaceId}?step=${m.ref_id}` : m.ref_type === "file" ? `/workspaces/${workspaceId}/files` : null;
  const content = (
    <>
      <span className="font-medium text-slate-600">{m.user_name ?? "System"}</span> {m.body}
      {!!m.internal && <Lock className="ml-1 inline h-3 w-3 text-amber-500" />}
      <span className="ml-2 text-slate-300">{formatTime(m.created_at)}</span>
    </>
  );
  return (
    <div className="py-1 text-center text-xs text-slate-400">
      {href ? <Link href={href} className="hover:text-indigo-600">{content}</Link> : content}
    </div>
  );
}
