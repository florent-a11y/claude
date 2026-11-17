import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { LOCALES, type AppLocale } from "@/i18n/routing";
import { site } from "./config";

export type Href = Parameters<typeof getPathname>[0]["href"];

const OG_LOCALE: Record<AppLocale, string> = { id: "id_ID", en: "en_US" };

/** Full public URL of a page in one language. */
export function absoluteUrl(locale: AppLocale, href: Href) {
  const path = getPathname({ locale, href });
  return site.url + (path === "/" ? "" : path);
}

/**
 * Title, description, canonical URL and hreflang links for a page. Pass one href when the address is the same
 * route in both languages, or one per language when the slug differs (sectors, blog articles).
 */
export function pageMetadata(
  locale: AppLocale,
  href: Href | Record<AppLocale, Href>,
  { title, description }: { title: string; description: string },
): Metadata {
  const perLocale = (l: AppLocale): Href =>
    typeof href === "object" && "id" in href && "en" in href ? (href as Record<AppLocale, Href>)[l] : (href as Href);
  const languages = Object.fromEntries(LOCALES.map((l) => [l, absoluteUrl(l, perLocale(l))]));
  const url = absoluteUrl(locale, perLocale(locale));
  // Set on every page: a page that defines its own openGraph does not inherit the image from the layout segment.
  const image = { url: `${site.url}/${locale}/opengraph-image`, width: 1200, height: 630, alt: site.name };
  return {
    title,
    description,
    alternates: { canonical: url, languages: { ...languages, "x-default": languages.id } },
    openGraph: { title, description, url, siteName: site.name, locale: OG_LOCALE[locale], type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}
