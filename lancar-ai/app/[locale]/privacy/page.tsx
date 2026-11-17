import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getDictionary } from "@/content";
import { site } from "@/lib/config";
import { pageMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";

type Props = { params: Promise<{ locale: AppLocale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { privacy } = getDictionary(locale);
  return pageMetadata(locale, "/privacy", { title: privacy.metaTitle, description: privacy.metaDescription });
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { privacy } = getDictionary(locale);

  return (
    <>
      <PageHeader title={privacy.title} intro={privacy.updated} />
      <section className="section">
        <div className="container-page prose-basic max-w-3xl">
          {privacy.sections.map((section, index) => (
            <div key={section.title}>
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {index === 0 && site.legalName && <p>{site.legalName}</p>}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
