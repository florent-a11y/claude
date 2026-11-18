import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Stethoscope, Info } from "lucide-react";
import { productsOf } from "@/lib/catalog";
import { pageMetadata } from "@/i18n/seo";
import { PageHeader } from "@/components/PageHeader";
import { CatalogGrid } from "@/components/CatalogGrid";
import { Reveal } from "@/components/Reveal";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Listing.peptides" });
  return pageMetadata(locale, "/peptides", { title: t("title"), description: t("intro") });
}

export default async function Peptides({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Listing.peptides");
  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} photo="vials-tray" />
      <section className="container-page py-14">
        <div className="mb-12 grid gap-5 lg:grid-cols-2">
          <Reveal className="flex gap-4 rounded-3xl bg-tide-50 p-6">
            <Stethoscope className="mt-1 h-6 w-6 shrink-0 text-deep-700" strokeWidth={1.6} aria-hidden="true" />
            <div>
              <h2 className="font-display text-2xl font-semibold text-deep-900">{t("noticeTitle")}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{t("notice")}</p>
            </div>
          </Reveal>
          <Reveal index={1} className="flex gap-4 rounded-3xl bg-coral-50 p-6">
            <Info className="mt-1 h-6 w-6 shrink-0 text-coral-600" strokeWidth={1.6} aria-hidden="true" />
            <div>
              <h2 className="font-display text-2xl font-semibold text-deep-900">{t("evidenceTitle")}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{t("evidence")}</p>
            </div>
          </Reveal>
        </div>
        <CatalogGrid slugs={productsOf("peptide").map((p) => p.slug)} />
      </section>
    </>
  );
}
