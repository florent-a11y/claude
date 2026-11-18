import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2, Clock, MapPin, Stethoscope, XCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { pageMetadata } from "@/i18n/seo";
import { getProduct } from "@/lib/catalog";
import { site } from "@/lib/config";
import { idr } from "@/lib/money";
import { getOrder } from "@/lib/store";
import { tokenMatches } from "@/lib/orders";
import { availableMethods, bankDetails, cardQuote } from "@/lib/pay/methods";
import { syncPayment } from "@/lib/pay/start";
import type { OrderLine, OrderStatus } from "@/lib/schema";
import { PaymentPanel } from "@/components/PaymentPanel";
import { WhatsAppLink } from "@/components/WhatsAppLink";

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ t?: string; paid?: string; pay?: string }> };

export const dynamic = "force-dynamic";

const TAGS: Record<string, string> = { en: "en-GB", ru: "ru-RU", fr: "fr-FR" };
const TONE: Record<OrderStatus, string> = {
  awaiting_review: "bg-coral-50 text-coral-600", awaiting_payment: "bg-mist-200 text-deep-900", payment_review: "bg-mist-200 text-deep-900",
  confirmed: "bg-tide-200 text-deep-900", out_for_delivery: "bg-tide-200 text-deep-900", completed: "bg-tide-200 text-deep-900",
  declined: "bg-mist-200 text-ink-700", cancelled: "bg-mist-200 text-ink-700", refunded: "bg-mist-200 text-ink-700",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Order" });
  return pageMetadata(locale, `/order/${id}`, { title: t("title", { id }), noindex: true });
}

