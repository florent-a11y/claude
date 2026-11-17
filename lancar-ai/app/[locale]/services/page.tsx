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

      <section className="section border-y border-sand-200 bg-white">
        <div className="container-page grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Plug size={30} aria-hidden="true" className="text-sea-600" />
            <h2 className="h2 mt-4">{services.tools.title}</h2>
            <p className="lead">{services.tools.body}</p>
            <ul className="mt-6 space-y-3">
              {services.tools.items.map((item) => (
                <li key={item} className="flex gap-3 text-lg text-ink-800">
                  <Check size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-sea-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-6">
            <div className="rounded-3xl bg-sea-50 p-7 sm:p-8">
              <h2 className="text-2xl font-extrabold tracking-tight text-ink-950">{services.models.title}</h2>
              <p className="mt-3 text-lg leading-relaxed text-ink-700">{services.models.body}</p>
            </div>
            <div className="rounded-3xl bg-sand-100 p-7 sm:p-8">
              <h2 className="text-2xl font-extrabold tracking-tight text-ink-950">{services.notFit.title}</h2>
              <ul className="mt-4 space-y-3">
                {services.notFit.items.map((item) => (
                  <li key={item} className="flex gap-3 text-lg leading-relaxed text-ink-700">
                    <CircleSlash size={20} aria-hidden="true" className="mt-1 shrink-0 text-marigold-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <FinalCta dict={dict} />
    </>
  );
}
