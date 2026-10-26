"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function PayrollTabs({ entityId, employees }: { entityId: string; employees: number }) {
  const path = usePathname();
  const base = `/payroll/${entityId}`;
  const tabs = [{ href: base, label: "Runs", match: (p: string) => p === base || p.startsWith(`${base}/runs`) }, { href: `${base}/employees`, label: "Employees", count: employees, match: (p: string) => p.startsWith(`${base}/employees`) }, { href: `/tax/${entityId}/pph21`, label: "PPh 21 true-up", match: () => false }];
  return (
    <nav className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 text-sm no-print">
      {tabs.map((t) => <Link key={t.href} href={t.href} className={`-mb-px border-b-2 px-3 py-2 ${t.match(path) ? "border-brand-600 font-semibold text-brand-700" : "border-transparent text-ink-500 hover:text-ink-900"}`}>{t.label}{t.count !== undefined && <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs">{t.count}</span>}</Link>)}
    </nav>
  );
}
