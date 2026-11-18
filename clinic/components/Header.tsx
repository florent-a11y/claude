import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { site, waLink } from "@/lib/config";
import { Logo } from "./Logo";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileMenu } from "./MobileMenu";
import { HeaderFrame } from "./HeaderFrame";
import { CartButton } from "./cart";
import { WhatsAppIcon } from "./WhatsAppLink";

/** Floating navigation bar: a rounded, frosted pill that stays at the top of the screen. */
export async function Header() {
  const t = await getTranslations("Nav");
  const c = await getTranslations("Common");
  const main = [
    { href: "/iv-drips", label: t("ivDrips") },
    { href: "/peptides", label: t("peptides") },
    { href: "/supplements", label: t("supplements") },
    { href: "/memberships", label: t("memberships") },
    { href: "/blog", label: t("blog") },
    { href: "/how-it-works", label: t("howItWorks"), wide: true },
  ];
  const more = [{ href: "/delivery", label: t("delivery") }, { href: "/faq", label: t("faq") }, { href: "/contact", label: t("contact") }];
  const wa = waLink(c("whatsappGeneral", { brand: site.name }));
  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-5">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-6 focus:z-50 focus:rounded-full focus:bg-deep-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white">{c("skipToContent")}</a>
      <HeaderFrame>
        <Link href="/" className="text-deep-900" aria-label={site.name}><Logo /></Link>
        <nav className="hidden items-center gap-7 lg:flex" aria-label={c("menu")}>
          {main.map((l) => (
            <Link key={l.href} href={l.href} className={`nav-link text-sm font-medium text-ink-700 transition-colors hover:text-deep-900 ${"wide" in l ? "hidden xl:inline" : ""}`}>{l.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-0.5 sm:gap-1.5">
          <LocaleSwitcher className="mr-1 max-[339px]:hidden" />
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm hidden md:inline-flex">
              <WhatsAppIcon />{c("whatsapp")}
            </a>
          )}
          <CartButton />
          <MobileMenu links={[...main, ...more]} whatsappHref={wa} />
        </div>
      </HeaderFrame>
    </header>
  );
}
