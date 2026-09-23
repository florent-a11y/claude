import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/i18n/seo";
import { site } from "@/lib/config";
import { OfficialNote } from "@/components/OfficialNote";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal.disclosure" });
  return pageMetadata(locale, "/legal/disclosure", { title: t("metaTitle") });
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal.disclosure");
  const tl = await getTranslations("Legal");
  const td = await getTranslations("Disclosure");
  return (
    <div className="prose-basic mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-4">{td("full")}</p>
      <h2>{t("meaningTitle")}</h2>
      <ul>
        <li><OfficialNote className="text-sm text-ink-500" /></li>
        <li>{t("meaning1")}</li>
        <li>{t("meaning2")}</li>
        <li>{t("meaning3")}</li>
      </ul>
      <h2>{t("operatorTitle")}</h2>
      <p>{tl.rich("operatorContact", { company: site.company, address: site.address, reg: site.companyReg, email: site.supportEmail, mail: (chunks) => <a href={`mailto:${site.supportEmail}`}>{chunks}</a> })}</p>
    </div>
  );
}
