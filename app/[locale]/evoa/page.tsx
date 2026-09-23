import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/routing";
import { pageMetadata } from "@/i18n/seo";
import { JsonLd } from "@/components/JsonLd";
import { PRICING, money } from "@/lib/pricing";
import { EVOA } from "@/lib/evoa";
import { site } from "@/lib/config";
import { EligibilityChecker } from "./Eligibility";

type Props = { params: Promise<{ locale: string }> };

const STEPS = ["check", "send", "prepare", "receive"] as const;
const FACTS = ["stay", "purposes", "window", "documents", "entry"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Evoa" });
  return pageMetadata(locale, "/evoa", { title: t("metaTitle"), description: t("metaDescription") });
}

export default async function Evoa({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Evoa");
  const tc = await getTranslations("Common");
  const m = (cents: number) => money(cents, PRICING.currency, intlLocale(locale));
  const q = { first: PRICING.evoa.first + PRICING.evoa.governmentFee, additional: PRICING.evoa.additional + PRICING.evoa.governmentFee };
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "Service", name: t("jsonLdName"),
        provider: {
          "@type": "Organization",
          name: site.company,
          identifier: site.companyId,
          address: { "@type": "PostalAddress", ...site.postalAddress },
        },
        offers: { "@type": "Offer", price: (q.first / 100).toFixed(2), priceCurrency: PRICING.currency, url: `${site.url}/apply?product=evoa` },
        inLanguage: locale,
      }} />
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2">
          <div>
            <p className="mb-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">{t("badge", { days: EVOA.validityDays })}</p>
            <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">{t("title")}</h1>
            <p className="mt-5 text-lg text-ink-700">{t("lead")}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={{ pathname: "/apply", query: { product: "evoa" } }} className="btn-primary">{t("ctaStart", { price: m(q.first) })}</Link>
              <Link href={{ pathname: "/apply", query: { product: "bundle" } }} className="btn-secondary">{t("ctaBundle")}</Link>
            </div>
            <p className="mt-4 text-sm text-ink-500">{tc.rich("notAffiliated", { link: (chunks) => <Link className="underline" href="/legal/disclosure">{chunks}</Link> })}</p>
          </div>
          <div className="card border-brand-100">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{t("priceTitle")}</p>
            <ul className="mt-4 divide-y divide-slate-100 text-ink-700">
              <li className="flex justify-between py-3"><span>{t("governmentFee", { idr: EVOA.governmentFeeIdr.toLocaleString(intlLocale(locale)) })}</span><strong>{m(PRICING.evoa.governmentFee)}</strong></li>
              <li className="flex justify-between py-3"><span>{t("serviceFirst")}</span><strong>{m(PRICING.evoa.first)}</strong></li>
              <li className="flex justify-between py-3"><span>{t("serviceAdditional")}</span><strong>{m(PRICING.evoa.additional)}</strong></li>
              <li className="flex justify-between py-3"><span>{t("bundle")}</span><strong className="text-brand-600">{t("bundleSave", { price: m(PRICING.bundleDiscount) })}</strong></li>
              <li className="flex justify-between py-3"><span>{t("express", { hours: PRICING.evoa.expressSlaHours })}</span><strong>{t("plus", { price: m(PRICING.express) })}</strong></li>
            </ul>
            <p className="mt-3 text-lg font-bold">{t("totalFirst", { price: m(q.first) })}</p>
            <p className="mt-2 text-sm text-ink-500">{t("refundNote")}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-3xl font-bold">{t("eligibleTitle")}</h2>
        <p className="mt-2 text-ink-700">{t("eligibleText", { months: EVOA.passportMinValidityMonths })}</p>
        <EligibilityChecker />
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-3xl font-bold">{t("howTitle")}</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s} className="card"><span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 font-bold text-white">{i + 1}</span><h3 className="mt-4 font-semibold">{t(`steps.${s}.t`)}</h3><p className="mt-1 text-sm text-ink-700">{t(`steps.${s}.d`)}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="prose-basic mx-auto max-w-3xl px-4 py-14">
        <h2>{t("factsTitle")}</h2>
        <ul>
          {FACTS.map((f) => (
            <li key={f}>{t(`facts.${f}`, { days: f === "window" ? EVOA.applyWindowDays : EVOA.validityDays, extraDays: EVOA.extendableOnceDays, processing: t("typicalProcessing") })}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
