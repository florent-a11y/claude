import type { Metadata } from "next";
import { routing } from "./routing";

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

/** Per-page metadata with localized title/description and hreflang alternates. */
export function pageMetadata(locale: string, path: string, meta: { title: string; description?: string; noindex?: boolean }): Metadata {
  return {
    title: meta.title,
    description: meta.description,
    alternates: alternatesFor(locale, path),
    ...(meta.noindex ? { robots: { index: false } } : {}),
  };
}

/** Every indexable public route (without locale prefix). */
export const PUBLIC_PATHS = ["/", "/apply", "/reminder", "/evoa", "/pricing", "/guide", "/customs", "/news", "/faq", "/contact", "/legal/disclosure", "/legal/terms", "/legal/privacy", "/legal/refunds"];
