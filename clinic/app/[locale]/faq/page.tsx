import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/i18n/seo";
import { site } from "@/lib/config";
import { PageHeader } from "@/components/PageHeader";
import { FaqList } from "@/components/Faq";
import { WhatsAppLink } from "@/components/WhatsAppLink";

type Props = { params: Promise<{ locale: string }> };
const KEYS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10", "q11", "q12"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Faq" });
  return pageMetadata(locale, "/faq", { title: t("title"), description: t("intro") });
}

export default async function Faq({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Faq");
  const c = await getTranslations("Common");
  const items = KEYS.map((k) => ({ q: t(`${k}.q`), a: t(`${k}.a`) }));
  const jsonLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PageHeader title={t("title")} intro={t("intro")} />
      <section className="container-page max-w-4xl py-14">
        <FaqList items={items} />
        <div className="mt-10"><WhatsAppLink label={c("chatOnWhatsapp")} text={c("whatsappGeneral", { brand: site.name })} className="btn-primary" /></div>
      </section>
    </>
  );
}
