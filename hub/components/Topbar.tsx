import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Avatar } from "./Avatar";
import { NavLink } from "./NavLink";
import { navItems } from "./Sidebar";
import { isInternal } from "@/lib/auth";
import type { PublicUser } from "@/lib/types";

export function Topbar({ user, counts }: { user: PublicUser; counts: { tasks: number; approvals: number; unread: number } }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        {isInternal(user) ? (
          <form action="/search" className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input name="q" type="search" placeholder="Search workspaces and clients…" className="input pl-9" autoComplete="off" />
          </form>
        ) : (
          <div className="flex-1" />
        )}
        <Link href="/notifications" className="btn btn-ghost relative px-2" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {counts.unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
              {counts.unread > 99 ? "99+" : counts.unread}
            </span>
          )}
        </Link>
        <Link href="/settings" className="md:hidden">
          <Avatar name={user.name} color={user.color} size="md" />
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-2 py-1 md:hidden">
        {navItems(user, counts).map((item) => (
          <NavLink key={item.href} href={item.href} exact={item.exact} className="nav-link shrink-0 px-2.5 py-1.5 text-xs" activeClassName="nav-link-active">
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
            {item.count > 0 && <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">{item.count}</span>}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
