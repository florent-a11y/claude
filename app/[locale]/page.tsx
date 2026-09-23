import { CheckCircle2, Clock, Languages, MessageCircle, ShieldCheck, Smartphone } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/routing";
import { PriceCard } from "@/components/PriceCard";
import { JsonLd } from "@/components/JsonLd";
import { ReminderForm } from "@/components/ReminderForm";
import { OfficialNote } from "@/components/OfficialNote";
import { site } from "@/lib/config";
import { PRICING, money } from "@/lib/pricing";

type Props = { params: Promise<{ locale: string }> };

const STEPS = ["price", "form", "check", "qr"] as const;
const FEATURES = [
  { icon: ShieldCheck, key: "human" },
  { icon: Clock, key: "fast" },
  { icon: Languages, key: "language" },
  { icon: Smartphone, key: "phone" },
  { icon: MessageCircle, key: "support" },
  { icon: CheckCircle2, key: "customs" },
] as const;

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const tc = await getTranslations("Common");
  const m = (cents: number) => money(cents, PRICING.currency, intlLocale(locale));
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "Service",
        name: t("jsonLdName"),
        provider: {
          "@type": "Organization",
          name: site.company,
          identifier: site.companyId,
          address: { "@type": "PostalAddress", ...site.postalAddress },
        },
        areaServed: "Indonesia",
        offers: { "@type": "Offer", price: (PRICING.arrivalCard.first / 100).toFixed(2), priceCurrency: PRICING.currency, url: `${site.url}/apply` },
        description: tc("siteDescription"),
        inLanguage: locale,
      }} />
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <p className="mb-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">{t("badge")}</p>
            <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">{t("title")}</h1>
            <p className="mt-5 text-lg text-ink-700">{t("lead")}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/apply" className="btn-primary">{t("ctaStart", { price: m(PRICING.arrivalCard.first) })}</Link>
              <Link href="/guide" className="btn-secondary">{t("ctaHow")}</Link>
            </div>
            <p className="mt-4 text-sm text-ink-500">{tc.rich("notAffiliated", { link: (chunks) => <Link className="underline" href="/legal/disclosure">{chunks}</Link> })}</p>
            <OfficialNote className="mt-1 text-sm text-ink-500" />
          </div>
          <PriceCard />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-14">
        <div className="card grid gap-6 border-brand-100 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">{t("reminderTitle")}</h2>
            <p className="mt-2 text-ink-700">{t("reminderText")}</p>
            <p className="mt-2 text-sm text-ink-500">{t.rich("reminderNote", { link: (chunks) => <Link className="underline" href="/reminder">{chunks}</Link> })}</p>
          </div>
          <ReminderForm compact />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-3xl font-bold">{t("howTitle")}</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s} className="card">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 font-bold text-white">{i + 1}</span>
              <h3 className="mt-4 font-semibold">{t(`steps.${s}.t`)}</h3>
              <p className="mt-1 text-sm text-ink-700">{t(`steps.${s}.d`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-3xl font-bold">{t("featuresTitle")}</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.key} className="card">
                <f.icon className="h-7 w-7 text-brand-600" aria-hidden />
                <h3 className="mt-3 font-semibold">{t(`features.${f.key}.t`)}</h3>
                <p className="mt-1 text-sm text-ink-700">{t(`features.${f.key}.d`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-14">
        <div className="card grid gap-6 border-brand-100 bg-brand-50 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">{t("evoaTitle")}</h2>
            <p className="mt-2 text-ink-700">{t("evoaText", { discount: m(PRICING.bundleDiscount) })}</p>
          </div>
          <div className="flex items-center gap-3 md:justify-end">
            <Link href="/evoa" className="btn-primary">{t("evoaCta")}</Link>
            <Link href={{ pathname: "/apply", query: { product: "bundle" } }} className="btn-secondary">{t("bundleCta")}</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="card grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">{t("guideTitle")}</h2>
            <p className="mt-2 text-ink-700">{t("guideText")}</p>
          </div>
          <div className="flex items-center gap-3 md:justify-end">
            <Link href="/guide" className="btn-secondary">{t("guideCta")}</Link>
            <Link href="/faq" className="btn-ghost">{t("faqCta")}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
