import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageMetadata } from "@/i18n/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { INFO_LABEL_KEYS, INFO_SLUGS } from "@/lib/info";

type Props = { params: Promise<{ locale: string }> };

const ITEMS = ["fee", "who", "when", "receive", "visa", "evoa", "evoaPrice", "evoaTime", "airports", "mistake", "safety", "refund", "government", "diy"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Faq" });
  return pageMetadata(locale, "/faq", { title: t("metaTitle"), description: t("metaDescription") });
}

export default async function FAQ({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Faq");
  const tf = await getTranslations("Footer");
  const faqs = ITEMS.map((k) => ({ q: t(`items.${k}.q`), a: t(`items.${k}.a`) }));
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", inLanguage: locale, mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <Breadcrumbs path="/faq" />
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <div className="mt-8 divide-y divide-slate-200">
        {faqs.map((f) => (
          <details key={f.q} className="group py-4">
            <summary className="cursor-pointer text-lg font-semibold">{f.q}</summary>
            <p className="mt-2 text-ink-700">{f.a}</p>
          </details>
        ))}
      </div>
      <nav aria-label={t("relatedTitle")} className="mt-10">
        <p className="font-semibold">{t("relatedTitle")}</p>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {INFO_SLUGS.map((slug) => (
            <li key={slug}><Link className="underline underline-offset-2 hover:text-brand-700" href={`/info/${slug}`}>{tf(INFO_LABEL_KEYS[slug])}</Link></li>
          ))}
          <li><Link className="underline underline-offset-2 hover:text-brand-700" href="/guide">{tf("guide")}</Link></li>
        </ul>
      </nav>
    </div>
  );
}
