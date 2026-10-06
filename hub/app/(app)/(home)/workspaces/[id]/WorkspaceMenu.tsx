"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ListChecks, MessageSquare, MoreHorizontal, Settings, Users } from "lucide-react";

export function WorkspaceMenu({ workspaceId, internal }: { workspaceId: string; internal: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const base = `/workspaces/${workspaceId}`;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="btn btn-secondary px-2.5" aria-label="Workspace menu" aria-expanded={open}><MoreHorizontal className="h-4 w-4" /></button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <Link href={`${base}/members`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50"><Users className="h-4 w-4 text-slate-400" /> Members</Link>
          <Link href={`${base}/tasks`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50"><ListChecks className="h-4 w-4 text-slate-400" /> All actions (list)</Link>
          <Link href={`${base}/chat`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50 lg:hidden"><MessageSquare className="h-4 w-4 text-slate-400" /> Chat</Link>
          {internal && <Link href={`${base}/settings`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4 text-slate-400" /> Settings</Link>}
        </div>
      )}
    </div>
  );
}
