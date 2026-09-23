"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/routing";
import { localizedCountries } from "@/lib/countries";
import { eligibility } from "@/lib/evoa";

export function EligibilityChecker() {
  const t = useTranslations("Evoa.eligibility");
  const tc = useTranslations("Countries");
  const locale = useLocale();
  const countries = useMemo(() => localizedCountries((code) => (tc.has(code) ? tc(code) : undefined), intlLocale(locale)), [tc, locale]);
  const [c, setC] = useState("");
  const r = c ? eligibility(c) : null;
  return (
    <div className="card mt-6 max-w-xl">
      <label><span className="label">{t("nationality")}</span>
        <select className="input" value={c} onChange={(e) => setC(e.target.value)}><option value="">{t("select")}</option>{countries.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select></label>
      {r === "visa_free" && <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{t.rich("visaFree", { link: (chunks) => <Link className="underline" href="/apply">{chunks}</Link> })}</p>}
      {r === "evoa" && <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{t.rich("eligible", { link: (chunks) => <Link className="font-semibold underline" href={{ pathname: "/apply", query: { product: "evoa" } }}>{chunks}</Link> })}</p>}
      {r === "check" && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t.rich("check", { link: (chunks) => <Link className="underline" href="/contact">{chunks}</Link> })}</p>}
    </div>
  );
}
