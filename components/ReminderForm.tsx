"use client";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/routing";
import { validationKey } from "@/i18n/validation";
import { localizedCountries } from "@/lib/countries";
import { type Product } from "@/lib/schema";
import { formatWindowOpens, hoursUntilArrival, WINDOW_HOURS, windowState } from "@/lib/window";

export interface ReminderFormProps {
  initialArrival?: string;
  initialEmail?: string;
  initialTravelers?: number;
  initialNationality?: string;
  product?: Product;
  /** Tighter layout for embedding inside another form. */
  compact?: boolean;
}

type Issue = { path: (string | number)[]; message: string };

export function ReminderForm({ initialArrival = "", initialEmail = "", initialTravelers = 1, initialNationality = "", product = "arrival_card", compact = false }: ReminderFormProps) {
  const t = useTranslations("ReminderForm");
  const tv = useTranslations("Validation");
  const tc = useTranslations("Countries");
  const locale = useLocale();
  const countries = useMemo(() => localizedCountries((code) => (tc.has(code) ? tc(code) : undefined), intlLocale(locale)), [tc, locale]);
  const [email, setEmail] = useState(initialEmail);
  const [arrivalDate, setArrivalDate] = useState(initialArrival);
  const [travelers, setTravelers] = useState(initialTravelers);
  const [nationality, setNationality] = useState(initialNationality);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [source, setSource] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ arrivalDate: string; hoursLeft: number } | null>(null);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const s = p.get("utm_source") || p.get("ref") || "";
      if (s) setSource(s.slice(0, 60));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (initialArrival) setArrivalDate(initialArrival); }, [initialArrival]);
  useEffect(() => { if (initialEmail) setEmail(initialEmail); }, [initialEmail]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    if (!consent) { setErrors({ consent: tv("consent") }); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, arrivalDate, travelers, nationality: nationality || undefined, productInterest: product, locale, source: source || undefined, consent, website }),
      });
      const data = await res.json();
      if (!res.ok) {
        const out: Record<string, string> = {};
        for (const i of (data.issues ?? []) as Issue[]) { const k = validationKey(i.message); out[i.path.join(".")] = k ? tv(k) : i.message; }
        if (!Object.keys(out).length) out.form = data.error ?? t("genericError");
        setErrors(out);
        return;
      }
      setDone({ arrivalDate, hoursLeft: data.hoursLeft ?? hoursUntilArrival(arrivalDate) });
    } catch {
      setErrors({ form: t("networkError") });
    } finally { setBusy(false); }
  }

  if (done) {
    const state = windowState(done.hoursLeft);
    return (
      <div className={`rounded-xl border border-brand-100 bg-brand-50 ${compact ? "p-4" : "p-6"}`} role="status">
        {state === "open" ? (
          <>
            <p className="font-semibold">{t("openTitle", { date: done.arrivalDate })}</p>
            <p className="mt-1 text-sm text-ink-700">{t("openText")}</p>
            <Link href={{ pathname: "/apply", query: { arrival: done.arrivalDate, email, product, ref: "reminder" } }} className="btn-primary mt-4">{t("startCta")}</Link>
          </>
        ) : (
          <>
            <p className="font-semibold">{t("doneTitle")}</p>
            <p className="mt-1 text-sm text-ink-700">{t.rich("doneText", { when: formatWindowOpens(done.arrivalDate, undefined, intlLocale(locale)), hours: WINDOW_HOURS, strong: (chunks) => <strong>{chunks}</strong> })}</p>
          </>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`relative ${compact ? "space-y-3" : "space-y-4"}`} noValidate>
      <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "md:grid-cols-2"}`}>
        <label><span className="label">{t("email")}</span><input type="email" className="input" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value.trim())} />{errors.email && <p className="error">{errors.email}</p>}</label>
        <label><span className="label">{t("arrivalDate")}</span><input type="date" className="input" required value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} />{errors.arrivalDate && <p className="error">{errors.arrivalDate}</p>}</label>
        <label><span className="label">{t("travelers")}</span><select className="input" value={travelers} onChange={(e) => setTravelers(Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label><span className="label">{t("nationality")}</span><select className="input" value={nationality} onChange={(e) => setNationality(e.target.value)}><option value="">{t("select")}</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>{errors.nationality && <p className="error">{errors.nationality}</p>}</label>
      </div>
      {/* Honeypot: hidden from people, filled by bots. */}
      <div className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>
      <input type="hidden" name="source" value={source} readOnly />
      <label className="flex items-start gap-3"><input type="checkbox" className="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span className="text-sm text-ink-700">{t("consent")}</span></label>
      {errors.consent && <p className="error">{errors.consent}</p>}
      {errors.form && <p className="error">{errors.form}</p>}
      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? t("saving") : t("submit")}</button>
      <p className="text-xs text-ink-500">{t("footnote")}</p>
    </form>
  );
}
