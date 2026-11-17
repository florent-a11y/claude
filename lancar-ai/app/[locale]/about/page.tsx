import type { Metadata } from "next";
import { Footprints, HeartHandshake, MapPin, MessagesSquare, ShieldCheck } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getDictionary } from "@/content";
import { pageMetadata } from "@/lib/seo";
import { FinalCta } from "@/components/FinalCta";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/Reveal";

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
        <div className="container-page max-w-3xl space-y-7">
          {about.story.map((paragraph, index) => (
            <Reveal as="p" key={paragraph} delay={index * 110} className={index === 0 ? "text-2xl leading-relaxed text-white" : "text-xl leading-relaxed text-mist-300"}>
              {paragraph}
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section section-alt">
        <div className="container-page">
          <Reveal>
            <h2 className="h2">{about.principlesTitle}</h2>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {about.principles.map((principle, index) => {
              const Icon = PRINCIPLE_ICONS[index];
              return (
                <Reveal key={principle.title} delay={(index % 2) * 110} className="card glow-card sm:p-8">
                  <span className={index % 2 === 0 ? "icon-chip-gold" : "icon-chip"}>
                    <Icon size={24} aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-white">{principle.title}</h3>
                  <p className="mt-2 text-lg leading-relaxed text-mist-300">{principle.body}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <Reveal className="container-page flex max-w-3xl items-start gap-5">
          <span className="icon-chip-gold shrink-0">
            <MapPin size={24} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-white">{about.whereTitle}</h2>
            <p className="mt-2 text-xl leading-relaxed text-mist-300">{about.where}</p>
          </div>
        </Reveal>
      </section>

      <FinalCta dict={dict} />
    </>
  );
}
