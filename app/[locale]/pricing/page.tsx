import { OfficialNote } from "@/components/OfficialNote";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/routing";
import { localizedPath, pageMetadata } from "@/i18n/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PriceCard } from "@/components/PriceCard";
import { JsonLd } from "@/components/JsonLd";
import { PRICING, money, quote } from "@/lib/pricing";
import { EVOA } from "@/lib/evoa";
import { site } from "@/lib/config";

type Props = { params: Promise<{ locale: string }> };

const INCLUDED = ["form", "review", "submission", "checklist", "support"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Pricing" });
  return pageMetadata(locale, "/pricing", { title: t("metaTitle"), description: t("metaDescription") });
}

export default async function Pricing({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Pricing");
  const tp = await getTranslations("PriceCard");
  const m = (cents: number) => money(cents, PRICING.currency, intlLocale(locale));
  const usd = (cents: number) => (cents / 100).toFixed(2);
  const applyUrl = (product?: string) => `${site.url}/apply${product ? `?product=${product}` : ""}`;
  const offer = (name: string, cents: number, url: string) => ({ "@type": "Offer", name, price: usd(cents), priceCurrency: PRICING.currency, url, availability: "https://schema.org/InStock" });
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "Service",
        name: t("arrivalCardTitle"),
        serviceType: t("arrivalCardTitle"),
        provider: { "@id": `${site.url}/#organization` },
        areaServed: "Indonesia",
        inLanguage: locale,
        url: `${site.url}${localizedPath(locale, "/pricing")}`,
        offers: [
          offer(tp("first"), PRICING.arrivalCard.first, applyUrl()),
          offer(tp("additional"), PRICING.arrivalCard.additional, applyUrl()),
          offer(`${t("evoaTitle")}: ${t("serviceFirst")}`, PRICING.evoa.first, applyUrl("evoa")),
          offer(`${t("evoaTitle")}: ${t("serviceAdditional")}`, PRICING.evoa.additional, applyUrl("evoa")),
          offer(t("express", { hours: PRICING.arrivalCard.expressSlaHours }), PRICING.express, applyUrl()),
        ],
      }} />
      <Breadcrumbs path="/pricing" />
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <OfficialNote className="mt-2 text-sm text-ink-500" />
      <h2 className="mt-8 text-xl font-bold">{t("arrivalCardTitle")}</h2>
      <p className="mt-2 text-ink-700">{t("intro")}</p>
      <div className="mt-8"><PriceCard /></div>
      <div className="prose-basic mt-10">
        <h2>{t("examples")}</h2>
        <table>
          <thead><tr><th>{t("booking")}</th><th>{t("standard", { hours: PRICING.arrivalCard.standardSlaHours })}</th><th>{t("express", { hours: PRICING.arrivalCard.expressSlaHours })}</th></tr></thead>
          <tbody>
            {[1, 2, 4].map((n) => {
              const base = PRICING.arrivalCard.first + (n - 1) * PRICING.arrivalCard.additional;
              return <tr key={n}><td>{t("travelers", { count: n })}</td><td>{m(base)}</td><td>{m(base + PRICING.express)}</td></tr>;
            })}
          </tbody>
        </table>
        <h2>{t("evoaTitle")}</h2>
        <table>
          <thead><tr><th>{t("perTraveler")}</th><th>{t("amount")}</th></tr></thead>
          <tbody>
            <tr><td>{t("governmentFee", { idr: EVOA.governmentFeeIdr.toLocaleString(intlLocale(locale)) })}</td><td>{m(PRICING.evoa.governmentFee)}</td></tr>
            <tr><td>{t("serviceFirst")}</td><td>{m(PRICING.evoa.first)}</td></tr>
            <tr><td>{t("serviceAdditional")}</td><td>{m(PRICING.evoa.additional)}</td></tr>
            <tr><td>{t("bundleDiscount")}</td><td>{t("minus", { price: m(PRICING.bundleDiscount) })}</td></tr>
            <tr><td>{t("expressEvoa", { hours: PRICING.evoa.expressSlaHours })}</td><td>{t("plus", { price: m(PRICING.express) })}</td></tr>
          </tbody>
        </table>
        <table>
          <thead><tr><th>{t("booking")}</th><th>{t("evoaOnly")}</th><th>{t("evoaBundle")}</th></tr></thead>
          <tbody>
            {[1, 2, 4].map((n) => <tr key={n}><td>{t("travelers", { count: n })}</td><td>{m(quote(n, false, "evoa").total)}</td><td>{m(quote(n, false, "bundle").total)}</td></tr>)}
          </tbody>
        </table>
        <p>{t.rich("visaFeeNote", { link: (chunks) => <Link href="/evoa">{chunks}</Link> })}</p>
        <h2>{t("includedTitle")}</h2>
        <ul>
          {INCLUDED.map((k) => <li key={k}>{t(`included.${k}`)}</li>)}
        </ul>
        <h2>{t("refundsTitle")}</h2>
        <p>{t.rich("refunds", { link: (chunks) => <Link href="/legal/refunds">{chunks}</Link> })}</p>
      </div>
    </div>
  );
}
