import { Languages, Mail, MapPin, MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { StaticPathname } from "@/i18n/routing";
import type { Dictionary } from "@/content";
import { site, whatsappLink } from "@/lib/config";
import { Logo } from "./Logo";

export function Footer({ dict }: { dict: Dictionary }) {
  const explore: { href: StaticPathname; label: string }[] = [
    { href: "/services", label: dict.nav.services },
    { href: "/how-we-work", label: dict.nav.process },
    { href: "/sectors", label: dict.nav.sectors },
    { href: "/pricing", label: dict.nav.pricing },
    { href: "/about", label: dict.nav.about },
    { href: "/blog", label: dict.nav.blog },
  ];
  const tryIt: { href: StaticPathname; label: string }[] = [
    { href: "/demo", label: dict.nav.demo },
    { href: "/quiz", label: dict.nav.quiz },
    { href: "/contact", label: dict.nav.contact },
  ];
  const wa = whatsappLink(dict.common.whatsappGreeting);
  const linkClass = "text-mist-300 transition hover:text-white";
  const headingClass = "text-[13px] font-bold uppercase tracking-[0.18em] text-gold-300";

  return (
    <footer className="relative bg-night-950">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400/70 to-transparent" />
      <div className="container-page grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div>
          <Logo onDark />
          <p className="mt-4 max-w-xs leading-relaxed text-mist-400">{dict.footer.tagline}</p>
        </div>
        <div>
          <h2 className={headingClass}>{dict.footer.explore}</h2>
          <ul className="mt-4 space-y-2.5">
            {explore.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={linkClass}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={headingClass}>{dict.footer.try}</h2>
          <ul className="mt-4 space-y-2.5">
            {tryIt.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={linkClass}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={headingClass}>{dict.footer.contact}</h2>
          <ul className="mt-4 space-y-3 text-mist-300">
            {wa && (
              <li>
                <a href={wa} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2.5 ${linkClass}`}>
                  <MessageCircle size={18} aria-hidden="true" className="shrink-0 text-gold-400" />
                  {dict.common.whatsapp}
                </a>
              </li>
            )}
            {site.email && (
              <li>
                <a href={`mailto:${site.email}`} className={`inline-flex items-center gap-2.5 ${linkClass}`}>
                  <Mail size={18} aria-hidden="true" className="shrink-0 text-gold-400" />
                  {site.email}
                </a>
              </li>
            )}
            <li className="flex gap-2.5">
              <MapPin size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-gold-400" />
              {dict.footer.areas}
            </li>
            <li className="flex gap-2.5">
              <Languages size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-gold-400" />
              {dict.footer.languages}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/[0.07]">
        <div className="container-page flex flex-col gap-2 py-6 text-sm text-mist-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.legalName || site.name}. {dict.footer.rights}
          </p>
          <Link href="/privacy" className="hover:text-white">
            {dict.footer.privacy}
          </Link>
        </div>
      </div>
    </footer>
  );
}
