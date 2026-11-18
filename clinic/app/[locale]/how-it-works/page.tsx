import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldAlert, Stethoscope, HeartPulse, MessagesSquare } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { pageMetadata } from "@/i18n/seo";
import { site } from "@/lib/config";
import { PageHeader } from "@/components/PageHeader";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "HowItWorks" });
  return pageMetadata(locale, "/how-it-works", { title: t("title"), description: t("intro") });
}

export default async function HowItWorks({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("HowItWorks");
  const team = [
    { key: "doctor", icon: Stethoscope },
    { key: "nurse", icon: HeartPulse },
    { key: "care", icon: MessagesSquare },
  ] as const;
  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />
      <section className="container-page py-14">
        <ol className="mx-auto max-w-3xl">
          {(["step1", "step2", "step3", "step4", "step5"] as const).map((s, i, all) => (
            <li key={s} className="relative flex gap-6 pb-12 last:pb-0">
              {i < all.length - 1 && <span className="absolute left-6 top-14 h-[calc(100%-3.5rem)] w-px bg-sand-300" aria-hidden="true" />}
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-forest-800 font-display text-xl font-semibold text-sand-50">{i + 1}</span>
              <div>
                <h2 className="font-display text-3xl font-semibold text-forest-900">{t(`${s}.title`)}</h2>
                <p className="mt-2 leading-relaxed text-ink-700">{t(`${s}.text`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="grain border-y border-sand-200 bg-sand-100/70">
        <div className="container-page py-16">
          <h2 className="h-display text-4xl sm:text-5xl">{t("team.title")}</h2>
          <p className="lead mt-4 max-w-3xl">{t("team.text")}</p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {team.map(({ key, icon: Icon }) => (
              <div key={key} className="card">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-forest-700"><Icon className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" /></span>
                <h3 className="mt-5 font-display text-2xl font-semibold text-forest-900">{t(`team.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">{t(`team.${key}.text`, { opens: site.opens, closes: site.closes })}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-clay-50 p-8 sm:p-10">
          <ShieldAlert className="h-7 w-7 text-clay-600" strokeWidth={1.6} aria-hidden="true" />
          <h2 className="mt-4 font-display text-3xl font-semibold text-forest-900">{t("safety.title")}</h2>
          <p className="mt-3 leading-relaxed text-ink-700">{t("safety.text")}</p>
          <p className="mt-4 font-semibold text-forest-900">{t("safety.emergency")}</p>
        </div>
        <div className="mt-10 text-center"><Link href="/iv-drips" className="btn-primary">{t("cta")}</Link></div>
      </section>
    </>
  );
}
