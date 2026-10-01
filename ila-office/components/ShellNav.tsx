"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };
const CRM: Item[] = [
  { href: "/crm/contacts", label: "Contacts" }, { href: "/crm/companies", label: "Companies" }, { href: "/crm/deals", label: "Deals" },
  { href: "/crm/quotes", label: "Quotes" }, { href: "/crm/projects", label: "Projects" }, { href: "/crm/renewals", label: "Renewals" },
  { href: "/crm/services", label: "Service catalogue" }, { href: "/crm/vendors", label: "Vendors" },
];
const SETTINGS: Item[] = [{ href: "/settings/entities", label: "Entities (books)" }, { href: "/settings/users", label: "Users" }, { href: "/settings/import", label: "Import data" }];

export function ShellNav({ entities, ownEntityId, role }: { entities: Array<{ id: string; name: string; isOwn: boolean }>; ownEntityId?: string; role: string }) {
  const path = usePathname();
  // Remember the entity from the URL so Books/Tax links keep the current context.
  const m = path.match(/^\/(books|tax|payroll)\/([^/]+)/);
  const entityId = m?.[2] ?? ownEntityId ?? entities[0]?.id;
  const link = (href: string, label: string, exact = false) => {
    const active = exact ? path === href : path === href || path.startsWith(href + "/");
    return <Link key={href} href={href} className={`block rounded-md px-2 py-1 text-sm ${active ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-700 hover:bg-slate-50"}`}>{label}</Link>;
  };
  const section = (title: string) => <p className="mt-4 mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">{title}</p>;
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-2">
      {link("/", "Dashboard", true)}
      {link("/tasks", "My tasks")}
      {section("CRM")}
      {CRM.map((i) => link(i.href, i.label))}
      {section("Books & tax")}
      {entityId ? (
        <>
          {link(`/books/${entityId}`, "Books")}
          {link(`/tax/${entityId}`, "Tax & compliance")}
          {link(`/payroll/${entityId}`, "Payroll")}
          <div className="mt-2 px-2">
            <label className="label">Entity</label>
            <select className="input !py-1 text-xs" value={entityId} onChange={(e) => { const id = e.target.value; const seg = m?.[1] ?? "books"; window.location.href = `/${seg}/${id}`; }}>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.isOwn ? `★ ${e.name}` : e.name}</option>)}
            </select>
          </div>
        </>
      ) : (
        <p className="px-2 text-xs text-ink-500">No entity yet. <Link className="underline" href="/settings/entities/new">Create one</Link>.</p>
      )}
      {link("/tax", "All clients calendar")}
      {section("Settings")}
      {SETTINGS.filter((i) => role === "admin" || i.href !== "/settings/users").map((i) => link(i.href, i.label))}
    </nav>
  );
}
