import type { Metadata } from "next";
import { site } from "@/lib/config";
import { PRODUCTS } from "@/lib/catalog";
import { OG_LOCALES, localizedPath, routing, type AppLocale } from "./routing";

/** canonical + hreflang alternates (every locale plus x-default) for a public route. */
export function alternatesFor(locale: string, path: string): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = localizedPath(l, path);
  languages["x-default"] = localizedPath(routing.defaultLocale, path);
  return { canonical: localizedPath(locale, path), languages };
}

/** Per-page metadata: localized title and description, hreflang alternates, Open Graph. `noindex` for private pages. */
export function pageMetadata(locale: string, path: string, meta: { title: string; description?: string; noindex?: boolean }): Metadata {
  return {
    title: meta.title,
    description: meta.description,
    alternates: meta.noindex ? { canonical: localizedPath(locale, path) } : alternatesFor(locale, path),
    openGraph: {
      type: "website", siteName: site.name, title: `${meta.title} | ${site.name}`, description: meta.description,
      url: `${site.url}${localizedPath(locale, path)}`, locale: OG_LOCALES[locale as AppLocale] ?? OG_LOCALES.en,
    },
    ...(meta.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

/** Every indexable public route (without locale prefix). */
export const PUBLIC_PATHS = [
  "/", "/iv-drips", "/peptides", "/supplements", "/memberships", "/how-it-works", "/delivery", "/faq", "/contact",
  "/legal/terms", "/legal/privacy", "/legal/medical", "/legal/refunds",
  ...PRODUCTS.map((p) => `/treatments/${p.slug}`),
];