export default async function OrderPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Order");
  const cat = await getTranslations("Catalog.items");

  let order = await getOrder(id);
  if (!order || !tokenMatches(order, query.t)) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="h-display text-5xl">{t("notFound.title")}</h1>
        <p className="lead mx-auto mt-4 max-w-md">{t("notFound.text")}</p>
        <Link href="/contact" className="btn-primary mt-8">{(await getTranslations("Common"))("contactUs")}</Link>
      </div>
    );
  }
  if (query.paid === "1") order = await syncPayment(order);

  const tag = TAGS[locale] ?? "en-GB";
  const dateTime = (iso: string) => new Intl.DateTimeFormat(tag, { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Makassar" }).format(new Date(iso));
  const day = (ymd: string) => new Intl.DateTimeFormat(tag, { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));
  const lineName = (l: OrderLine) => (getProduct(l.slug) ? cat(`${l.slug}.name`) : l.name);
  const StatusIcon = order.status === "awaiting_review" ? Stethoscope : ["declined", "cancelled", "refunded"].includes(order.status) ? XCircle : ["awaiting_payment", "payment_review"].includes(order.status) ? Clock : CheckCircle2;
  const payOnDelivery = !order.paid && order.paymentMethod === "cod" && (order.status === "confirmed" || order.status === "out_for_delivery");
  const f = order.fulfilment;
  const needsPlace = order.lines.some((l) => l.session || l.kind !== "membership");

  return (
    <div className="container-page max-w-4xl py-12">
      <p className="eyebrow">{t("placed", { date: dateTime(order.createdAt) })}</p>
      <h1 className="h-display mt-3 text-5xl">{t("title", { id: order.id })}</h1>

      <div className="mt-8 rounded-[2rem] border border-mist-200 bg-white/70 p-6 sm:p-8">
        <span className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ${TONE[order.status]}`}>
          <StatusIcon className="h-4 w-4" aria-hidden="true" />{t(`status.${order.status}.label`)}
        </span>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">{t(`status.${order.status}.text`)}</p>
        {order.review?.decision === "approved" && order.status === "awaiting_payment" && <p className="mt-2 font-semibold text-deep-900">{t("approvedNote")}</p>}
        {order.review?.decision === "partly_approved" && <p className="mt-2 font-semibold text-deep-900">{t("partlyApprovedNote")}</p>}
        {order.review?.note && (
          <blockquote className="mt-4 border-l-2 border-coral-400 pl-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-coral-500">{t("doctorNote")}</p>
            <p className="mt-1 whitespace-pre-line leading-relaxed text-ink-700">{order.review.note}</p>
          </blockquote>
        )}
        {payOnDelivery && <p className="mt-4 font-semibold text-deep-900">{t("codPending", { amount: idr(order.totalIdr, locale) })}</p>}
        {order.paid && order.paidAt && <p className="mt-4 inline-flex items-center gap-2 font-semibold text-deep-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{t("paidOn", { date: dateTime(order.paidAt) })}</p>}
      </div>

      {order.status === "awaiting_payment" && (
        <div className="mt-10">
          <PaymentPanel
            orderId={order.id} token={order.token} methods={availableMethods()} bank={bankDetails()}
            totalLabel={idr(order.totalIdr, locale)} cardCharge={cardQuote(order.totalIdr)}
            failed={query.pay === "failed"} processing={query.paid === "1"}
          />
        </div>
      )}

      <div className="mt-10 grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="order-items">
          <h2 id="order-items" className="font-display text-2xl font-semibold text-deep-900">{t("items")}</h2>
          <ul className="mt-3 divide-y divide-mist-200 border-y border-mist-200 text-sm">
            {order.lines.map((l) => (
              <li key={l.slug} className="flex justify-between gap-4 py-3">
                <span className="font-medium text-deep-900">{l.qty} × {lineName(l)}</span>
                <span className="whitespace-nowrap">{idr(l.unitIdr * l.qty, locale)}</span>
              </li>
            ))}
            {order.removedLines?.map((l) => (
              <li key={`removed-${l.slug}`} className="flex justify-between gap-4 py-3 text-ink-500">
                <span className="line-through">{l.qty} × {lineName(l)}</span>
                <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider">{t("removed")}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-700">{t("totals.subtotal")}</dt><dd>{idr(order.subtotalIdr, locale)}</dd></div>
            {order.deliveryIdr > 0 && <div className="flex justify-between"><dt className="text-ink-700">{t("totals.delivery")}</dt><dd>{idr(order.deliveryIdr, locale)}</dd></div>}
            {order.calloutIdr > 0 && <div className="flex justify-between"><dt className="text-ink-700">{t("totals.callout")}</dt><dd>{idr(order.calloutIdr, locale)}</dd></div>}
            <div className="flex items-baseline justify-between border-t border-mist-200 pt-3">
              <dt className="font-semibold text-deep-900">{t("totals.total")}</dt>
              <dd className="font-display text-3xl font-semibold text-deep-900">{idr(order.totalIdr, locale)}</dd>
            </div>
          </dl>
        </section>

        <div className="space-y-6">
          {needsPlace && (
            <section className="card" aria-labelledby="order-where">
              <h2 id="order-where" className="font-display text-2xl font-semibold text-deep-900">{t("fulfilment.title")}</h2>
              <p className="mt-3 flex gap-2.5 text-sm text-ink-700">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-deep-700" aria-hidden="true" />
                <span>
                  <span className="font-semibold text-deep-900">{f.mode === "address" ? t("fulfilment.address") : t("fulfilment.clinic")}</span>
                  {f.mode === "address" && <span className="block">{f.area}<br />{f.address}</span>}
                  {f.mode === "clinic" && site.address && <span className="block">{site.address}</span>}
                </span>
              </p>
              <p className="mt-3 flex gap-2.5 text-sm text-ink-700">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-deep-700" aria-hidden="true" />
                {f.date ? t("fulfilment.window", { date: day(f.date), slot: f.slot ? f.slot.replace("-", " – ") : "" }).replace(/,\s*$/, "") : t("fulfilment.toConfirm")}
              </p>
            </section>
          )}
          <section className="rounded-3xl bg-tide-100/70 p-6">
            <h2 className="font-semibold text-deep-900">{t("help")}</h2>
            <div className="mt-3 flex flex-wrap gap-3">
              <WhatsAppLink label="WhatsApp" text={t("whatsappText", { brand: site.name, id: order.id })} className="btn-secondary btn-sm" fallback={<a className="btn-secondary btn-sm" href={`mailto:${site.email}?subject=${encodeURIComponent(order.id)}`}>{site.email}</a>} />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-500">{t("keepLink")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
