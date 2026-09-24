import { OfficialNote } from "@/components/OfficialNote";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ApplyForm } from "./ApplyForm";
import { pageMetadata } from "@/i18n/seo";
import { DATE_RE } from "@/lib/window";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ failed?: string; product?: string; arrival?: string; email?: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Apply" });
  return pageMetadata(locale, "/apply", { title: t("metaTitle"), description: t("metaDescription") });
}

export default async function Apply({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Apply");
  const td = await getTranslations("Disclosure");
  const { failed, product, arrival, email } = await searchParams;
  const initialProduct = product === "evoa" || product === "bundle" ? product : "arrival_card";
  // Prefill from the reminder email link: /apply?arrival=YYYY-MM-DD&email=...
  const initialArrival = arrival && DATE_RE.test(arrival) ? arrival : "";
  const initialEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email.trim().toLowerCase() : "";
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">{initialProduct === "arrival_card" ? t("titleArrivalCard") : initialProduct === "evoa" ? t("titleEvoa") : t("titleBundle")}</h1>
      <OfficialNote className="mt-2 text-sm text-ink-500" />
      <p className="mt-2 text-sm text-ink-500">{td("full")}</p>
      {failed && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t("paymentFailed")}</p>}
      {initialArrival && <p className="mt-4 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-ink-700">{t("welcomeBack", { date: initialArrival, withEmail: initialEmail ? "yes" : "no" })}</p>}
      <ApplyForm initialProduct={initialProduct} initialArrival={initialArrival} initialEmail={initialEmail} />
    </div>
  );
}
