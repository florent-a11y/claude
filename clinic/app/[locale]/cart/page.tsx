import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/i18n/seo";
import { CartView } from "@/components/CartView";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Cart" });
  return pageMetadata(locale, "/cart", { title: t("title"), noindex: true });
}

export default async function Cart({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Cart");
  return (
    <div className="container-page py-12">
      <h1 className="h-display text-5xl">{t("title")}</h1>
      <div className="mt-8"><CartView /></div>
    </div>
  );
}
