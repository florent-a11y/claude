import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Clock, MapPin, Plane, Snowflake } from "lucide-react";
import { pageSeo } from "@/lib/seo";
import { FREE_DELIVERY_FROM_IDR, ZONES, site } from "@/lib/config";
import { idr } from "@/lib/money";
import { PageHeader } from "@/components/PageHeader";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { Reveal } from "@/components/Reveal";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageSeo(locale, "/delivery");
}

export default async function Delivery({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Delivery");
  const c = await getTranslations("Common");
  const info = [
    { key: "windows", icon: Clock, text: t("windows.text") },
    { key: "cold", icon: Snowflake, text: t("cold.text") },
    { key: "clinic", icon: MapPin, text: `${t("clinic.text")} ${site.address || t("clinic.pending")}` },
    { key: "abroad", icon: Plane, text: t("abroad.text") },
  ] as const;
  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} intro={t("intro", { opens: site.opens, closes: site.closes })} photo="villa-aerial" />
      <section className="container-page py-14">
        <Reveal className="overflow-x-auto rounded-3xl border border-mist-200 bg-white/70">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-mist-100 text-xs uppercase tracking-[0.16em] text-ink-500">
              <tr>
                <th scope="col" className="px-6 py-4 font-semibold">{t("table.area")}</th>
                <th scope="col" className="px-6 py-4 font-semibold">{t("table.delivery")}</th>
                <th scope="col" className="px-6 py-4 font-semibold">{t("table.callout")}</th>
                <th scope="col" className="px-6 py-4 font-semibold">{t("table.eta")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist-200">
              {ZONES.map((z) => (
                <tr key={z.id}>
                  <th scope="row" className="px-6 py-5 font-medium leading-relaxed text-deep-900">{z.areas.join(", ")}</th>
                  <td className="px-6 py-5 text-ink-700">{idr(z.deliveryIdr, locale)}</td>
                  <td className="px-6 py-5 text-ink-700">{idr(z.calloutIdr, locale)}</td>
                  <td className="px-6 py-5 text-ink-700">{t("eta", { minutes: z.etaMin })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
        <p className="mt-5 max-w-3xl text-sm leading-relaxed text-ink-700">{t("freeFrom", { amount: idr(FREE_DELIVERY_FROM_IDR, locale) })}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <p className="text-sm text-ink-700">{t("elsewhere")}</p>
          <WhatsAppLink label={c("chatOnWhatsapp")} text={c("whatsappGeneral", { brand: site.name })} className="btn-secondary btn-sm" />
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {info.map(({ key, icon: Icon, text }, i) => (
            <Reveal key={key} index={i % 2} className="card transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_50px_-30px_rgba(6,32,31,0.4)]">
              <Icon className="h-6 w-6 text-deep-700" strokeWidth={1.6} aria-hidden="true" />
              <h2 className="mt-4 font-display text-2xl font-semibold text-deep-900">{t(`${key}.title`)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{text}</p>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}
