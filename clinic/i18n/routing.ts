import { defineRouting } from "next-intl/routing";

/** Public-site languages. English is served without a prefix; the others under /ru and /fr. */
export const LOCALES = ["en", "ru", "fr"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<AppLocale, string> = { en: "English", ru: "Русский", fr: "Français" };
export const LOCALE_SHORT: Record<AppLocale, string> = { en: "EN", ru: "RU", fr: "FR" };
export const OG_LOCALES: Record<AppLocale, string> = { en: "en_US", ru: "ru_RU", fr: "fr_FR" };

export const routing = defineRouting({ locales: LOCALES, defaultLocale: "en", localePrefix: "as-needed" });

/** Absolute-path form of a public route for a locale ("/ru/peptides", "/peptides", "/ru", "/"). */
export function localizedPath(locale: string, path: string) {
  const p = path === "/" ? "" : path;
  return locale === routing.defaultLocale ? p || "/" : `/${locale}${p}`;
}
