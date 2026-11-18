import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldAlert, Stethoscope, HeartPulse, MessagesSquare } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { pageSeo } from "@/lib/seo";
import { site } from "@/lib/config";
import { PageHeader } from "@/components/PageHeader";
import { Photo } from "@/components/Photo";
import { Reveal } from "@/components/Reveal";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageSeo(locale, "/how-it-works");
}

export default async function HowItWorks({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("HowItWorks");
  const team = [
    { key: "doctor", icon: Stethoscope, photo: "stethoscope-tablet" },
    { key: "nurse", icon: HeartPulse, photo: "nurse-scrubs" },
    { key: "care", icon: MessagesSquare, photo: "villa-terrace-pool" },
  ] as const;
  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} photo="doctor-coat" />
      <section className="container-page py-14">
        <ol className="mx-auto max-w-3xl">
          {(["step1", "step2", "step3", "step4", "step5"] as const).map((s, i, all) => (
            <Reveal as="li" key={s} index={i % 2} className="relative flex gap-6 pb-12 last:pb-0">
              {i < all.length - 1 && <span className="absolute left-6 top-14 h-[calc(100%-3.5rem)] w-px bg-mist-300" aria-hidden="true" />}
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-deep-900 text-base font-bold text-lime-400">{i + 1}</span>
              <div>
                <h2 className="font-display text-2xl font-semibold text-deep-900">{t(`${s}.title`)}</h2>
                <p className="mt-2 leading-relaxed text-ink-700">{t(`${s}.text`)}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="border-y border-mist-200 bg-mist-50">
        <div className="container-page py-16">
          <h2 className="h-display text-4xl sm:text-5xl">{t("team.title")}</h2>
          <p className="lead mt-4 max-w-3xl">{t("team.text")}</p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {team.map(({ key, icon: Icon, photo }, i) => (
              <Reveal key={key} index={i}>
              <div className="group h-full overflow-hidden rounded-3xl border border-mist-200 bg-white transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_50px_-30px_rgba(6,32,31,0.4)]">
                <Photo name={photo} sizes="(min-width: 768px) 400px, 100vw" className="aspect-[16/10]" />
                <div className="p-6">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-tide-100 text-deep-700"><Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
                  <h3 className="mt-4 font-display text-xl font-semibold text-deep-900">{t(`team.${key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-700">{t(`team.${key}.text`, { opens: site.opens, closes: site.closes })}</p>
                </div>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <Reveal variant="scale" className="mx-auto max-w-3xl rounded-[2rem] bg-coral-50 p-8 sm:p-10">
          <ShieldAlert className="h-7 w-7 text-coral-600" strokeWidth={1.6} aria-hidden="true" />
          <h2 className="mt-4 font-display text-3xl font-semibold text-deep-900">{t("safety.title")}</h2>
          <p className="mt-3 leading-relaxed text-ink-700">{t("safety.text")}</p>
          <p className="mt-4 font-semibold text-deep-900">{t("safety.emergency")}</p>
        </Reveal>
        <div className="mt-10 text-center"><Link href="/iv-drips" className="btn-primary">{t("cta")}</Link></div>
      </section>
    </>
  );
}
