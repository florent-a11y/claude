"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Briefcase, Layers, Plus, Search } from "lucide-react";
import { timeAgo } from "@/lib/format";
import type { WorkspaceWithMeta } from "@/lib/types";

/** The left-hand workspace list (Moxo-style): Workspaces | Summary switch, filter, progress badge and last-activity preview. */
export function WorkspaceList({ workspaces, canCreate }: { workspaces: WorkspaceWithMeta[]; canCreate: boolean }) {
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return workspaces.filter((w) => (archived ? w.status === "archived" || w.status === "completed" : w.status === "active" || w.status === "on_hold") && (!t || `${w.name} ${w.client_name ?? ""}`.toLowerCase().includes(t)));
  }, [workspaces, q, archived]);
  const onSummary = pathname === "/summary";

  return (
    <div className="card flex h-[calc(100vh-5.5rem)] min-h-[24rem] flex-col">
      <div className="flex items-center border-b border-slate-200 px-2">
        <Link href="/" className={`tab px-2 ${!onSummary ? "tab-active" : ""}`}>Workspaces</Link>
        <Link href="/summary" className={`tab ml-3 px-2 ${onSummary ? "tab-active" : ""}`}>Summary</Link>
        {canCreate && <Link href="/workspaces/new" className="btn btn-ghost btn-sm ml-auto px-2" title="New workspace" aria-label="New workspace"><Plus className="h-4 w-4" /></Link>}
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="input py-1.5 pl-8 text-xs" />
        </div>
        <button type="button" onClick={() => setArchived((a) => !a)} className={`btn btn-ghost px-2 ${archived ? "bg-slate-100 text-slate-900" : ""}`} title={archived ? "Showing completed & archived" : "Show completed & archived"} aria-pressed={archived}>
          <Archive className="h-4 w-4" />
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {list.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-slate-500"><Briefcase className="mx-auto mb-2 h-5 w-5 text-slate-300" />{archived ? "Nothing completed or archived." : "No open workspaces."}</li>
        )}
        {list.map((w) => {
          const active = pathname === `/workspaces/${w.id}` || pathname.startsWith(`/workspaces/${w.id}/`);
          const total = w.open_tasks + w.done_tasks + w.pending_approvals + w.decided_approvals;
          const done = w.done_tasks + w.decided_approvals;
          const preview = w.last_body
            ? `${w.last_author ? `${w.last_author}${w.last_kind === "system" ? " " : ": "}` : ""}${w.last_body}`
            : w.description || "No activity yet";
          return (
            <li key={w.id} className="border-b border-slate-100">
              <Link href={`/workspaces/${w.id}`} className={`flex items-start gap-3 px-3 py-3 ${active ? "bg-indigo-50/70" : "hover:bg-slate-50"}`} aria-current={active ? "page" : undefined}>
                <HexIcon color={w.client_color ?? "#64748b"} badge={total ? `${done}/${total}` : w.status === "active" ? "NEW" : undefined} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    <span className={`truncate text-sm ${active ? "font-semibold text-slate-900" : "font-medium text-slate-900"}`}>{w.name}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500">{preview}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(w.last_activity_at)}</span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Hexagonal workspace icon with an optional progress badge, like Moxo's. */
export function HexIcon({ color, badge, size = 48 }: { color: string; badge?: string; size?: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size + 10 }}>
      <span className="absolute inset-x-0 top-0 flex items-center justify-center text-white" style={{ height: size, background: `linear-gradient(160deg, ${color}, ${shade(color)})`, clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}>
        <Layers style={{ width: size * 0.42, height: size * 0.42 }} />
      </span>
      {badge && (
        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white ring-2 ring-white">{badge}</span>
      )}
    </span>
  );
}

function shade(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = Math.max(0, ((n >> 16) & 255) - 50), g = Math.max(0, ((n >> 8) & 255) - 50), b = Math.max(0, (n & 255) - 50);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
