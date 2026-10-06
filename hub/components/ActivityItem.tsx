import Link from "next/link";
import { Avatar } from "./Avatar";
import { InternalBadge } from "./Badge";
import { timeAgo } from "@/lib/format";
import type { MessageWithMeta } from "@/lib/types";

export function ActivityItem({ m }: { m: MessageWithMeta & { workspace_name: string; client_name: string | null } }) {
  const who = m.user_name ?? "Someone";
  return (
    <li className="flex gap-3 px-4 py-3">
      <Avatar name={who} color={m.user_color} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">{who}</span>{" "}
          {m.kind === "system" ? m.body : <>wrote: <span className="text-slate-600">“{m.body.slice(0, 140)}{m.body.length > 140 ? "…" : ""}”</span></>}
          {m.file_name && m.kind === "text" && <span className="text-slate-500"> (attached {m.file_name})</span>}
          {!!m.internal && <> <InternalBadge /></>}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          <Link href={`/workspaces/${m.workspace_id}`} className="hover:text-indigo-600 hover:underline">
            {m.client_name ? `${m.client_name} · ` : ""}{m.workspace_name}
          </Link>{" "}
          · {timeAgo(m.created_at)}
        </p>
      </div>
    </li>
  );
}
