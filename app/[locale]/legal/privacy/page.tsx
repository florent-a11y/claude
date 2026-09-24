import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/i18n/seo";
import { site } from "@/lib/config";

type Props = { params: Promise<{ locale: string }> };

const LAST_UPDATED = "2026-09-23";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal.privacy" });
  return pageMetadata(locale, "/legal/privacy", { title: t("metaTitle"), description: t("metaDescription") });
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal.privacy");
  const tl = await getTranslations("Legal");
  const mail = (chunks: React.ReactNode) => <a href={`mailto:${site.supportEmail}`}>{chunks}</a>;
  return (
    <div className="prose-basic mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-4 text-sm">{t("template", { date: LAST_UPDATED })}</p>
      <h2>{t("controllerTitle")}</h2>
      <p>{tl.rich("operatorContact", { company: site.company, address: site.address, reg: site.companyReg, email: site.supportEmail, mail })}</p>
      <h2>{t("collectTitle")}</h2>
      <ul>
        <li>{t("collect1")}</li>
        <li>{t("collect2")}</li>
        <li>{t("collect3")}</li>
      </ul>
      <h2>{t("purposeTitle")}</h2>
      <p>{t("purpose")}</p>
      <h2>{t("sharingTitle")}</h2>
      <p>{t("sharing")}</p>
      <h2>{t("transfersTitle")}</h2>
      <p>{t("transfers")}</p>
      <h2>{t("retentionTitle")}</h2>
      <p>{t("retention")}</p>
      <h2>{t("rightsTitle")}</h2>
      <p>{t.rich("rights", { email: site.supportEmail, mail })}</p>
      <h2>{t("securityTitle")}</h2>
      <p>{t("security")}</p>
      <h2>{t("cookiesTitle")}</h2>
      <p>{t("cookies")}</p>
    </div>
  );
}
