"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CONSENT_OPEN_EVENT, openConsentBanner, readConsent, writeConsent } from "@/lib/consent";

/**
 * Small bottom bar asking for analytics / advertising consent. Shown to everyone (no geo-detection) until a
 * decision is stored; the footer "Cookie settings" link reopens it. Tags load only after "Accept"
 * (components/Analytics.tsx); the site works the same either way.
 */
export function ConsentBanner() {
  const t = useTranslations("Consent");
  // Decided after mount so the server and the first client render agree (no hydration mismatch).
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (readConsent() === "unknown") setOpen(true);
    const show = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, show);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, show);
  }, []);

  if (!open) return null;
  const decide = (analytics: boolean) => { writeConsent(analytics); setOpen(false); };
  return (
    <div role="region" aria-label={t("label")} data-testid="consent-banner" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5 text-[11px] leading-snug text-ink-700 sm:px-4 sm:text-sm">
        <p className="min-w-0 flex-1 basis-72">{t("text")}</p>
        <div className="flex shrink-0 items-center gap-3 text-xs sm:text-sm">
          <Link href="/legal/privacy" className="underline">{t("privacy")}</Link>
          <button type="button" data-testid="consent-refuse" className="rounded-lg px-3 py-1.5 font-semibold text-ink-700 ring-1 ring-slate-300 hover:bg-slate-50" onClick={() => decide(false)}>{t("refuse")}</button>
          <button type="button" data-testid="consent-accept" className="rounded-lg bg-brand-500 px-3 py-1.5 font-semibold text-white hover:bg-brand-600" onClick={() => decide(true)}>{t("accept")}</button>
        </div>
      </div>
    </div>
  );
}

/** Footer link that reopens the banner. Takes the label as a prop so the (server) footer keeps its namespace. */
export function CookieSettingsLink({ label }: { label: string }) {
  return <button type="button" className="underline" onClick={openConsentBanner}>{label}</button>;
}
