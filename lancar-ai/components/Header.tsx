import { Link } from "@/i18n/navigation";
import type { StaticPathname } from "@/i18n/routing";
import type { Dictionary } from "@/content";
import { Logo } from "./Logo";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileMenu } from "./MobileMenu";
import { BookCallButton } from "./Cta";

export function Header({ dict }: { dict: Dictionary }) {
  const main: { href: StaticPathname; label: string }[] = [
    { href: "/services", label: dict.nav.services },
    { href: "/how-we-work", label: dict.nav.process },
    { href: "/sectors", label: dict.nav.sectors },
    { href: "/pricing", label: dict.nav.pricing },
    { href: "/demo", label: dict.nav.demo },
    { href: "/blog", label: dict.nav.blog },
  ];
  const mobile: { href: StaticPathname; label: string }[] = [
    ...main,
    { href: "/quiz", label: dict.nav.quiz },
    { href: "/about", label: dict.nav.about },
    { href: "/contact", label: dict.nav.contact },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-sand-200 bg-sand-50/95 backdrop-blur">
      <div className="container-page relative flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label={dict.nav.home} className="shrink-0">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {main.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-2 text-[15px] font-semibold text-ink-700 transition hover:bg-ink-900/5 hover:text-ink-950"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          <LocaleSwitcher label={dict.nav.language} />
          <BookCallButton dict={dict} label={dict.nav.cta} className="btn btn-primary min-h-11 px-5 py-2.5 text-[15px]" />
        </div>
        <MobileMenu items={mobile} openLabel={dict.nav.openMenu} closeLabel={dict.nav.closeMenu}>
          <LocaleSwitcher label={dict.nav.language} />
          <BookCallButton dict={dict} />
        </MobileMenu>
      </div>
    </header>
  );
}
