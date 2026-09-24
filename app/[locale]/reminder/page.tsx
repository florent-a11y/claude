import { OfficialNote } from "@/components/OfficialNote";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/routing";
import { pageMetadata } from "@/i18n/seo";
import { ReminderForm } from "@/components/ReminderForm";
import { JsonLd } from "@/components/JsonLd";
import { site } from "@/lib/config";
import { PRICING, money } from "@/lib/pricing";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ unsubscribed?: string; arrival?: string; email?: string }> };

const STEPS = ["set", "email", "choose"] as const;
const FAQS = ["whyNotToday", "free", "mustBuy", "evoa", "government"] as const;

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Reminder" });
  return pageMetadata(locale, "/reminder", { title: t("metaTitle"), description: t("metaDescription") });
}

export default async function ReminderPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Reminder");
  const tc = await getTranslations("Common");
  const td = await getTranslations("Disclosure");
  const price = money(PRICING.arrivalCard.first, PRICING.currency, intlLocale(locale));
  const sp = await searchParams;
  const initialArrival = sp.arrival && /^\d{4}-\d{2}-\d{2}$/.test(sp.arrival) ? sp.arrival : "";
  const initialEmail = sp.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sp.email) ? sp.email : "";
  const faqs = FAQS.map((k) => ({ q: t(`faqs.${k}.q`), a: t(`faqs.${k}.a`) }));
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", inLanguage: locale, mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <p className="mb-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">{t("badge")}</p>
            <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">{t("title")}</h1>
      <OfficialNote className="mt-2 text-sm text-ink-500" />
            <p className="mt-5 text-lg text-ink-700">{t("lead")}</p>
            <ul className="mt-6 space-y-2 text-ink-700">
              <li className="flex gap-2"><span aria-hidden className="text-brand-600">✓</span> {t("bullet1")}</li>
              <li className="flex gap-2"><span aria-hidden className="text-brand-600">✓</span> {t("bullet2")}</li>
              <li className="flex gap-2"><span aria-hidden className="text-brand-600">✓</span> {t("bullet3")}</li>
            </ul>
            <p className="mt-6 text-sm text-ink-500">{tc.rich("notAffiliated", { link: (chunks) => <Link className="underline" href="/legal/disclosure">{chunks}</Link> })}</p>
          </div>
          <div id="reminder-form" className="card border-brand-100 scroll-mt-24">
            {sp.unsubscribed === "1" && <p className="mb-4 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-ink-700">{t("unsubscribed")}</p>}
            {sp.unsubscribed === "0" && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t("unsubscribeInvalid", { email: site.supportEmail })}</p>}
            <h2 className="text-xl font-bold">{t("formTitle")}</h2>
            <p className="mt-1 text-sm text-ink-500">{t("formText")}</p>
            <div className="mt-4"><ReminderForm initialArrival={initialArrival} initialEmail={initialEmail} /></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-3xl font-bold">{t("ruleTitle")}</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="card">
            <p className="text-ink-700">{t("rule1")}</p>
            <p className="mt-3 text-ink-700">{t("rule2")}</p>
          </div>
          <div className="card">
            <p className="text-ink-700">{t("rule3")}</p>
            <p className="mt-3 text-ink-700">{t.rich("rule4", { link: (chunks) => <Link className="underline" href="/evoa">{chunks}</Link> })}</p>
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-3xl font-bold">{t("howTitle")}</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s} className="card">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 font-semibold">{t(`steps.${s}.t`)}</h3>
                <p className="mt-1 text-sm text-ink-700">{t(`steps.${s}.d`, { price })}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#reminder-form" className="btn-primary">{t("ctaSet")}</a>
            <Link href="/guide" className="btn-secondary">{t("ctaGuide")}</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-2xl font-bold">{t("questionsTitle")}</h2>
        <div className="mt-4 divide-y divide-slate-200">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer font-semibold">{f.q}</summary>
              <p className="mt-2 text-ink-700">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{td("full")}</p>
      </section>
    </>
  );
}
