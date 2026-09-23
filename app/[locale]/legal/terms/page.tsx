import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageMetadata } from "@/i18n/seo";
import { site } from "@/lib/config";
import { OfficialNote } from "@/components/OfficialNote";
import { PRICING } from "@/lib/pricing";
import { WINDOW_HOURS } from "@/lib/window";

type Props = { params: Promise<{ locale: string }> };

const LAST_UPDATED = "2026-09-23";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal.terms" });
  return pageMetadata(locale, "/legal/terms", { title: t("metaTitle") });
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal.terms");
  const sla = {
    acStandard: PRICING.arrivalCard.standardSlaHours,
    acExpress: PRICING.arrivalCard.expressSlaHours,
    evStandard: PRICING.evoa.standardSlaHours,
    evExpress: PRICING.evoa.expressSlaHours,
    window: WINDOW_HOURS,
  };
  return (
    <div className="prose-basic mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-4 text-sm">{t("template", { date: LAST_UPDATED })}</p>
      <h2>{t("s1Title")}</h2>
      <p>{t("s1", { company: site.company, jurisdiction: site.jurisdiction, reg: site.companyReg, address: site.address })}</p>
      <h2>{t("s2Title")}</h2>
      <p>{t("s2")}</p>
      <OfficialNote className="text-sm text-ink-500" />
      <h2>{t("s3Title")}</h2>
      <p>{t("s3")}</p>
      <h2>{t("s4Title")}</h2>
      <p>{t("s4")}</p>
      <h2>{t("s5Title")}</h2>
      <p>{t("s5a", sla)}</p>
      <p>{t("s5b", sla)}</p>
      <p>{t.rich("s5c", { link: (chunks) => <Link href="/legal/refunds">{chunks}</Link> })}</p>
      <h2>{t("s6Title")}</h2>
      <p>{t("s6a", sla)}</p>
      <p>{t("s6b")}</p>
      <p>{t("s6c")}</p>
      <h2>{t("s7Title")}</h2>
      <p>{t.rich("s7", { link: (chunks) => <Link href="/legal/privacy">{chunks}</Link> })}</p>
      <h2>{t("s8Title")}</h2>
      <p>{t("s8")}</p>
      <h2>{t("s9Title")}</h2>
      <p>{t.rich("s9", { email: site.supportEmail, mail: (chunks) => <a href={`mailto:${site.supportEmail}`}>{chunks}</a> })}</p>
      <h2>{t("s10Title")}</h2>
      <p>{t("s10")}</p>
    </div>
  );
}
