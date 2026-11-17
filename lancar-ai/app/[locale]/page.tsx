import type { Metadata } from "next";
import { ArrowRight, Check, ClipboardCheck, Languages, Moon, Repeat, FileSpreadsheet, Bot } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { fill, getDictionary } from "@/content";
import { AUDIT_TIERS, formatIdr } from "@/lib/config";
import { pageMetadata } from "@/lib/seo";
import { AuditTiers } from "@/components/AuditTiers";
import { BookCallButton } from "@/components/Cta";
import { Faq } from "@/components/Faq";
import { FinalCta } from "@/components/FinalCta";
import { FunctionGrid } from "@/components/FunctionGrid";
import { HeroChat } from "@/components/HeroChat";
import { SectorCards } from "@/components/SectorCards";

type Props = { params: Promise<{ locale: AppLocale }> };

const PAIN_ICONS = [Moon, Repeat, FileSpreadsheet, Languages];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(locale);
  return pageMetadata(locale, "/", { title: dict.meta.title, description: dict.meta.description });
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = getDictionary(locale);
  const { hero, pains, functions, process, why, sectors, pricing, faq } = dict.home;
  const stepTags = [
    dict.process.tags.free,
    fill(dict.process.tags.from, { price: formatIdr(AUDIT_TIERS[0].priceIdr, locale) }),
    dict.process.tags.quote,
    dict.process.tags.monthly,
  ];

  return (
    <>
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <svg aria-hidden="true" className="absolute inset-x-0 bottom-0 h-28 w-full text-sea-500/20" viewBox="0 0 1200 112" preserveAspectRatio="none">
          <path d="M0 56c200-56 400-56 600 0s400 56 600 0v56H0z" fill="currentColor" />
        </svg>
        <div className="container-page relative grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-marigold-300">{hero.eyebrow}</p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">{hero.title}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-sand-100/85 sm:text-xl">{hero.subtitle}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <BookCallButton dict={dict} />
              <Link href="/quiz" className="btn btn-outline-light">
                {hero.secondaryCta}
              </Link>
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2.5 text-[15px] font-semibold text-sand-100/90">
              {hero.points.map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <Check size={18} aria-hidden="true" className="text-marigold-400" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-full max-w-md lg:max-w-none">
            <HeroChat labels={{ ...hero.chat, fictional: dict.common.fictional }} />
            <p className="mt-4 text-center text-[15px] text-sand-100/70">{hero.chat.caption}</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-page">
          <h2 className="h2">{pains.title}</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {pains.items.map((item, index) => {
              const Icon = PAIN_ICONS[index];
              return (
                <div key={item.title} className="rounded-3xl bg-sand-100 p-6">
                  <Icon size={26} aria-hidden="true" className="text-marigold-600" />
                  <h3 className="mt-4 text-lg font-bold leading-snug text-ink-950">{item.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-600">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section border-y border-sand-200 bg-white">
        <div className="container-page">
          <h2 className="h2">{functions.title}</h2>
          <p className="lead">{functions.intro}</p>
          <div className="mt-10">
            <FunctionGrid dict={dict} examples={3} />
          </div>
          <Link href="/services" className="mt-8 inline-flex items-center gap-1.5 text-lg font-bold text-sea-700 hover:text-sea-600">
            {functions.cta}
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="container-page">
          <h2 className="h2">{process.title}</h2>
          <p className="lead">{process.intro}</p>
          <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {dict.process.steps.map((step, index) => (
              <li key={step.title} className="card flex flex-col">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-950 text-lg font-extrabold text-marigold-300">
                  {index + 1}
                </span>
                <h3 className="mt-5 text-xl font-bold text-ink-950">{step.title}</h3>
                <p className="mt-2 flex-1 leading-relaxed text-ink-600">{step.short}</p>
                <span className="tag mt-5 self-start">{stepTags[index]}</span>
              </li>
            ))}
          </ol>
          <Link href="/how-we-work" className="mt-8 inline-flex items-center gap-1.5 text-lg font-bold text-sea-700 hover:text-sea-600">
            {process.cta}
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="section border-y border-sand-200 bg-sand-100">
        <div className="container-page grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <h2 className="h2">{why.title}</h2>
            <p className="lead">{why.intro}</p>
          </div>
          <ul className="space-y-8">
            {why.points.map((point) => (
              <li key={point.title} className="border-l-4 border-marigold-400 pl-6">
                <h3 className="text-xl font-bold text-ink-950">{point.title}</h3>
                <p className="mt-2 text-lg leading-relaxed text-ink-600">{point.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="container-page">
          <h2 className="h2">{sectors.title}</h2>
          <p className="lead">{sectors.intro}</p>
          <div className="mt-10">
            <SectorCards dict={dict} locale={locale} />
          </div>
        </div>
      </section>

      <section className="section border-y border-sand-200 bg-white">
        <div className="container-page">
          <h2 className="h2">{dict.home.try.title}</h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="flex flex-col rounded-3xl bg-ink-950 p-8 text-white sm:p-10">
              <Bot size={32} aria-hidden="true" className="text-marigold-400" />
              <h3 className="mt-5 text-2xl font-extrabold tracking-tight">{dict.home.try.demoTitle}</h3>
              <p className="mt-3 flex-1 text-lg leading-relaxed text-sand-100/80">{dict.home.try.demoBody}</p>
              <Link href="/demo" className="btn btn-primary mt-7 self-start">
                {dict.home.try.demoCta}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <div className="flex flex-col rounded-3xl bg-sea-50 p-8 sm:p-10">
              <ClipboardCheck size={32} aria-hidden="true" className="text-sea-700" />
              <h3 className="mt-5 text-2xl font-extrabold tracking-tight text-ink-950">{dict.home.try.quizTitle}</h3>
              <p className="mt-3 flex-1 text-lg leading-relaxed text-ink-700">{dict.home.try.quizBody}</p>
              <Link href="/quiz" className="btn btn-dark mt-7 self-start">
                {dict.home.try.quizCta}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-page">
          <h2 className="h2">{pricing.title}</h2>
          <p className="lead">{pricing.intro}</p>
          <div className="mt-10">
            <AuditTiers dict={dict} locale={locale} />
          </div>
          <Link href="/pricing" className="mt-8 inline-flex items-center gap-1.5 text-lg font-bold text-sea-700 hover:text-sea-600">
            {pricing.cta}
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="section border-t border-sand-200 bg-sand-100">
        <div className="container-page max-w-4xl">
          <h2 className="h2">{faq.title}</h2>
          <div className="mt-10">
            <Faq items={faq.items} />
          </div>
        </div>
      </section>

      <FinalCta dict={dict} />
    </>
  );
}
