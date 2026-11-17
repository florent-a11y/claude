import type { Metadata } from "next";
import { ArrowRight, Bot, Check, ClipboardCheck, FileSpreadsheet, Languages, Moon, Repeat } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { fill, getDictionary } from "@/content";
import { AUDIT_TIERS, formatIdr } from "@/lib/config";
import { pageMetadata } from "@/lib/seo";
import { Accent } from "@/components/Accent";
import { AuditTiers } from "@/components/AuditTiers";
import { Backdrop } from "@/components/Backdrop";
import { BookCallButton } from "@/components/Cta";
import { Faq } from "@/components/Faq";
import { FinalCta } from "@/components/FinalCta";
import { Founders } from "@/components/Founders";
import { FunctionGrid } from "@/components/FunctionGrid";
import { HeroChat } from "@/components/HeroChat";
import { delay, Reveal } from "@/components/Reveal";
import { SectorCards } from "@/components/SectorCards";

type Props = { params: Promise<{ locale: AppLocale }> };

const PAIN_ICONS = [Moon, Repeat, FileSpreadsheet, Languages];

/** "Welcome" in the languages our clients' customers write in. Shown as a moving strip under the hero. */
const WELCOMES: { lang: string; text: string }[] = [
  { lang: "id", text: "Selamat datang" },
  { lang: "en", text: "Welcome" },
  { lang: "zh", text: "欢迎光临" },
  { lang: "hi", text: "स्वागत है" },
  { lang: "fr", text: "Bienvenue" },
  { lang: "ko", text: "환영합니다" },
  { lang: "de", text: "Willkommen" },
  { lang: "ru", text: "Добро пожаловать" },
  { lang: "ja", text: "ようこそ" },
  { lang: "nl", text: "Welkom" },
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(locale);
  return pageMetadata(locale, "/", { title: dict.meta.title, description: dict.meta.description });
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = getDictionary(locale);
  const { hero, languages, pains, functions, process, why, sectors, pricing, faq } = dict.home;
  const stepTags = [
    dict.process.tags.free,
    fill(dict.process.tags.from, { price: formatIdr(AUDIT_TIERS[0].priceIdr, locale) }),
    dict.process.tags.quote,
    dict.process.tags.monthly,
  ];

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <Backdrop variant="hero" />
        <div className="container-page grid items-center gap-14 pb-24 pt-14 sm:pt-20 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14 lg:pb-36 lg:pt-24">
          <div>
            <p className="rise inline-flex items-center gap-2.5 rounded-full border border-gold-400/30 bg-gold-400/[0.08] px-4 py-1.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-gold-200">
              <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-gold-400" />
              {hero.eyebrow}
            </p>
            <h1
              className="rise mt-7 text-[2.6rem] font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[3.9rem]"
              style={delay(90)}
            >
              <Accent text={hero.title} />
            </h1>
            <p className="rise mt-7 max-w-xl text-lg leading-relaxed text-mist-300 sm:text-xl" style={delay(180)}>
              {hero.subtitle}
            </p>
            <div className="rise mt-10 flex flex-wrap gap-3" style={delay(270)}>
              <BookCallButton dict={dict} />
              <Link href="/quiz" className="btn btn-ghost">
                {hero.secondaryCta}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <ul className="rise mt-10 flex flex-wrap gap-x-7 gap-y-3 text-[15px] font-semibold text-mist-200" style={delay(360)}>
              {hero.points.map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold-400/15 text-gold-300">
                    <Check size={13} strokeWidth={3} aria-hidden="true" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="rise mx-auto w-full max-w-md lg:max-w-none" style={delay(300)}>
            <div className="float">
              <HeroChat labels={{ ...hero.chat, fictional: dict.common.fictional }} />
            </div>
            <p className="mt-6 text-center text-[15px] text-mist-400">{hero.chat.caption}</p>
          </div>
        </div>
      </section>

      <section aria-label={languages.caption} className="border-y border-white/[0.07] bg-night-900 py-8">
        <div className="marquee edge-fade overflow-hidden" aria-hidden="true">
          <div className="marquee-track flex w-max items-center">
            {[0, 1].map((copy) => (
              <div key={copy} className={`flex shrink-0 items-center ${copy === 1 ? "marquee-copy" : ""}`}>
                {WELCOMES.map((item) => (
                  <span key={item.lang} className="flex items-center whitespace-nowrap text-2xl font-semibold text-mist-300 sm:text-3xl">
                    <span lang={item.lang} className="px-6 sm:px-8">
                      {item.text}
                    </span>
                    <span className="text-base text-gold-400">✦</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="container-page mt-6 text-center text-[15px] text-mist-400">{languages.caption}</p>
      </section>

      <section className="section">
        <div className="container-page">
          <Reveal>
            <h2 className="h2">
              <Accent text={pains.title} />
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {pains.items.map((item, index) => {
              const Icon = PAIN_ICONS[index];
              return (
                <Reveal key={item.title} delay={index * 90} className="card glow-card">
                  <div className="flex items-start justify-between">
                    <span className="font-serif text-5xl italic leading-none text-gold">0{index + 1}</span>
                    <Icon size={22} aria-hidden="true" className="text-azure-300" />
                  </div>
                  <h3 className="mt-6 text-lg font-bold leading-snug text-white">{item.title}</h3>
                  <p className="mt-2 leading-relaxed text-mist-300">{item.body}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container-page">
          <Reveal>
            <h2 className="h2">
              <Accent text={functions.title} />
            </h2>
            <p className="lead">{functions.intro}</p>
          </Reveal>
          <div className="mt-12">
            <FunctionGrid dict={dict} examples={3} bento />
          </div>
          <Link href="/services" className="link-arrow mt-9">
            {functions.cta}
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="container-page">
          <Reveal>
            <h2 className="h2">
              <Accent text={process.title} />
            </h2>
            <p className="lead">{process.intro}</p>
          </Reveal>
          <Reveal className="relative mt-14">
            {/* The line that links the four steps draws itself when the row scrolls into view. */}
            <div aria-hidden="true" className="draw-line absolute left-0 right-0 top-[1.35rem] hidden h-px bg-gradient-to-r from-gold-400 via-azure-400 to-gold-400/20 lg:block" />
            <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-7">
              {dict.process.steps.map((step, index) => (
                <li key={step.title} className="relative flex flex-col">
                  <span className="step-number relative">{index + 1}</span>
                  <div className="card mt-5 flex flex-1 flex-col">
                    <h3 className="text-xl font-bold text-white">{step.title}</h3>
                    <p className="mt-2 flex-1 leading-relaxed text-mist-300">{step.short}</p>
                    <span className="tag mt-5 self-start">{stepTags[index]}</span>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
          <Link href="/how-we-work" className="link-arrow mt-9">
            {process.cta}
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container-page grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <Reveal className="self-start lg:sticky lg:top-28">
            <h2 className="h2">
              <Accent text={why.title} />
            </h2>
            <p className="lead">{why.intro}</p>
          </Reveal>
          <ol className="space-y-5">
            {why.points.map((point, index) => (
              <Reveal as="li" key={point.title} delay={index * 110} className="card glow-card flex gap-6 sm:p-8">
                <span className="font-serif text-5xl italic leading-none text-gold">{index + 1}</span>
                <div>
                  <h3 className="text-xl font-bold text-white">{point.title}</h3>
                  <p className="mt-2 text-lg leading-relaxed text-mist-300">{point.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container-page">
          <Reveal>
            <h2 className="h2">
              <Accent text={sectors.title} />
            </h2>
            <p className="lead">{sectors.intro}</p>
          </Reveal>
          <div className="mt-12">
            <SectorCards dict={dict} locale={locale} />
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container-page">
          <Reveal>
            <h2 className="h2">
              <Accent text={dict.home.try.title} />
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            <Reveal className="relative isolate flex flex-col overflow-hidden rounded-3xl border border-azure-400/30 bg-gradient-to-br from-azure-700/60 via-night-800 to-night-900 p-8 sm:p-10">
              <div aria-hidden="true" className="blob blob-azure -right-40 -top-40 -z-10 h-[28rem] w-[28rem] opacity-50" />
              <span className="icon-chip">
                <Bot size={26} aria-hidden="true" />
              </span>
              <h3 className="mt-6 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{dict.home.try.demoTitle}</h3>
              <p className="mt-3 flex-1 text-lg leading-relaxed text-mist-200">{dict.home.try.demoBody}</p>
              <Link href="/demo" className="btn btn-primary mt-8 self-start">
                {dict.home.try.demoCta}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </Reveal>
            <Reveal delay={110} className="relative isolate flex flex-col overflow-hidden rounded-3xl border border-gold-400/30 bg-gradient-to-br from-gold-600/25 via-night-800 to-night-900 p-8 sm:p-10">
              <div aria-hidden="true" className="blob blob-gold -right-40 -top-40 -z-10 h-[28rem] w-[28rem] opacity-35" />
              <span className="icon-chip-gold">
                <ClipboardCheck size={26} aria-hidden="true" />
              </span>
              <h3 className="mt-6 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{dict.home.try.quizTitle}</h3>
              <p className="mt-3 flex-1 text-lg leading-relaxed text-mist-200">{dict.home.try.quizBody}</p>
              <Link href="/quiz" className="btn btn-ghost mt-8 self-start">
                {dict.home.try.quizCta}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-page">
          <Reveal>
            <h2 className="h2">
              <Accent text={pricing.title} />
            </h2>
            <p className="lead">{pricing.intro}</p>
          </Reveal>
          <div className="mt-12">
            <AuditTiers dict={dict} locale={locale} />
          </div>
          <Link href="/pricing" className="link-arrow mt-9">
            {pricing.cta}
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <Founders dict={dict} />

      <section className="section section-alt">
        <div className="container-page max-w-4xl">
          <Reveal>
            <h2 className="h2">
              <Accent text={faq.title} />
            </h2>
          </Reveal>
          <Reveal className="mt-10">
            <Faq items={faq.items} />
          </Reveal>
        </div>
      </section>

      <div className="pt-20 sm:pt-28">
        <FinalCta dict={dict} />
      </div>
    </>
  );
}
