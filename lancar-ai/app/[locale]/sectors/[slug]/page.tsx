import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Clock, Quote } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { Link, permanentRedirect } from "@/i18n/navigation";
import { LOCALES, type AppLocale } from "@/i18n/routing";
import { getDictionary } from "@/content";
import { SECTORS, SECTOR_IDS, sectorByAnySlug, sectorBySlug } from "@/lib/sectors";
import { pageMetadata, type Href } from "@/lib/seo";
import { BookCallButton } from "@/components/Cta";
import { FinalCta } from "@/components/FinalCta";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/Reveal";
import { SectorCards, SECTOR_ICONS } from "@/components/SectorCards";

type Props = { params: Promise<{ locale: AppLocale; slug: string }> };

/** Only the slugs below exist. Each language also answers the other language's slugs with a redirect. */
export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    SECTOR_IDS.flatMap((id) => Object.values(SECTORS[id].slug).map((slug) => ({ locale, slug }))),
  );
}

const sectorHref = (slug: string): Href => ({ pathname: "/sectors/[slug]", params: { slug } });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const id = sectorBySlug(slug, locale);
  if (!id) return {};
  const item = getDictionary(locale).sectors.items[id];
  return pageMetadata(
    locale,
    { id: sectorHref(SECTORS[id].slug.id), en: sectorHref(SECTORS[id].slug.en) },
    { title: item.title, description: item.intro },
  );
}

export default async function SectorPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const id = sectorBySlug(slug, locale);
  if (!id) {
    // The slug belongs to the other language (the visitor switched language on this page).
    const other = sectorByAnySlug(slug);
    if (!other) notFound();
    return permanentRedirect({ href: sectorHref(SECTORS[other].slug[locale]), locale });
  }
  const dict = getDictionary(locale);
  const item = dict.sectors.items[id];
  const Icon = SECTOR_ICONS[id];

  return (
    <>
      <PageHeader eyebrow={item.name} title={item.title} intro={item.intro}>
        <BookCallButton dict={dict} />
        <Link href={{ pathname: "/demo", query: { business: SECTORS[id].persona } }} className="btn btn-ghost">
          {dict.sectors.demoCta}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </PageHeader>

      <section className="section">
        <div className="container-page grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="self-start lg:sticky lg:top-28">
            <Reveal>
              <h2 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-white">
                <Clock size={26} aria-hidden="true" className="text-gold-400" />
                {dict.sectors.painsTitle}
              </h2>
            </Reveal>
            <ul className="mt-6 space-y-3">
              {item.pains.map((pain, index) => (
                <Reveal as="li" key={pain} delay={index * 80} className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-lg leading-snug text-mist-200">
                  {pain}
                </Reveal>
              ))}
            </ul>
          </div>
          <div>
            <Reveal>
              <h2 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-white">
                <Icon size={26} aria-hidden="true" className="text-azure-300" />
                {dict.sectors.solutionsTitle}
              </h2>
            </Reveal>
            <ul className="mt-6 space-y-4">
              {item.solutions.map((solution, index) => (
                <Reveal as="li" key={solution.title} delay={index * 80} className="card glow-card flex gap-5">
                  <span className="font-serif text-4xl italic leading-none text-gold">{index + 1}</span>
                  <div>
                    <h3 className="text-xl font-bold text-white">{solution.title}</h3>
                    <p className="mt-2 text-lg leading-relaxed text-mist-300">{solution.body}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section-alt py-16 sm:py-20">
        <div className="container-page">
          <Reveal as="figure" className="mx-auto max-w-3xl">
            <Quote size={36} aria-hidden="true" className="text-gold-400" />
            <figcaption className="eyebrow mt-5">{dict.sectors.scenarioLabel}</figcaption>
            <p className="mt-4 text-xl leading-relaxed text-white sm:text-2xl sm:leading-relaxed">{item.scenario}</p>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container-page">
          <Reveal>
            <h2 className="h2">{dict.sectors.otherTitle}</h2>
          </Reveal>
          <div className="mt-10">
            <SectorCards dict={dict} locale={locale} exclude={id} />
          </div>
        </div>
      </section>

      <FinalCta dict={dict} />
    </>
  );
}
