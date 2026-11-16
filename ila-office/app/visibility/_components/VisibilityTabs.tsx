"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/visibility", label: "Overview" }, { href: "/visibility/prompts", label: "Prompts" }, { href: "/visibility/competitors", label: "Competitors" },
  { href: "/visibility/sources", label: "Sources" }, { href: "/visibility/audit", label: "Technical audit" }, { href: "/visibility/articles", label: "Articles" },
  { href: "/visibility/settings", label: "Settings" },
];

/** Same look as components/ui Tabs, but "Overview" is the module root and must match exactly, not by prefix. */
export function VisibilityTabs() {
  const path = usePathname();
  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
      <nav className="mb-0 flex flex-wrap gap-1 border-b border-slate-200 text-sm no-print">
        {TABS.map((t) => {
          const active = t.href === "/visibility" ? path === t.href : path === t.href || path.startsWith(`${t.href}/`);
          return <Link key={t.href} href={t.href} className={`-mb-px border-b-2 px-3 py-2 ${active ? "border-brand-600 font-semibold text-brand-700" : "border-transparent text-ink-500 hover:text-ink-900"}`}>{t.label}</Link>;
        })}
      </nav>
    </div>
  );
}
