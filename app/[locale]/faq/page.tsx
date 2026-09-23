import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/i18n/seo";
import { JsonLd } from "@/components/JsonLd";

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
  const faqs = ITEMS.map((k) => ({ q: t(`items.${k}.q`), a: t(`items.${k}.a`) }));
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", inLanguage: locale, mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <div className="mt-8 divide-y divide-slate-200">
        {faqs.map((f) => (
          <details key={f.q} className="group py-4">
            <summary className="cursor-pointer text-lg font-semibold">{f.q}</summary>
            <p className="mt-2 text-ink-700">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
