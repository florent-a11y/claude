"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { seg: "", label: "Overview" }, { seg: "accounts", label: "Accounts" }, { seg: "journal", label: "Journal" }, { seg: "sales", label: "Sales" },
  { seg: "purchases", label: "Purchases" }, { seg: "bank", label: "Bank" }, { seg: "assets", label: "Assets" }, { seg: "reports", label: "Reports" }, { seg: "periods", label: "Periods" },
];

/** Section tabs for one entity's books; the active tab follows the URL. */
export function BooksTabs({ base }: { base: string }) {
  const path = usePathname();
  return (
    <nav className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 text-sm no-print">
      {TABS.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base;
        const active = t.seg ? path === href || path.startsWith(href + "/") : path === base;
        return <Link key={t.seg} href={href} className={`-mb-px border-b-2 px-3 py-2 ${active ? "border-brand-600 font-semibold text-brand-700" : "border-transparent text-ink-500 hover:text-ink-900"}`}>{t.label}</Link>;
      })}
    </nav>
  );
}
