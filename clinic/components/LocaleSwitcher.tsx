"use client";
import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_LABELS, LOCALE_SHORT, routing, type AppLocale } from "@/i18n/routing";

/** EN / RU / FR switch: keeps the current page and query string. */
export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("Common");
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: AppLocale) {
    if (next === locale) return;
    const query = Object.fromEntries(new URLSearchParams(window.location.search));
    startTransition(() => router.replace({ pathname, query }, { locale: next }));
  }

  return (
    <div role="group" aria-label={t("language")} className={`inline-flex items-center gap-0.5 text-xs font-semibold tracking-wider ${className}`}>
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={LOCALE_LABELS[l]}
          aria-pressed={l === locale}
          disabled={pending}
          onClick={() => change(l)}
          className={`rounded-full px-2 py-1 transition ${l === locale ? "bg-forest-800 text-sand-50" : "text-ink-500 hover:text-forest-900"}`}
        >
          {LOCALE_SHORT[l]}
        </button>
      ))}
    </div>
  );
}
