"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function MobileMenu({ links, whatsappHref }: { links: Array<{ href: string; label: string }>; whatsappHref: string | null }) {
  const t = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button type="button" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? t("close") : t("menu")} onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-deep-900 hover:bg-mist-100">
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
      </button>
      {open && (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-[4.25rem] z-40 overflow-y-auto bg-white px-6 pb-10 pt-6">
          <nav className="flex flex-col">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="border-b border-mist-200 py-4 font-display text-2xl font-semibold text-deep-900">{l.label}</Link>
            ))}
          </nav>
          <div className="mt-8 flex items-center justify-between">
            <LocaleSwitcher />
            {whatsappHref && <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm">{t("whatsapp")}</a>}
          </div>
        </div>
      )}
    </div>
  );
}
