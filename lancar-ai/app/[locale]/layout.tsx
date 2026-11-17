import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/instrument-serif/400-italic.css";
import "../globals.css";
import { Effects, REVEAL_BOOTSTRAP } from "@/components/Effects";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getDictionary } from "@/content";
import { routing } from "@/i18n/routing";
import { site } from "@/lib/config";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = { themeColor: "#ffffff", colorScheme: "light" };

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(locale);
  return {
    metadataBase: new URL(site.url),
    title: { default: dict.meta.title, template: dict.meta.titleTemplate },
    description: dict.meta.description,
    applicationName: site.name,
  };
}

/** Structured data for search engines and AI assistants: who we are, where we work, which languages we speak. */
function organizationJsonLd(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${site.url}/#organization`,
    name: site.name,
    ...(site.legalName ? { legalName: site.legalName } : {}),
    url: site.url,
    logo: `${site.url}/icon.svg`,
    description,
    areaServed: [
      { "@type": "AdministrativeArea", name: "Bali, Indonesia" },
      { "@type": "AdministrativeArea", name: "Greater Jakarta, Indonesia" },
    ],
    knowsLanguage: ["id", "en"],
    ...(site.email ? { email: site.email } : {}),
    ...(site.whatsapp ? { telephone: `+${site.whatsapp}` } : {}),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const dict = getDictionary(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Sets html.js before the first paint (hence suppressHydrationWarning on <html>). See Effects.tsx. */}
        <script dangerouslySetInnerHTML={{ __html: REVEAL_BOOTSTRAP }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider locale={locale} messages={{}}>
          <Effects />
          <Header dict={dict} />
          <main className="flex-1">{children}</main>
          <Footer dict={dict} />
        </NextIntlClientProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd(dict.meta.description)).replace(/</g, "\\u003c") }}
        />
      </body>
    </html>
  );
}
