import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/i18n/seo";
import { site } from "@/lib/config";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Contact" });
  return pageMetadata(locale, "/contact", { title: t("metaTitle") });
}

export default async function Contact({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Contact");
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-ink-700">{t("hours")}</p>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="card"><h2 className="font-semibold">{t("email")}</h2><a className="mt-2 block text-brand-600 underline" href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a></div>
        <div className="card"><h2 className="font-semibold">{t("orderQuestions")}</h2><p className="mt-2 text-sm text-ink-700">{t("orderQuestionsText")}</p></div>
      </div>
      <div className="card mt-6 text-sm text-ink-700">
        <p className="font-semibold text-ink-900">{site.company}</p>
        <p className="mt-1">{site.address}</p>
        <p>{site.companyReg}</p>
      </div>
    </div>
  );
}
