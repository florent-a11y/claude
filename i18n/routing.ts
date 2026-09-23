import { defineRouting } from "next-intl/routing";

/** Public-site locales in priority order. English is served without a prefix; the others under /de, /zh, … */
export const LOCALES = ["en", "de", "zh", "fr", "id", "ja", "ko", "es"] as const;
export type AppLocale = (typeof LOCALES)[number];

/** Native-language labels for the language switcher. */
export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  de: "Deutsch",
  zh: "中文",
  fr: "Français",
  id: "Bahasa Indonesia",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
};

/** BCP 47 tags used for Intl number and date formatting per locale. */
export const INTL_LOCALES: Record<AppLocale, string> = {
  en: "en-US",
  de: "de-DE",
  zh: "zh-CN",
  fr: "fr-FR",
  id: "id-ID",
  ja: "ja-JP",
  ko: "ko-KR",
  es: "es-ES",
};

/** BCP 47 tag for a site locale (English formatting for anything unknown). */
export function intlLocale(locale: string) {
  return INTL_LOCALES[locale as AppLocale] ?? "en-US";
}

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: "en",
  localePrefix: "as-needed",
});
