"use client";

import { useActionState, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { createConversation } from "@/lib/actions/dm";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";
import { Avatar } from "@/components/Avatar";
import type { PublicUser } from "@/lib/types";

export function NewConversationForm({ people }: { people: (PublicUser & { client_name: string | null })[] }) {
  const [state, action] = useActionState(createConversation, idle);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? people.filter((p) => `${p.name} ${p.email} ${p.client_name ?? ""} ${p.title}`.toLowerCase().includes(t)) : people;
  }, [people, q]);
  const team = filtered.filter((p) => p.role !== "client");
  const clients = filtered.filter((p) => p.role === "client");
  const toggle = (id: string) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const Row = ({ p }: { p: (typeof people)[number] }) => (
    <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-slate-50 ${picked.includes(p.id) ? "bg-indigo-50" : ""}`}>
      <input type="checkbox" name="member_ids" value={p.id} checked={picked.includes(p.id)} onChange={() => toggle(p.id)} className="rounded border-slate-300" />
      <Avatar name={p.name} color={p.color} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900">{p.name}</span>
        <span className="block truncate text-xs text-slate-500">{p.role === "client" ? (p.client_name ?? "Client") : p.title || "Team"}{p.title && p.role === "client" ? ` · ${p.title}` : ""}</span>
      </span>
    </label>
  );

  return (
    <form action={action} className="card flex h-[calc(100vh-9rem)] min-h-[24rem] flex-col">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">New message</h2>
        <p className="text-xs text-slate-500">Pick one person for a direct conversation, or several for a group.</p>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="input pl-9" autoFocus />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {team.length > 0 && <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Team</p>}
        {team.map((p) => <Row key={p.id} p={p} />)}
        {clients.length > 0 && <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Client contacts</p>}
        {clients.map((p) => <Row key={p.id} p={p} />)}
        {!filtered.length && <p className="px-3 py-6 text-center text-sm text-slate-500">Nobody matches.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3">
        {picked.length > 1 && <input name="title" className="input w-56" placeholder="Group name (optional)" />}
        <span className="text-xs text-slate-500">{picked.length ? `${picked.length} selected` : "Nobody selected"}</span>
        <FormMessage state={state} />
        <span className="ml-auto"><SubmitButton pendingText="Opening…">{picked.length > 1 ? "Create group" : "Start conversation"}</SubmitButton></span>
      </div>
    </form>
  );
}
