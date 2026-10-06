"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { Thread } from "./Thread";
import { postMessage } from "@/lib/actions/messages";
import { formatTime } from "@/lib/format";
import type { MessageWithMeta } from "@/lib/types";

/** The workspace conversation: chat bubbles plus grey system lines for tasks, files and approvals. */
export function Conversation({ workspaceId, initial, me, canInternal }: {
  workspaceId: string;
  initial: MessageWithMeta[];
  me: { id: string; name: string; color: string };
  canInternal: boolean;
}) {
  return (
    <Thread
      initial={initial}
      meId={me.id}
      pollUrl={`/api/workspaces/${workspaceId}/messages`}
      send={(fd) => postMessage(workspaceId, fd)}
      canInternal={canInternal}
      renderItem={(m) => (m.kind === "system" ? <SystemLine m={m} workspaceId={workspaceId} /> : undefined)}
    />
  );
}

function SystemLine({ m, workspaceId }: { m: MessageWithMeta; workspaceId: string }) {
  const href = m.ref_type === "task" ? `/workspaces/${workspaceId}/tasks` : m.ref_type === "approval" ? `/workspaces/${workspaceId}/approvals` : m.ref_type === "file" ? `/workspaces/${workspaceId}/files` : null;
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
