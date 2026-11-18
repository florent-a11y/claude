import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/i18n/seo";
import { BOOKING_DAYS_AHEAD, baliToday } from "@/lib/config";
import { availableMethods, cardRate } from "@/lib/pay/methods";
import { CheckoutForm } from "@/components/CheckoutForm";

type Props = { params: Promise<{ locale: string }> };

/** Payment methods and "today in Bali" are read at request time. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Checkout" });
  return pageMetadata(locale, "/checkout", { title: t("title"), noindex: true });
}

export default async function Checkout({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Checkout");
  const today = baliToday();
  const max = new Date(`${today}T00:00:00Z`);
  max.setUTCDate(max.getUTCDate() + BOOKING_DAYS_AHEAD);
  return (
    <div className="container-page py-12">
      <h1 className="h-display text-5xl">{t("title")}</h1>
      <div className="mt-10">
        <CheckoutForm methods={availableMethods()} card={cardRate()} today={today} maxDate={max.toISOString().slice(0, 10)} />
      </div>
    </div>
  );
}
