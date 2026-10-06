"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, Briefcase, ChevronDown, LayoutTemplate, LogOut, MessageSquare, Plus, Search, Settings } from "lucide-react";
import { Avatar } from "./Avatar";
import { logout } from "@/lib/actions/auth";
import { roleLabel } from "@/lib/format";
import type { PublicUser } from "@/lib/types";

export interface NavCounts {
  unread: number;
  messages: number;
}

const SECTIONS = [
  { key: "home", href: "/", label: "Home", match: (p: string) => p === "/" || p.startsWith("/workspaces") || p === "/summary" },
  { key: "library", href: "/templates", label: "Library", match: (p: string) => p.startsWith("/templates") },
  { key: "manage", href: "/manage/workspaces", label: "Manage", match: (p: string) => p.startsWith("/manage") || p.startsWith("/clients") || p.startsWith("/tasks") || p.startsWith("/approvals") },
  { key: "admin", href: "/admin", label: "Admin", match: (p: string) => p.startsWith("/admin") || p.startsWith("/team") },
];

export function TopNav({ user, counts, appName, orgName, logoUrl }: { user: PublicUser; counts: NavCounts; appName: string; orgName: string; logoUrl?: string }) {
  const pathname = usePathname();
  const internal = user.role !== "client";
  const sections = SECTIONS.filter((s) => (s.key === "home") || (internal && s.key !== "admin") || (user.role === "admin"));
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="flex h-14 items-center gap-3 px-4 md:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={orgName} className="h-8 w-auto" />
          ) : (
            <>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">{appName[0]}</span>
              <span className="hidden leading-tight sm:block">
                <span className="block text-sm font-semibold text-slate-900">{appName}</span>
                <span className="block text-[10px] uppercase tracking-wide text-slate-500">{orgName}</span>
              </span>
            </>
          )}
        </Link>
        <nav className="mx-auto flex items-center gap-1 overflow-x-auto">
          {sections.map((s) => {
            const active = s.match(pathname);
            return (
              <Link key={s.key} href={s.href} className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${active ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`} aria-current={active ? "page" : undefined}>
                {s.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          {internal && <NewMenu />}
          {internal && (
            <Link href="/search" className="btn btn-ghost px-2" aria-label="Search" title="Search"><Search className="h-5 w-5" /></Link>
          )}
          <Link href="/notifications" className="btn btn-ghost relative px-2" aria-label="Notifications" title="Notifications">
            <Bell className="h-5 w-5" />
            {counts.unread > 0 && <Dot n={counts.unread} />}
          </Link>
          <Link href="/messages" className="btn btn-ghost relative px-2" aria-label="Messages" title="Messages">
            <MessageSquare className="h-5 w-5" />
            {counts.messages > 0 && <Dot n={counts.messages} />}
          </Link>
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}

function Dot({ n }: { n: number }) {
  return <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">{n > 99 ? "99+" : n}</span>;
}

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, close]);
  return ref;
}

function NewMenu() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  const items = [
    { href: "/workspaces/new", label: "Workspace", hint: "A project for a client", icon: Briefcase },
    { href: "/clients/new", label: "Client", hint: "A company and its contacts", icon: Building2 },
    { href: "/templates/new", label: "Flow template", hint: "A reusable set of steps", icon: LayoutTemplate },
  ];
  return (
    <div ref={ref} className="relative mr-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="btn btn-primary btn-sm" aria-expanded={open}><Plus className="h-4 w-4" /> New <ChevronDown className="h-3 w-3 opacity-70" /></button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {items.map((it) => (
            <Link key={it.href} href={it.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-slate-50">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><it.icon className="h-4 w-4" /></span>
              <span><span className="block text-sm font-medium text-slate-900">{it.label}</span><span className="block text-[11px] text-slate-500">{it.hint}</span></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ user }: { user: PublicUser }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative ml-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="relative rounded-full ring-2 ring-transparent transition hover:ring-indigo-200" aria-label="Account menu" aria-expanded={open}>
        <Avatar name={user.name} color={user.color} size="md" />
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.title || roleLabel(user.role)}</p>
          </div>
          <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4 text-slate-400" /> Settings</Link>
          <form action={logout}>
            <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><LogOut className="h-4 w-4 text-slate-400" /> Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
