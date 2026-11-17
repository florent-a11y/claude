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
  const linkClass = "text-sand-100/80 transition hover:text-white";

  return (
    <footer className="bg-ink-950 text-sand-100">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div>
          <Logo light />
          <p className="mt-4 max-w-xs leading-relaxed text-sand-100/75">{dict.footer.tagline}</p>
        </div>
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-marigold-300">{dict.footer.explore}</h2>
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
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-marigold-300">{dict.footer.try}</h2>
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
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-marigold-300">{dict.footer.contact}</h2>
          <ul className="mt-4 space-y-3 text-sand-100/80">
            {wa && (
              <li>
                <a href={wa} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2.5 ${linkClass}`}>
                  <MessageCircle size={18} aria-hidden="true" className="shrink-0" />
                  {dict.common.whatsapp}
                </a>
              </li>
            )}
            {site.email && (
              <li>
                <a href={`mailto:${site.email}`} className={`inline-flex items-center gap-2.5 ${linkClass}`}>
                  <Mail size={18} aria-hidden="true" className="shrink-0" />
                  {site.email}
                </a>
              </li>
            )}
            <li className="flex gap-2.5">
              <MapPin size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              {dict.footer.areas}
            </li>
            <li className="flex gap-2.5">
              <Languages size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              {dict.footer.languages}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-6 text-sm text-sand-100/60 sm:flex-row sm:items-center sm:justify-between">
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
