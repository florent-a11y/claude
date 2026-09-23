import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { site } from "@/lib/config";
import { MobileMenu } from "./MobileMenu";
import { LocaleSwitcher } from "./LocaleSwitcher";

/** Public navigation; labels live under Header.nav in the message catalog. */
export const NAV = [
  { href: "/apply", key: "arrivalCard" },
  { href: "/reminder", key: "reminder" },
  { href: "/reminder", key: "reminder" },
  { href: "/evoa", key: "evoa" },
  { href: "/pricing", key: "pricing" },
  { href: "/guide", key: "guide" },
  { href: "/customs", key: "customs" },
  { href: "/news", key: "news" },
  { href: "/faq", key: "faq" },
  { href: "/contact", key: "contact" },
] as const;

export async function Header() {
  const t = await getTranslations("Header");
  const items = NAV.map((n) => ({ href: n.href, label: t(`nav.${n.key}`) }));
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-brand-700">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white">✈</span>
          <span>{site.shortName}</span>
        </Link>
        <nav aria-label={t("mainNav")} className="hidden items-center gap-4 text-sm font-medium text-ink-700 lg:flex">
          {items.slice(0, 8).map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-brand-600">{n.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LocaleSwitcher className="hidden lg:inline-flex" />
          <Link href="/apply" className="btn-primary hidden !px-4 !py-2 text-sm sm:inline-flex">{t("start")}</Link>
          <MobileMenu items={items} />
        </div>
      </div>
    </header>
  );
}
