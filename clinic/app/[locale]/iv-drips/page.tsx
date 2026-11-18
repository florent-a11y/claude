import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { productsOf } from "@/lib/catalog";
import { pageMetadata } from "@/i18n/seo";
import { PageHeader } from "@/components/PageHeader";
import { CatalogGrid } from "@/components/CatalogGrid";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Listing.iv" });
  return pageMetadata(locale, "/iv-drips", { title: t("title"), description: t("intro") });
}

export default async function IvDrips({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Listing");
  return (
    <>
      <PageHeader eyebrow={t("iv.eyebrow")} title={t("iv.title")} intro={t("iv.intro")} />
      <section className="container-page py-14">
        <CatalogGrid slugs={productsOf("iv").map((p) => p.slug)} />
      </section>
      <section className="container-page pb-6">
        <h2 className="h-display text-4xl">{t("shots.title")}</h2>
        <p className="lead mt-3 max-w-2xl">{t("shots.intro")}</p>
        <div className="mt-8"><CatalogGrid slugs={productsOf("shot").map((p) => p.slug)} filter={false} /></div>
        <p className="mt-12 max-w-3xl border-l-2 border-clay-400 pl-4 text-sm leading-relaxed text-ink-500">{t("iv.note")}</p>
      </section>
    </>
  );
}
