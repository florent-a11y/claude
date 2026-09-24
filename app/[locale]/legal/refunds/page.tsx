import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageMetadata } from "@/i18n/seo";
import { site } from "@/lib/config";
import { WINDOW_HOURS } from "@/lib/window";

type Props = { params: Promise<{ locale: string }> };

const LAST_UPDATED = "2026-09-23";
const ITEMS = ["deadline", "cancelBefore", "cancelAfter", "noLongerNeeded", "tooEarly", "evoaFee", "evoaRefused", "ourError"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal.refunds" });
  return pageMetadata(locale, "/legal/refunds", { title: t("metaTitle"), description: t("metaDescription") });
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal.refunds");
  const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
  return (
    <div className="prose-basic mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-4 text-sm">{t("updated", { date: LAST_UPDATED })}</p>
      <ul className="mt-4">
        {ITEMS.map((k) => <li key={k}>{t.rich(`items.${k}`, { strong, hours: WINDOW_HOURS })}</li>)}
      </ul>
      <p className="mt-4">{t("timing")}</p>
      <p className="mt-4">{t.rich("disputes", { email: site.supportEmail, mail: (chunks) => <a href={`mailto:${site.supportEmail}`}>{chunks}</a>, terms: (chunks) => <Link href="/legal/terms">{chunks}</Link> })}</p>
    </div>
  );
}
