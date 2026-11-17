"use client";

import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LOCALES, LOCALE_LABELS, type AppLocale } from "@/i18n/routing";

/**
 * Links to the same page in each language. On sector and blog pages the slug differs per language; the link
 * carries the current slug and the page redirects to the right one (see sectorByAnySlug and lib/blog.ts).
 */
export function LocaleSwitcher({ label }: { label: string }) {
  const current = useLocale();
  const pathname = usePathname();
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : undefined;
  // usePathname returns the route template ("/sectors/[slug]") when the route has translated paths.
  const href = (slug ? { pathname, params: { slug } } : pathname) as Parameters<typeof Link>[0]["href"];

  return (
    <nav aria-label={label} className="flex items-center gap-0.5 rounded-full border border-cloud-200 bg-white p-1 text-sm font-bold">
      {LOCALES.map((locale: AppLocale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={href}
            locale={locale}
            hrefLang={locale}
            lang={locale}
            aria-current={active ? "true" : undefined}
            title={LOCALE_LABELS[locale]}
            className={`rounded-full px-2.5 py-1 uppercase transition ${
              active ? "bg-gold-400 text-night-950" : "text-ink-600 hover:text-azure-700"
            }`}
          >
            {locale}
          </Link>
        );
      })}
    </nav>
  );
}
