import { OfficialNote } from "@/components/OfficialNote";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ApplyEntry } from "./ApplyEntry";
import { pageMetadata } from "@/i18n/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Apply" });
  return pageMetadata(locale, "/apply", { title: t("metaTitle"), description: t("metaDescription") });
}

export default async function Apply({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const td = await getTranslations("Disclosure");
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Breadcrumbs path="/apply" />
      <ApplyEntry>
        <OfficialNote className="mt-2 text-sm text-ink-500" />
        <p className="mt-2 text-sm text-ink-500">{td("full")}</p>
      </ApplyEntry>
    </div>
  );
}
