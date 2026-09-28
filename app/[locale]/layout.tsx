import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DisclosureBar } from "@/components/Disclosure";
import { Analytics } from "@/components/Analytics";
import { ConsentBanner } from "@/components/ConsentBanner";
import { JsonLd } from "@/components/JsonLd";
import { site } from "@/lib/config";
import { routing } from "@/i18n/routing";
import { alternatesFor, socialFor } from "@/i18n/seo";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

/** Namespaces used by client components (forms, menus, calculators). Long-form server-rendered
 *  content (guide, legal, FAQ…) stays on the server and is not serialized into every page. */
const CLIENT_NAMESPACES = ["Common", "Header", "Products", "Apply", "Validation", "Options", "ReminderForm", "Evoa", "Customs", "NotFound", "Countries", "Consent"] as const;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const title = t("defaultTitle", { siteName: site.name });
  const description = t("description");
  return {
    metadataBase: new URL(site.url),
    title: { default: title, template: t("titleTemplate", { shortName: site.shortName }) },
    description,
    ...socialFor(locale, "/", { title, description }),
    alternates: alternatesFor(locale, "/"),
  };
}

/** Site-wide structured data: the company behind the service and the website itself, referenced by @id. */
function siteGraph(locale: string, description: string) {
  const orgId = `${site.url}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: site.name,
        legalName: site.company,
        url: site.url,
        logo: { "@type": "ImageObject", url: `${site.url}/icon.svg` },
        email: site.supportEmail,
        identifier: site.companyId,
        address: { "@type": "PostalAddress", ...site.postalAddress },
        contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: site.supportEmail, availableLanguage: [...routing.locales] },
      },
      {
        "@type": "WebSite",
        "@id": `${site.url}/#website`,
        name: site.name,
        url: site.url,
        description,
        inLanguage: locale,
        publisher: { "@id": orgId },
      },
    ],
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const all = (await getMessages()) as Record<string, unknown>;
  const messages = Object.fromEntries(CLIENT_NAMESPACES.filter((ns) => ns in all).map((ns) => [ns, all[ns]]));
  const tm = await getTranslations("Metadata");
  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col">
        <JsonLd data={siteGraph(locale, tm("description"))} />
        <NextIntlClientProvider messages={messages}>
          <DisclosureBar />
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <Analytics />
          <ConsentBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
