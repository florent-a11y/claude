import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Clock } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { Link, permanentRedirect } from "@/i18n/navigation";
import { LOCALES, type AppLocale } from "@/i18n/routing";
import { getDictionary } from "@/content";
import { SECTORS, SECTOR_IDS, sectorByAnySlug, sectorBySlug } from "@/lib/sectors";
import { pageMetadata, type Href } from "@/lib/seo";
import { BookCallButton } from "@/components/Cta";
import { FinalCta } from "@/components/FinalCta";
import { PageHeader } from "@/components/PageHeader";
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
        <Link href={{ pathname: "/demo", query: { business: SECTORS[id].persona } }} className="btn btn-outline">
          {dict.sectors.demoCta}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </PageHeader>

      <section className="section">
        <div className="container-page grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <h2 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-ink-950">
              <Clock size={26} aria-hidden="true" className="text-marigold-600" />
              {dict.sectors.painsTitle}
            </h2>
            <ul className="mt-6 space-y-4">
              {item.pains.map((pain) => (
                <li key={pain} className="rounded-2xl bg-sand-100 px-5 py-4 text-lg leading-snug text-ink-800">
                  {pain}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-ink-950">
              <Icon size={26} aria-hidden="true" className="text-sea-600" />
              {dict.sectors.solutionsTitle}
            </h2>
            <ul className="mt-6 space-y-4">
              {item.solutions.map((solution) => (
                <li key={solution.title} className="card">
                  <h3 className="text-xl font-bold text-ink-950">{solution.title}</h3>
                  <p className="mt-2 text-lg leading-relaxed text-ink-600">{solution.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-y border-sand-200 bg-white py-14 sm:py-16">
        <div className="container-page">
          <figure className="mx-auto max-w-3xl border-l-4 border-marigold-400 pl-6 sm:pl-8">
            <figcaption className="eyebrow">{dict.sectors.scenarioLabel}</figcaption>
            <p className="mt-3 text-xl leading-relaxed text-ink-800 sm:text-2xl sm:leading-relaxed">{item.scenario}</p>
          </figure>
        </div>
      </section>

      <section className="section">
        <div className="container-page">
          <h2 className="h2">{dict.sectors.otherTitle}</h2>
          <div className="mt-8">
            <SectorCards dict={dict} locale={locale} exclude={id} />
          </div>
        </div>
      </section>

      <FinalCta dict={dict} />
    </>
  );
}
