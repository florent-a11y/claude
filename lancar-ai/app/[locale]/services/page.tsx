import type { Metadata } from "next";
import { Check, CircleSlash, Plug } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getDictionary } from "@/content";
import { pageMetadata } from "@/lib/seo";
import { BookCallButton } from "@/components/Cta";
import { FinalCta } from "@/components/FinalCta";
import { FunctionGrid } from "@/components/FunctionGrid";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/Reveal";

type Props = { params: Promise<{ locale: AppLocale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { services } = getDictionary(locale);
  return pageMetadata(locale, "/services", { title: services.metaTitle, description: services.metaDescription });
}

export default async function ServicesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = getDictionary(locale);
  const { services } = dict;

  return (
    <>
      <PageHeader eyebrow={dict.nav.services} title={services.title} intro={services.intro}>
        <BookCallButton dict={dict} />
      </PageHeader>

      <section className="section">
        <div className="container-page">
          <FunctionGrid dict={dict} />
        </div>
      </section>

      <section className="section section-alt">
        <div className="container-page grid gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <span className="icon-chip">
              <Plug size={24} aria-hidden="true" />
            </span>
            <h2 className="h2 mt-6">{services.tools.title}</h2>
            <p className="lead">{services.tools.body}</p>
            <ul className="mt-7 space-y-3.5">
              {services.tools.items.map((item) => (
                <li key={item} className="flex gap-3 text-lg text-mist-200">
                  <Check size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-gold-400" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
          <div className="space-y-5">
            <Reveal className="rounded-3xl border border-azure-400/30 bg-gradient-to-br from-azure-700/40 to-night-800 p-7 sm:p-9">
              <h2 className="text-2xl font-extrabold tracking-tight text-white">{services.models.title}</h2>
              <p className="mt-3 text-lg leading-relaxed text-mist-200">{services.models.body}</p>
            </Reveal>
            <Reveal delay={110} className="rounded-3xl border border-gold-400/30 bg-gradient-to-br from-gold-600/20 to-night-800 p-7 sm:p-9">
              <h2 className="text-2xl font-extrabold tracking-tight text-white">{services.notFit.title}</h2>
              <ul className="mt-5 space-y-3.5">
                {services.notFit.items.map((item) => (
                  <li key={item} className="flex gap-3 text-lg leading-relaxed text-mist-200">
                    <CircleSlash size={20} aria-hidden="true" className="mt-1 shrink-0 text-gold-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      <div className="pt-20 sm:pt-28">
        <FinalCta dict={dict} />
      </div>
    </>
  );
}
