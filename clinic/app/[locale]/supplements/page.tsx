import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { productsOf } from "@/lib/catalog";
import { pageSeo } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { CatalogGrid } from "@/components/CatalogGrid";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageSeo(locale, "/supplements");
}

export default async function Supplements({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Listing.supplements");
  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} photo="softgels-close" />
      <section className="container-page py-14">
        <CatalogGrid slugs={productsOf("supplement").map((p) => p.slug)} />
        <p className="mt-12 max-w-3xl border-l-2 border-tide-400 pl-4 text-sm leading-relaxed text-ink-500">{t("note")}</p>
      </section>
    </>
  );
}
