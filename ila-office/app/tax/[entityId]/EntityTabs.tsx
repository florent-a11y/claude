"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function EntityTabs({ entityId }: { entityId: string }) {
  const path = usePathname();
  const base = `/tax/${entityId}`;
  const tabs = [
    { href: base, label: "Calendar", exact: true }, { href: `${base}/pph21`, label: "PPh 21" }, { href: `${base}/withholding`, label: "Withholding" },
    { href: `${base}/ppn`, label: "PPN" }, { href: `${base}/cit`, label: "CIT" }, { href: `${base}/lkpm`, label: "LKPM" }, { href: `/settings/entities/${entityId}`, label: "Settings" },
  ];
  return (
    <nav className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 text-sm no-print">
      {tabs.map((t) => {
        const active = t.exact ? path === t.href : path === t.href || path.startsWith(t.href + "/");
        return <Link key={t.href} href={t.href} className={`-mb-px border-b-2 px-3 py-2 ${active ? "border-brand-600 font-semibold text-brand-700" : "border-transparent text-ink-500 hover:text-ink-900"}`}>{t.label}</Link>;
      })}
    </nav>
  );
}
