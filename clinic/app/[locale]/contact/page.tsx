import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Clock, Mail, MapPin } from "lucide-react";
import { pageMetadata } from "@/i18n/seo";
import { site } from "@/lib/config";
import { PageHeader } from "@/components/PageHeader";
import { LeadForm } from "@/components/LeadForm";
import { WhatsAppLink } from "@/components/WhatsAppLink";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Contact" });
  return pageMetadata(locale, "/contact", { title: t("title"), description: t("intro", { opens: site.opens, closes: site.closes }) });
}

export default async function Contact({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Contact");
  const c = await getTranslations("Common");
  return (
    <>
      <PageHeader title={t("title")} intro={t("intro", { opens: site.opens, closes: site.closes })} photo="villa-living-room">
        <div className="mt-7"><WhatsAppLink label={t("whatsappCta")} text={c("whatsappGeneral", { brand: site.name })} className="btn-primary" /></div>
      </PageHeader>
      <section className="container-page grid gap-12 py-14 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <dl className="space-y-7">
            <div className="flex gap-4">
              <Mail className="mt-1 h-5 w-5 shrink-0 text-deep-700" strokeWidth={1.6} aria-hidden="true" />
              <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-tide-600">{t("emailLabel")}</dt><dd className="mt-1"><a className="underline underline-offset-4" href={`mailto:${site.email}`}>{site.email}</a></dd></div>
            </div>
            <div className="flex gap-4">
              <Clock className="mt-1 h-5 w-5 shrink-0 text-deep-700" strokeWidth={1.6} aria-hidden="true" />
              <div><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-tide-600">{t("hoursLabel")}</dt><dd className="mt-1">{t("hours", { opens: site.opens, closes: site.closes })}</dd></div>
            </div>
            <div className="flex gap-4">
              <MapPin className="mt-1 h-5 w-5 shrink-0 text-deep-700" strokeWidth={1.6} aria-hidden="true" />
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-tide-600">{t("addressLabel")}</dt>
                <dd className="mt-1">{site.address || t("addressPending")}</dd>
                {site.mapsUrl && <dd className="mt-1"><a className="text-sm underline underline-offset-4" href={site.mapsUrl} target="_blank" rel="noopener noreferrer">{t("map")}</a></dd>}
              </div>
            </div>
          </dl>
          <p className="mt-10 rounded-2xl bg-coral-50 px-5 py-4 text-sm font-medium text-deep-900">{t("emergency")}</p>
        </div>
        <div className="card p-8">
          <h2 className="font-display text-3xl font-semibold text-deep-900">{t("form.title")}</h2>
          <div className="mt-6"><LeadForm /></div>
        </div>
      </section>
    </>
  );
}
