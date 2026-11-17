import type { Metadata } from "next";
import { HeartHandshake, MapPin, MessagesSquare, ShieldCheck, Footprints } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getDictionary } from "@/content";
import { pageMetadata } from "@/lib/seo";
import { FinalCta } from "@/components/FinalCta";
import { PageHeader } from "@/components/PageHeader";

type Props = { params: Promise<{ locale: AppLocale }> };

const PRINCIPLE_ICONS = [Footprints, MessagesSquare, HeartHandshake, ShieldCheck];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { about } = getDictionary(locale);
  return pageMetadata(locale, "/about", { title: about.metaTitle, description: about.metaDescription });
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = getDictionary(locale);
  const { about } = dict;

  return (
    <>
      <PageHeader eyebrow={dict.nav.about} title={about.title} intro={about.lead} />

      <section className="section">
        <div className="container-page max-w-3xl space-y-6">
          {about.story.map((paragraph) => (
            <p key={paragraph} className="text-xl leading-relaxed text-ink-700">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <section className="section border-y border-sand-200 bg-white">
        <div className="container-page">
          <h2 className="h2">{about.principlesTitle}</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {about.principles.map((principle, index) => {
              const Icon = PRINCIPLE_ICONS[index];
              return (
                <div key={principle.title} className="rounded-3xl bg-sand-100 p-7">
                  <Icon size={28} aria-hidden="true" className="text-sea-600" />
                  <h3 className="mt-4 text-xl font-bold text-ink-950">{principle.title}</h3>
                  <p className="mt-2 text-lg leading-relaxed text-ink-600">{principle.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="container-page flex max-w-3xl items-start gap-4">
          <MapPin size={30} aria-hidden="true" className="mt-1 shrink-0 text-marigold-600" />
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-ink-950">{about.whereTitle}</h2>
            <p className="mt-2 text-xl leading-relaxed text-ink-600">{about.where}</p>
          </div>
        </div>
      </section>

      <FinalCta dict={dict} />
    </>
  );
}
