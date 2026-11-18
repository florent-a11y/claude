import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { site, waLink } from "@/lib/config";
import { Logo } from "./Logo";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileMenu } from "./MobileMenu";
import { CartButton } from "./cart";
import { WhatsAppIcon } from "./WhatsAppLink";

export async function Header() {
  const t = await getTranslations("Nav");
  const c = await getTranslations("Common");
  const main = [
    { href: "/iv-drips", label: t("ivDrips") },
    { href: "/peptides", label: t("peptides") },
    { href: "/supplements", label: t("supplements") },
    { href: "/memberships", label: t("memberships") },
    { href: "/how-it-works", label: t("howItWorks") },
  ];
  const more = [{ href: "/delivery", label: t("delivery") }, { href: "/faq", label: t("faq") }, { href: "/contact", label: t("contact") }];
  const wa = waLink(c("whatsappGeneral", { brand: site.name }));
  return (
    <header className="sticky top-0 z-50 border-b border-mist-200/70 bg-white/85 backdrop-blur-md">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-deep-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white">{c("skipToContent")}</a>
      <div className="container-page flex h-[4.25rem] items-center justify-between gap-2 sm:gap-4">
        <Link href="/" className="text-deep-900" aria-label={site.name}><Logo /></Link>
        <nav className="hidden items-center gap-7 lg:flex" aria-label={c("menu")}>
          {main.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-ink-700 transition hover:text-deep-900">{l.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-0.5 sm:gap-1.5">
          <LocaleSwitcher className="mr-1 max-[339px]:hidden" />
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm hidden md:inline-flex">
              <WhatsAppIcon />{c("whatsapp")}
            </a>
          )}
          <CartButton />
          <MobileMenu links={[...main, ...more]} whatsappHref={wa} />
        </div>
      </div>
    </header>
  );
}
