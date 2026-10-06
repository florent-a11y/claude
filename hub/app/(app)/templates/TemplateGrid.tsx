"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Clock, MoreHorizontal, Pencil, Search, Trash2, Users } from "lucide-react";
import { HexIcon } from "@/components/WorkspaceList";
import { deleteTemplate } from "@/lib/actions/templates";
import { formatDate, pickColor, timeAgo } from "@/lib/format";
import type { TemplateListRow } from "@/lib/queries/templates";

export function TemplateGrid({ templates, meName }: { templates: TemplateListRow[]; meName: string }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"used" | "name">("used");
  const [menu, setMenu] = useState<string | null>(null);
  const [, start] = useTransition();
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const rows = templates.filter((x) => !t || x.name.toLowerCase().includes(t));
    return sort === "name" ? rows : [...rows].sort((a, b) => (b.last_used_at ?? b.created_at).localeCompare(a.last_used_at ?? a.created_at));
  }, [templates, q, sort]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name" className="input w-72 pl-9" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as "used" | "name")} className="input w-auto">
          <option value="used">Last Used</option>
          <option value="name">Name</option>
        </select>
      </div>
      {list.length === 0 ? (
        <p className="card px-5 py-10 text-center text-sm text-slate-500">No templates match.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => (
            <div key={t.id} className="card relative flex flex-col p-5">
              <div className="flex items-start gap-3">
                <Link href={`/templates/${t.id}`}><HexIcon color={pickColor(t.name)} size={52} /></Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/templates/${t.id}`} className="block truncate text-lg font-semibold text-slate-900 hover:text-indigo-700">{t.name}</Link>
                  <p className="text-sm text-slate-500">By {t.creator_name ?? "—"}{t.creator_name === meName ? " (You)" : ""} | {t.step_count} Steps</p>
                </div>
              </div>
              <p className={`mt-3 line-clamp-2 text-sm ${t.description ? "text-slate-700" : "text-slate-400"}`}>{t.description || "No description"}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="badge bg-white text-slate-600 ring-1 ring-slate-200"><Users className="h-3.5 w-3.5" /> Shared</span>
                <span className="badge bg-white text-slate-600 ring-1 ring-slate-200" title={t.last_used_at ? formatDate(t.last_used_at) : `Created ${formatDate(t.created_at)}`}><Clock className="h-3.5 w-3.5" /> {t.last_used_at ? `Last used ${timeAgo(t.last_used_at)}` : "Not used yet"}</span>
                <div className="relative ml-auto">
                  <button type="button" onClick={() => setMenu(menu === t.id ? null : t.id)} className="btn btn-ghost px-2" aria-label="More" aria-expanded={menu === t.id}><MoreHorizontal className="h-4 w-4" /></button>
                  {menu === t.id && (
                    <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                      <Link href={`/templates/${t.id}`} className="flex items-center gap-2 rounded px-2.5 py-1.5 text-sm hover:bg-slate-50"><Pencil className="h-3.5 w-3.5 text-slate-400" /> Edit</Link>
                      <button type="button" onClick={() => { if (window.confirm(`Delete the flow "${t.name}"? Workspaces that already used it are not affected.`)) start(async () => { await deleteTemplate(t.id); }); setMenu(null); }} className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
