"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function MobileMenu({ items }: { items: Array<{ href: string; label: string }> }) {
  const t = useTranslations("Header");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation and on Escape; lock body scroll while open.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button type="button" aria-label={open ? t("closeMenu") : t("openMenu")} aria-expanded={open} aria-controls="mobile-nav" className="grid h-10 w-10 place-items-center rounded-lg text-ink-700 hover:bg-brand-50" onClick={() => setOpen(!open)}>
        {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-50 h-screen bg-black/30" onClick={() => setOpen(false)}>
          <nav id="mobile-nav" aria-label={t("mobileNav")} className="max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-slate-200 bg-white px-4 pb-6 pt-2 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <ul className="divide-y divide-slate-100">
              {items.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} onClick={() => setOpen(false)} className={`block py-3 text-base font-medium ${pathname === n.href ? "text-brand-600" : "text-ink-900"}`}>{n.label}</Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <span className="text-sm font-medium text-ink-700">{t("language")}</span>
              <LocaleSwitcher />
            </div>
            <Link href="/apply" onClick={() => setOpen(false)} className="btn-primary mt-4 w-full">{t("startMobile")}</Link>
          </nav>
        </div>
      )}
    </div>
  );
}
