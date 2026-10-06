import { NavLink } from "./NavLink";
import type { LucideIcon } from "lucide-react";

export interface SideNavGroup {
  title?: string;
  items: { href: string; label: string; icon?: LucideIcon; exact?: boolean }[];
}

/** The narrow left navigation used by Library, Manage and Admin, like Moxo's. */
export function SideNav({ groups, header }: { groups: SideNavGroup[]; header?: React.ReactNode }) {
  return (
    <aside className="hidden w-60 shrink-0 md:block">
      {header}
      {groups.map((g, i) => (
        <div key={i} className="mb-5">
          {g.title && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g.title}</p>}
          <nav className="space-y-0.5">
            {g.items.map((it) => (
              <NavLink key={it.href} href={it.href} exact={it.exact} className="nav-link" activeClassName="nav-link-active">
                {it.icon && <it.icon className="h-4 w-4" />} {it.label}
              </NavLink>
            ))}
          </nav>
        </div>
      ))}
    </aside>
  );
}

export function SectionShell({ nav, children }: { nav: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-6 px-4 py-5 md:px-6">
      {nav}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
