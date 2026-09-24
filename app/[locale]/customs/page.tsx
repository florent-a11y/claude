import { OfficialNote } from "@/components/OfficialNote";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/i18n/seo";
import { CustomsCalculator } from "./Calculator";

type Props = { params: Promise<{ locale: string }> };

const ROWS = ["goods", "alcohol", "tobacco", "cash", "phones", "bio", "prohibited"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Customs" });
  return pageMetadata(locale, "/customs", { title: t("metaTitle"), description: t("metaDescription") });
}

export default async function Customs({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Customs");
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <OfficialNote className="mt-2 text-sm text-ink-500" />
      <p className="mt-3 text-ink-700">{t.rich("intro", { link: (chunks) => <a className="underline" href="https://www.beacukai.go.id/" target="_blank" rel="noopener nofollow">{chunks}</a> })}</p>
      <div className="prose-basic mt-6">
        <table>
          <thead><tr><th>{t("colItem")}</th><th>{t("colAllowance")}</th><th>{t("colExceeded")}</th></tr></thead>
          <tbody>
            {ROWS.map((r) => <tr key={r}><td>{t(`rows.${r}.item`)}</td><td>{t(`rows.${r}.allowance`)}</td><td>{t(`rows.${r}.exceeded`)}</td></tr>)}
          </tbody>
        </table>
      </div>
      <h2 className="mt-10 text-2xl font-bold">{t("quickCheck")}</h2>
      <CustomsCalculator />
    </div>
  );
}
