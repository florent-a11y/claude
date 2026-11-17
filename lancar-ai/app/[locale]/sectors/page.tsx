import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getDictionary } from "@/content";
import { pageMetadata } from "@/lib/seo";
import { FinalCta } from "@/components/FinalCta";
import { PageHeader } from "@/components/PageHeader";
import { SectorCards } from "@/components/SectorCards";

type Props = { params: Promise<{ locale: AppLocale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { sectors } = getDictionary(locale);
  return pageMetadata(locale, "/sectors", { title: sectors.metaTitle, description: sectors.metaDescription });
}

export default async function SectorsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = getDictionary(locale);

  return (
    <>
      <PageHeader eyebrow={dict.nav.sectors} title={dict.sectors.title} intro={dict.sectors.intro} />
      <section className="section">
        <div className="container-page">
          <SectorCards dict={dict} locale={locale} />
        </div>
      </section>
      <FinalCta dict={dict} />
    </>
  );
}
