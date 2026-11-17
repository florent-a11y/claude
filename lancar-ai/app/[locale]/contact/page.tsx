import type { Metadata } from "next";
import { Mail, MessageCircle } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getDictionary } from "@/content";
import { site, whatsappLink } from "@/lib/config";
import { pageMetadata } from "@/lib/seo";
import { LeadForm } from "@/components/LeadForm";
import { PageHeader } from "@/components/PageHeader";

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
        <div className={`container-page grid gap-10 ${hasDirectChannel ? "lg:grid-cols-[0.8fr_1.2fr] lg:gap-16" : "max-w-3xl"}`}>
          {hasDirectChannel && (
            <div className="space-y-5">
              {wa && (
                <div className="rounded-3xl bg-ink-950 p-7 text-white">
                  <MessageCircle size={28} aria-hidden="true" className="text-marigold-400" />
                  <h2 className="mt-4 text-xl font-bold">{contact.whatsappTitle}</h2>
                  <p className="mt-2 leading-relaxed text-sand-100/80">{contact.whatsappBody}</p>
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-6">
                    {dict.common.whatsapp}
                  </a>
                </div>
              )}
              {site.email && (
                <div className="card">
                  <Mail size={28} aria-hidden="true" className="text-sea-600" />
                  <h2 className="mt-4 text-xl font-bold text-ink-950">{contact.emailTitle}</h2>
                  <a href={`mailto:${site.email}`} className="mt-2 inline-block break-all text-lg font-semibold text-sea-700 underline underline-offset-2">
                    {site.email}
                  </a>
                </div>
              )}
            </div>
          )}
          <div className="card sm:p-9">
            <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-ink-950">{contact.formTitle}</h2>
            <LeadForm labels={dict.form} locale={locale} />
          </div>
        </div>
      </section>
    </>
  );
}
