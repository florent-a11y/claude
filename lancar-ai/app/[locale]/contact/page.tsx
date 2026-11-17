import type { Metadata } from "next";
import { Mail, MessageCircle } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getDictionary } from "@/content";
import { site, whatsappLink } from "@/lib/config";
import { pageMetadata } from "@/lib/seo";
import { LeadForm } from "@/components/LeadForm";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/Reveal";

type Props = { params: Promise<{ locale: AppLocale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { contact } = getDictionary(locale);
  return pageMetadata(locale, "/contact", { title: contact.metaTitle, description: contact.metaDescription });
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = getDictionary(locale);
  const { contact } = dict;
  const wa = whatsappLink(dict.common.whatsappGreeting);
  const hasDirectChannel = Boolean(wa || site.email);

  return (
    <>
      <PageHeader eyebrow={dict.nav.contact} title={contact.title} intro={contact.intro} />
      <section className="section">
        <div className={`container-page grid gap-8 ${hasDirectChannel ? "lg:grid-cols-[0.8fr_1.2fr] lg:gap-12" : "max-w-3xl"}`}>
          {hasDirectChannel && (
            <div className="space-y-5">
              {wa && (
                <Reveal className="rounded-3xl border border-gold-400/30 bg-gradient-to-br from-gold-400/25 to-white p-7 sm:p-8">
                  <span className="icon-chip-gold">
                    <MessageCircle size={24} aria-hidden="true" />
                  </span>
                  <h2 className="mt-5 text-xl font-bold text-ink-900">{contact.whatsappTitle}</h2>
                  <p className="mt-2 leading-relaxed text-ink-700">{contact.whatsappBody}</p>
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-6">
                    {dict.common.whatsapp}
                  </a>
                </Reveal>
              )}
              {site.email && (
                <Reveal delay={110} className="card">
                  <span className="icon-chip">
                    <Mail size={24} aria-hidden="true" />
                  </span>
                  <h2 className="mt-5 text-xl font-bold text-ink-900">{contact.emailTitle}</h2>
                  <a href={`mailto:${site.email}`} className="mt-2 inline-block break-all text-lg font-semibold text-azure-600 underline underline-offset-2 hover:text-azure-700">
                    {site.email}
                  </a>
                </Reveal>
              )}
            </div>
          )}
          <Reveal delay={hasDirectChannel ? 110 : 0} className="card sm:p-9">
            <h2 className="mb-7 text-2xl font-extrabold tracking-tight text-ink-900">{contact.formTitle}</h2>
            <LeadForm labels={dict.form} locale={locale} />
          </Reveal>
        </div>
      </section>
    </>
  );
}
