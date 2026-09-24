import type { Metadata } from "next";
import { site } from "@/lib/config";
import { routing, type AppLocale } from "./routing";

/** Open Graph locale tags per site locale. */
export const OG_LOCALES: Record<AppLocale, string> = {
  en: "en_US",
  de: "de_DE",
  zh: "zh_CN",
  fr: "fr_FR",
  id: "id_ID",
  ja: "ja_JP",
  ko: "ko_KR",
  es: "es_ES",
};

/** Static share image (1200×630) in public/. */
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: site.name };

export function ogLocale(locale: string) {
  return OG_LOCALES[locale as AppLocale] ?? OG_LOCALES.en;
}

/** Absolute-path form of a public route for a locale ("/de/apply", "/apply", "/de", "/"). */
export function localizedPath(locale: string, path: string) {
  const p = path === "/" ? "" : path;
  return locale === routing.defaultLocale ? p || "/" : `/${locale}${p}`;
}

/** canonical + hreflang alternates (every locale plus x-default) for a public route. */
export function alternatesFor(locale: string, path: string): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = localizedPath(l, path);
  languages["x-default"] = localizedPath(routing.defaultLocale, path);
  return { canonical: localizedPath(locale, path), languages };
}

/** Open Graph + Twitter card for a public route: absolute per-page URL, locale, alternates and the share image. */
export function socialFor(locale: string, path: string, meta: { title: string; description?: string }): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: site.name,
      title: meta.title,
      description: meta.description,
      url: `${site.url}${localizedPath(locale, path)}`,
      locale: ogLocale(locale),
      alternateLocale: routing.locales.filter((l) => l !== locale).map(ogLocale),
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: meta.title, description: meta.description, images: [OG_IMAGE.url] },
  };
}

/** Per-page metadata with localized title/description, hreflang alternates and social tags. */
export function pageMetadata(locale: string, path: string, meta: { title: string; description?: string; noindex?: boolean }): Metadata {
  return {
    title: meta.title,
    description: meta.description,
    alternates: alternatesFor(locale, path),
    ...socialFor(locale, path, { title: `${meta.title} | ${site.shortName}`, description: meta.description }),
    ...(meta.noindex ? { robots: { index: false } } : {}),
  };
}

/** Every indexable public route (without locale prefix). */
export const PUBLIC_PATHS = ["/", "/apply", "/reminder", "/evoa", "/pricing", "/guide", "/customs", "/news", "/faq", "/contact", "/legal/disclosure", "/legal/terms", "/legal/privacy", "/legal/refunds"];
