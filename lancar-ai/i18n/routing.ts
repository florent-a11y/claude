import { defineRouting } from "next-intl/routing";

export const LOCALES = ["id", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<AppLocale, string> = { id: "Bahasa Indonesia", en: "English" };

export function isLocale(value: string): value is AppLocale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Indonesian is served without a prefix (/layanan), English under /en (/en/services). A first visit to "/"
 * follows the browser language. hreflang links come from page metadata (lib/seo.ts), not from the middleware,
 * because sector and blog slugs differ per language.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: "id",
  localePrefix: "as-needed",
  alternateLinks: false,
  pathnames: {
    "/": "/",
    "/services": { id: "/layanan", en: "/services" },
    "/how-we-work": { id: "/cara-kerja", en: "/how-we-work" },
    "/sectors": { id: "/sektor", en: "/sectors" },
    "/sectors/[slug]": { id: "/sektor/[slug]", en: "/sectors/[slug]" },
    "/pricing": { id: "/harga", en: "/pricing" },
    "/about": { id: "/tentang", en: "/about" },
    "/contact": { id: "/kontak", en: "/contact" },
    "/quiz": { id: "/kuis", en: "/quiz" },
    "/demo": "/demo",
    "/blog": "/blog",
    "/blog/[slug]": "/blog/[slug]",
    "/privacy": { id: "/privasi", en: "/privacy" },
  },
});

export type AppPathname = keyof typeof routing.pathnames;
/** Pages without a dynamic segment, usable as a plain href. */
export type StaticPathname = Exclude<AppPathname, "/sectors/[slug]" | "/blog/[slug]">;
