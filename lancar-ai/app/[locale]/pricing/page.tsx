import type { Metadata } from "next";
import { Check } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getDictionary } from "@/content";
import { pageMetadata } from "@/lib/seo";
import { AuditTiers } from "@/components/AuditTiers";
import { BookCallButton } from "@/components/Cta";
import { Faq } from "@/components/Faq";
import { FinalCta } from "@/components/FinalCta";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/Reveal";

type Props = { params: Promise<{ locale: AppLocale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { pricing } = getDictionary(locale);
  return pageMetadata(locale, "/pricing", { title: pricing.metaTitle, description: pricing.metaDescription });
}

export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = getDictionary(locale);
  const { pricing } = dict;

  return (
    <>
      <PageHeader eyebrow={dict.nav.pricing} title={pricing.title} intro={pricing.intro} />

      <section className="section">
        <div className="container-page space-y-6">
          <Reveal className="card flex flex-col gap-5 sm:flex-row sm:items-center sm:p-9">
            <span className="step-number">1</span>
            <div className="flex-1">
              <h2 className="text-2xl font-extrabold tracking-tight text-white">{pricing.call.title}</h2>
              <p className="mt-1 text-lg text-mist-300">{pricing.call.body}</p>
            </div>
            <p className="text-3xl font-extrabold tracking-tight">
              <span className="text-gold">{pricing.call.price}</span>
            </p>
          </Reveal>

          <Reveal className="rounded-3xl border border-gold-400/30 bg-gradient-to-b from-gold-600/[0.12] to-transparent p-6 sm:p-9">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <span className="step-number">2</span>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-white">{pricing.audit.title}</h2>
                <p className="mt-1 text-lg font-semibold text-gold-200">{pricing.audit.credit}</p>
              </div>
            </div>
            <div className="mt-8">
              <AuditTiers dict={dict} locale={locale} />
            </div>
            <h3 className="mt-10 text-[13px] font-bold uppercase tracking-[0.16em] text-gold-300">{pricing.audit.includesTitle}</h3>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {pricing.audit.includes.map((item) => (
                <li key={item} className="flex gap-3 leading-relaxed text-mist-200">
                  <Check size={20} aria-hidden="true" className="mt-1 shrink-0 text-gold-400" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-9">
              <BookCallButton dict={dict} label={pricing.audit.cta} />
            </div>
          </Reveal>

          <div className="grid gap-6 lg:grid-cols-2">
            {(
              [
                [3, pricing.implementation],
                [4, pricing.accompaniment],
              ] as const
            ).map(([n, block], index) => (
              <Reveal key={n} delay={index * 110} className="card glow-card sm:p-9">
                <div className="flex items-center justify-between gap-4">
                  <span className="step-number">{n}</span>
                  <span className="tag">{block.price}</span>
                </div>
                <h2 className="mt-6 text-2xl font-extrabold tracking-tight text-white">{block.title}</h2>
                <p className="mt-2 text-lg leading-relaxed text-mist-300">{block.body}</p>
              </Reveal>
            ))}
          </div>

          <ul className="space-y-2 px-1 pt-3 text-mist-400">
            {pricing.notes.map((note) => (
              <li key={note} className="flex gap-2.5 leading-relaxed">
                <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400/70" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container-page max-w-4xl">
          <Reveal>
            <h2 className="h2">{pricing.faq.title}</h2>
          </Reveal>
          <Reveal className="mt-10">
            <Faq items={pricing.faq.items} />
          </Reveal>
        </div>
      </section>

      <div className="pt-20 sm:pt-28">
        <FinalCta dict={dict} />
      </div>
    </>
  );
}
