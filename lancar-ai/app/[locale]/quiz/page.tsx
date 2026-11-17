import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getDictionary } from "@/content";
import { AUDIT_TIERS, formatIdr, whatsappLink } from "@/lib/config";
import { pageMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Quiz } from "./Quiz";

type Props = { params: Promise<{ locale: AppLocale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { quiz } = getDictionary(locale);
  return pageMetadata(locale, "/quiz", { title: quiz.metaTitle, description: quiz.metaDescription });
}

export default async function QuizPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = getDictionary(locale);
  const tierPrices = Object.fromEntries(AUDIT_TIERS.map((tier) => [tier.id, formatIdr(tier.priceIdr, locale)]));

  return (
    <>
      <PageHeader eyebrow={dict.nav.quiz} title={dict.quiz.title} intro={dict.quiz.intro} />
      <section className="section">
        <div className="container-page max-w-3xl">
          <Quiz
            locale={locale}
            labels={dict.quiz}
            formLabels={dict.form}
            tierNames={dict.pricing.audit.tiers}
            tierPrices={tierPrices}
            whatsappBase={whatsappLink("")}
          />
        </div>
      </section>
    </>
  );
}
