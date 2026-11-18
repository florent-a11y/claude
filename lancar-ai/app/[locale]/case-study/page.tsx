import type { Metadata } from "next";
import { Check, Info } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getDictionary } from "@/content";
import { pageMetadata } from "@/lib/seo";
import { BookCallButton } from "@/components/Cta";
import { FinalCta } from "@/components/FinalCta";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/Reveal";

type Props = { params: Promise<{ locale: AppLocale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { caseStudy } = getDictionary(locale);
  return pageMetadata(locale, "/case-study", { title: caseStudy.metaTitle, description: caseStudy.metaDescription });
}

export default async function CaseStudyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = getDictionary(locale);
  const c = dict.caseStudy;

  return (
    <>
      <PageHeader eyebrow={c.eyebrow} title={c.title} intro={c.intro}>
        <BookCallButton dict={dict} />
      </PageHeader>

      <section className="section">
        <div className="container-page grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="self-start lg:sticky lg:top-28">
            <Reveal className="rounded-3xl bg-night-950 p-7 text-white sm:p-8">
              <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-gold-300">{c.eyebrow}</p>
              <p className="mt-3 text-2xl font-extrabold tracking-tight">{c.client}</p>
              <p className="mt-1 text-mist-300">{c.clientKind}</p>
            </Reveal>
            <Reveal delay={90}>
              <h2 className="mt-9 text-2xl font-extrabold tracking-tight text-ink-900">{c.challengeTitle}</h2>
            </Reveal>
            <ul className="mt-5 space-y-3">
              {c.challenge.map((item, index) => (
                <Reveal as="li" key={item} delay={index * 80} className="rounded-2xl border border-cloud-200 bg-cloud-50 px-5 py-4 text-lg leading-snug text-ink-700">
                  {item}
                </Reveal>
              ))}
            </ul>
          </div>
          <div>
            <Reveal>
              <h2 className="text-2xl font-extrabold tracking-tight text-ink-900">{c.builtTitle}</h2>
            </Reveal>
            <ul className="mt-6 space-y-4">
              {c.built.map((item, index) => (
                <Reveal as="li" key={item.title} delay={index * 80} className="card glow-card flex gap-5">
                  <span className="font-serif text-4xl italic leading-none text-gold">{index + 1}</span>
                  <div>
                    <h3 className="text-xl font-bold text-ink-900">{item.title}</h3>
                    <p className="mt-2 text-lg leading-relaxed text-ink-600">{item.body}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container-page max-w-4xl">
          <Reveal>
            <h2 className="h2">{c.changedTitle}</h2>
          </Reveal>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {c.changed.map((item, index) => (
              <Reveal as="li" key={item} delay={(index % 2) * 90} className="card flex gap-3 text-lg leading-snug text-ink-700">
                <Check size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-gold-600" />
                {item}
              </Reveal>
            ))}
          </ul>
          <Reveal className="mt-8 flex gap-3 rounded-2xl border border-azure-500/30 bg-azure-500/10 px-5 py-4 text-ink-700">
            <Info size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-azure-600" />
            <p>
              {c.disclosure} {c.note}
            </p>
          </Reveal>
        </div>
      </section>

      <div className="pt-20 sm:pt-28">
        <FinalCta dict={dict} />
      </div>
    </>
  );
}
