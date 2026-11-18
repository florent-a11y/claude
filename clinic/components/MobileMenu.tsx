"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

/**
 * Phone and tablet menu: a full-screen sheet under the floating bar, its links arriving one after another.
 * The sheet is attached to <body> because the frosted bar would otherwise trap a fixed-position child inside itself.
 */
export function MobileMenu({ links, whatsappHref }: { links: Array<{ href: string; label: string }>; whatsappHref: string | null }) {
  const t = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    if (open) window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button type="button" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? t("close") : t("menu")} onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-deep-900 transition hover:bg-mist-100">
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
      </button>
      {mounted && open && createPortal(
        <div id="mobile-menu" className="menu-in fixed inset-0 z-40 overflow-y-auto bg-white px-6 pb-10 pt-24 lg:hidden">
          <nav className="flex flex-col" aria-label={t("menu")}>
            {links.map((l, i) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} style={{ "--i": i } as React.CSSProperties}
                className="load-rise border-b border-mist-200 py-4 font-display text-2xl font-semibold text-deep-900">{l.label}</Link>
            ))}
          </nav>
          <div className="load-rise mt-8 flex items-center justify-between" style={{ "--i": links.length } as React.CSSProperties}>
            <LocaleSwitcher />
            {whatsappHref && <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm">{t("whatsapp")}</a>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
