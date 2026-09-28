import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { intlLocale, routing } from "@/i18n/routing";
import { pageMetadata } from "@/i18n/seo";
import { JsonLd } from "@/components/JsonLd";
import { OfficialNote } from "@/components/OfficialNote";
import { site } from "@/lib/config";
import { EVOA } from "@/lib/evoa";
import { BALI_LEVY_IDR, BALI_LEVY_URL, INFO_LABEL_KEYS, INFO_SLUGS, isInfoSlug } from "@/lib/info";
import { PRICING, money } from "@/lib/pricing";

const ext = { target: "_blank", rel: "noopener nofollow" } as const;

type Section = { h: string; p: string; items?: string[]; after?: string; table?: { head: string[]; rows: string[][] } };
type Props = { params: Promise<{ locale: string; slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => INFO_SLUGS.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isInfoSlug(slug)) return {};
  const t = await getTranslations({ locale, namespace: `Landing.${slug}` });
  return pageMetadata(locale, `/info/${slug}`, { title: t("metaTitle"), description: t("metaDescription") });
}

export default async function InfoPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isInfoSlug(slug)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations(`Landing.${slug}`);
  const tc = await getTranslations("Landing.common");
  const tf = await getTranslations("Footer");
  const intl = intlLocale(locale);
  const idr = (n: number) => new Intl.NumberFormat(intl, { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  const values = {
    price: money(PRICING.arrivalCard.first, PRICING.currency, intl),
    additional: money(PRICING.arrivalCard.additional, PRICING.currency, intl),
    evoaPrice: money(PRICING.evoa.first, PRICING.currency, intl),
    evoaFee: idr(EVOA.governmentFeeIdr),
    evoaDays: EVOA.validityDays,
    bundleSave: money(PRICING.bundleDiscount, PRICING.currency, intl),
    levy: idr(BALI_LEVY_IDR),
    apply: (chunks: React.ReactNode) => <Link href="/apply">{chunks}</Link>,
    reminder: (chunks: React.ReactNode) => <Link href="/reminder">{chunks}</Link>,
    evoa: (chunks: React.ReactNode) => <Link href="/evoa">{chunks}</Link>,
    guide: (chunks: React.ReactNode) => <Link href="/guide">{chunks}</Link>,
    customs: (chunks: React.ReactNode) => <Link href="/customs">{chunks}</Link>,
    faq: (chunks: React.ReactNode) => <Link href="/faq">{chunks}</Link>,
    portal: (chunks: React.ReactNode) => <a href={site.officialPortal} {...ext}>{chunks}</a>,
    retrieve: (chunks: React.ReactNode) => <a href={site.officialRetrieve} {...ext}>{chunks}</a>,
    lovebali: (chunks: React.ReactNode) => <a href={BALI_LEVY_URL} {...ext}>{chunks}</a>,
    strong: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
  };
  const sections = t.raw("sections") as Section[];
  const faqs = t.raw("faqs") as Array<{ q: string; a: string }>;
  const related = INFO_SLUGS.filter((s) => s !== slug);

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: t("title"),
          description: t("metaDescription"),
          inLanguage: locale,
          dateModified: "2026-09-28",
          author: { "@type": "Organization", name: site.company },
          publisher: { "@type": "Organization", name: site.name },
          mainEntityOfPage: `${site.url}${locale === routing.defaultLocale ? "" : `/${locale}`}/info/${slug}`,
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          inLanguage: locale,
          mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />

      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{tc("kicker")}</p>
      <h1 className="mt-2 text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <div className="prose-basic mt-6">
        <p className="text-lg">{t.rich("intro", values)}</p>
      </div>
      <OfficialNote className="mt-2 text-sm text-ink-500" />

      <div className="prose-basic">
        {sections.map((s, i) => (
          <section key={i}>
            <h2>{s.h}</h2>
            <p>{t.rich(`sections.${i}.p`, values)}</p>
            {s.items && (
              <ul>
                {s.items.map((_, j) => <li key={j}>{t.rich(`sections.${i}.items.${j}`, values)}</li>)}
              </ul>
            )}
            {s.table && (
              <div className="overflow-x-auto">
                <table>
                  <thead><tr>{s.table.head.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
                  <tbody>
                    {s.table.rows.map((row, r) => (
                      <tr key={r}>{row.map((c, j) => <td key={j} className={j === 0 ? "font-medium" : undefined}>{t.rich(`sections.${i}.table.rows.${r}.${j}`, values)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {s.after && <p>{t.rich(`sections.${i}.after`, values)}</p>}
          </section>
        ))}
        <h2>{tc("questions")}</h2>
      </div>
      <div className="divide-y divide-slate-200">
        {faqs.map((f) => (
          <details key={f.q} className="group py-4">
            <summary className="cursor-pointer text-lg font-semibold">{f.q}</summary>
            <p className="mt-2 text-ink-700">{f.a}</p>
          </details>
        ))}
      </div>

      <div className="card mt-10 bg-slate-50">
        <h2 className="text-xl font-bold">{t("cta.title")}</h2>
        <p className="mt-2 text-ink-700">{t.rich("cta.text", values)}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/apply" className="btn-primary">{tc("ctaApply", { price: values.price })}</Link>
          <Link href="/guide" className="btn-secondary">{tc("ctaGuide")}</Link>
        </div>
        <p className="mt-4 text-sm text-ink-500">{tc.rich("ctaReminder", { link: (chunks) => <Link className="underline" href="/reminder">{chunks}</Link> })}</p>
        <OfficialNote className="mt-1 text-sm text-ink-500" />
      </div>

      <nav aria-label={tc("related")} className="mt-10">
        <p className="font-semibold">{tc("related")}</p>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {related.map((s) => (
            <li key={s}><Link className="underline underline-offset-2 hover:text-brand-700" href={`/info/${s}`}>{tf(INFO_LABEL_KEYS[s])}</Link></li>
          ))}
          <li><Link className="underline underline-offset-2 hover:text-brand-700" href="/guide">{tf("guide")}</Link></li>
          <li><Link className="underline underline-offset-2 hover:text-brand-700" href="/faq">{tf("faq")}</Link></li>
        </ul>
      </nav>
    </article>
  );
}
