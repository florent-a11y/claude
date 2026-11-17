"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import type { StaticPathname } from "@/i18n/routing";

export function MobileMenu({
  items,
  openLabel,
  closeLabel,
  children,
}: {
  items: { href: StaticPathname; label: string }[];
  openLabel: string;
  closeLabel: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? closeLabel : openLabel}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-cloud-200 text-ink-900 hover:bg-cloud-100"
      >
        {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-full border-b border-cloud-200 bg-white shadow-2xl shadow-ink-900/10">
          <nav className="container-page flex flex-col py-3">
            {items.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className="bubble-in border-b border-cloud-200 py-3.5 text-lg font-semibold text-ink-900 last:border-0"
                style={{ animationDelay: `${index * 35}ms` }}
              >
                {item.label}
              </Link>
            ))}
            <div className="flex flex-col items-start gap-4 pt-5 pb-3">{children}</div>
          </nav>
        </div>
      )}
    </div>
  );
}
