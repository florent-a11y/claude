import Link from "next/link";
import { Bell, Briefcase, Building2, CheckSquare, Home, LayoutTemplate, LogOut, Settings, ShieldCheck, Users } from "lucide-react";
import { NavLink } from "./NavLink";
import { Avatar } from "./Avatar";
import { APP_NAME, ORG_NAME } from "@/lib/config";
import { logout } from "@/lib/actions/auth";
import { isInternal } from "@/lib/auth";
import type { PublicUser } from "@/lib/types";

export function navItems(user: PublicUser, counts: { tasks: number; approvals: number; unread: number }) {
  const items = [
    { href: "/", label: isInternal(user) ? "Dashboard" : "Home", icon: Home, exact: true, count: 0 },
    { href: "/workspaces", label: "Workspaces", icon: Briefcase, exact: false, count: 0 },
  ];
  if (isInternal(user)) items.push({ href: "/clients", label: "Clients", icon: Building2, exact: false, count: 0 });
  items.push({ href: "/tasks", label: "Tasks", icon: CheckSquare, exact: false, count: counts.tasks });
  items.push({ href: "/approvals", label: "Approvals", icon: ShieldCheck, exact: false, count: counts.approvals });
  if (isInternal(user)) items.push({ href: "/templates", label: "Flows", icon: LayoutTemplate, exact: false, count: 0 });
  if (user.role === "admin") items.push({ href: "/team", label: "Team", icon: Users, exact: false, count: 0 });
  items.push({ href: "/notifications", label: "Notifications", icon: Bell, exact: false, count: counts.unread });
  return items;
}

export function Sidebar({ user, counts }: { user: PublicUser; counts: { tasks: number; approvals: number; unread: number } }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <Link href="/" className="flex items-center gap-2.5 px-4 py-4">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">{APP_NAME[0]}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">{APP_NAME}</span>
          <span className="block truncate text-[11px] text-slate-500">{ORG_NAME}</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {navItems(user, counts).map((item) => (
          <NavLink key={item.href} href={item.href} exact={item.exact}>
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {item.count > 0 && (
              <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{item.count}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <Avatar name={user.name} color={user.color} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-900">{user.name}</div>
            <div className="truncate text-xs text-slate-500">{user.title || roleLabel(user.role)}</div>
          </div>
        </div>
        <div className="mt-1 flex gap-1">
          <NavLink href="/settings" className="nav-link flex-1 justify-center gap-1.5 whitespace-nowrap px-2 py-1.5 text-xs" activeClassName="nav-link-active">
            <Settings className="h-3.5 w-3.5" /> Settings
          </NavLink>
          <form action={logout} className="flex-1">
            <button type="submit" className="nav-link w-full justify-center gap-1.5 whitespace-nowrap px-2 py-1.5 text-xs">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

export function roleLabel(role: PublicUser["role"]): string {
  return role === "admin" ? "Administrator" : role === "member" ? "Team member" : "Client";
}
