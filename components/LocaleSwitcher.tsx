"use client";
import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_LABELS, routing, type AppLocale } from "@/i18n/routing";

/** Language <select>: switches the current path to the chosen locale, keeping the query string. */
export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("Header");
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: AppLocale) {
    if (next === locale) return;
    const query = Object.fromEntries(new URLSearchParams(window.location.search));
    startTransition(() => router.replace({ pathname, query }, { locale: next }));
  }

  return (
    <label className={`inline-flex items-center gap-1 text-sm text-ink-700 ${className}`}>
      <span className="sr-only">{t("language")}</span>
      <select
        aria-label={t("language")}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        value={locale}
        disabled={pending}
        onChange={(e) => change(e.target.value as AppLocale)}
      >
        {routing.locales.map((l) => <option key={l} value={l} lang={l}>{LOCALE_LABELS[l]}</option>)}
      </select>
    </label>
  );
}
