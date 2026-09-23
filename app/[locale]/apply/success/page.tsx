import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageMetadata } from "@/i18n/seo";
import { getOrder } from "@/lib/store";
import { PRICING } from "@/lib/pricing";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ order?: string; dev?: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Success" });
  return pageMetadata(locale, "/apply/success", { title: t("metaTitle"), noindex: true });
}

export default async function Success({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Success");
  const tp = await getTranslations("Products");
  const { order: id, dev } = await searchParams;
  const order = id ? await getOrder(id).catch(() => null) : null;
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-100 text-3xl text-brand-700">✓</div>
      <h1 className="mt-6 text-3xl font-bold">{t("title")}</h1>
      {order ? (
        <p className="mt-3 text-ink-700">
          {t.rich("order", { id: order.id.slice(0, 8).toUpperCase(), product: tp(order.product), email: order.contact.email, strong: (chunks) => <strong>{chunks}</strong> })}
          {order.product !== "evoa" && <> {t("arrivalCardNext", { hours: order.contact.express ? PRICING.arrivalCard.expressSlaHours : PRICING.arrivalCard.standardSlaHours, date: order.travel.arrivalDate })}</>}
          {order.product !== "arrival_card" && <> {t("evoaNext", { hours: order.contact.express ? PRICING.evoa.expressSlaHours : PRICING.evoa.standardSlaHours })}</>}
        </p>
      ) : (
        <p className="mt-3 text-ink-700">{t("confirming")}</p>
      )}
      {dev && <p className="mt-3 text-xs text-amber-700">{t("devMode")}</p>}
      <div className="card mt-8 text-left text-sm">
        <h2 className="font-semibold">{t("nextTitle")}</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-700">
          <li>{t("next1", { evoa: order?.product !== "arrival_card" ? "yes" : "no" })}</li>
          <li>{t("next2")}</li>
          <li>{t("next3")}</li>
          <li>{t("next4")}</li>
        </ol>
      </div>
      <Link href="/guide" className="btn-secondary mt-8">{t("cta")}</Link>
    </div>
  );
}
