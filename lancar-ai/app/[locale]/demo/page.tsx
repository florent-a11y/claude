import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getDictionary } from "@/content";
import { pageMetadata } from "@/lib/seo";
import { FinalCta } from "@/components/FinalCta";
import { PageHeader } from "@/components/PageHeader";
import { DemoChat } from "./DemoChat";

type Props = { params: Promise<{ locale: AppLocale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { demo } = getDictionary(locale);
  return pageMetadata(locale, "/demo", { title: demo.metaTitle, description: demo.metaDescription });
}

export default async function DemoPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = getDictionary(locale);

  return (
    <>
      <PageHeader eyebrow={dict.nav.demo} title={dict.demo.title} intro={dict.demo.intro} />
      <section className="section pt-12! sm:pt-16!">
        <div className="container-page">
          <DemoChat labels={dict.demo} heroLabels={{ ...dict.home.hero.chat, fictional: dict.common.fictional }} />
        </div>
      </section>
      <FinalCta dict={dict} title={dict.demo.ctaTitle} body={dict.demo.ctaBody} />
    </>
  );
}
