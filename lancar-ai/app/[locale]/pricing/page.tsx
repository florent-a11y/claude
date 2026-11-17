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

type Props = { params: Promise<{ locale: AppLocale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { pricing } = getDictionary(locale);
  return pageMetadata(locale, "/pricing", { title: pricing.metaTitle, description: pricing.metaDescription });
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-950 text-lg font-extrabold text-marigold-300">
      {n}
    </span>
  );
}

export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = getDictionary(locale);
  const { pricing } = dict;

  return (
    <>
      <PageHeader title={pricing.title} intro={pricing.intro} />

      <section className="section">
        <div className="container-page space-y-6">
          <div className="card flex flex-col gap-5 sm:flex-row sm:items-center sm:p-9">
            <StepNumber n={1} />
            <div className="flex-1">
              <h2 className="text-2xl font-extrabold tracking-tight text-ink-950">{pricing.call.title}</h2>
              <p className="mt-1 text-lg text-ink-600">{pricing.call.body}</p>
            </div>
            <p className="text-3xl font-extrabold tracking-tight text-sea-700">{pricing.call.price}</p>
          </div>

          <div className="card sm:p-9">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <StepNumber n={2} />
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-ink-950">{pricing.audit.title}</h2>
                <p className="mt-1 text-lg font-semibold text-sea-700">{pricing.audit.credit}</p>
              </div>
            </div>
            <div className="mt-8">
              <AuditTiers dict={dict} locale={locale} />
            </div>
            <h3 className="mt-9 text-lg font-bold text-ink-950">{pricing.audit.includesTitle}</h3>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {pricing.audit.includes.map((item) => (
                <li key={item} className="flex gap-3 leading-relaxed text-ink-800">
                  <Check size={20} aria-hidden="true" className="mt-1 shrink-0 text-sea-600" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <BookCallButton dict={dict} label={pricing.audit.cta} />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {(
              [
                [3, pricing.implementation],
                [4, pricing.accompaniment],
              ] as const
            ).map(([n, block]) => (
              <div key={n} className="card sm:p-9">
                <div className="flex items-center justify-between gap-4">
                  <StepNumber n={n} />
                  <span className="tag">{block.price}</span>
                </div>
                <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-ink-950">{block.title}</h2>
                <p className="mt-2 text-lg leading-relaxed text-ink-600">{block.body}</p>
              </div>
            ))}
          </div>

          <ul className="space-y-2 px-1 pt-2 text-ink-600">
            {pricing.notes.map((note) => (
              <li key={note} className="flex gap-2.5 leading-relaxed">
                <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-400" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section border-t border-sand-200 bg-sand-100">
        <div className="container-page max-w-4xl">
          <h2 className="h2">{pricing.faq.title}</h2>
          <div className="mt-10">
            <Faq items={pricing.faq.items} />
          </div>
        </div>
      </section>

      <FinalCta dict={dict} />
    </>
  );
}
