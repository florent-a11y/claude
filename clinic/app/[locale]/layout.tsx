import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import "@fontsource-variable/onest";
import "../globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CartProvider } from "@/components/cart";
import { JsonLd } from "@/components/JsonLd";
import { AREAS, demoMode, site } from "@/lib/config";
import { routing } from "@/i18n/routing";
import { alternatesFor } from "@/i18n/seo";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

/** Namespaces used by client components (basket, checkout, order page, forms). Long server-rendered copy
 *  (home, FAQ, how it works…) stays on the server and is not serialized into every page. */
const CLIENT_NAMESPACES = ["Common", "Nav", "Kinds", "Goals", "Listing", "Catalog", "Cart", "Checkout", "Order", "Contact", "NotFound"] as const;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = { themeColor: "#ffffff" };

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    metadataBase: new URL(site.url),
    title: { default: t("defaultTitle", { brand: site.name }), template: t("titleTemplate", { brand: site.name }) },
    description: t("description"),
    alternates: alternatesFor(locale, "/"),
    ...(demoMode() ? { robots: { index: false, follow: false } } : {}),
  };
}

/** The business and the website, described once for search engines and AI assistants; pages refer to them by @id. */
function siteGraph(locale: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Organization", "HealthAndBeautyBusiness"], "@id": `${site.url}/#organization`, name: site.name, url: site.url, description,
        ...(site.company ? { legalName: site.company } : {}),
        logo: `${site.url}/icon.svg`, email: site.email,
        ...(site.whatsapp ? { telephone: `+${site.whatsapp}` } : {}),
        ...(site.address ? { address: { "@type": "PostalAddress", streetAddress: site.address, addressRegion: "Bali", addressCountry: "ID" } } : { address: { "@type": "PostalAddress", addressRegion: "Bali", addressCountry: "ID" } }),
        areaServed: AREAS.map((name) => ({ "@type": "Place", name: `${name}, Bali` })),
        openingHoursSpecification: { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], opens: site.opens, closes: site.closes },
        currenciesAccepted: "IDR", knowsLanguage: ["en", "ru", "fr"],
        ...(site.instagram ? { sameAs: [`https://instagram.com/${site.instagram.replace(/^@/, "")}`] } : {}),
      },
      { "@type": "WebSite", "@id": `${site.url}/#website`, name: site.name, url: site.url, description, inLanguage: locale, publisher: { "@id": `${site.url}/#organization` } },
    ],
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const all = (await getMessages()) as Record<string, unknown>;
  const messages = Object.fromEntries(CLIENT_NAMESPACES.filter((ns) => ns in all).map((ns) => [ns, all[ns]]));
  const c = await getTranslations("Common");
  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col">
        <JsonLd data={siteGraph(locale, (all.Metadata as { description: string }).description)} />
        <NextIntlClientProvider messages={messages}>
          <CartProvider>
            {demoMode() && <p role="note" className="bg-lime-400 px-4 py-2 text-center text-xs font-semibold text-deep-950">{c("demoBanner")}</p>}
            <Header />
            <main id="main" className="flex-1">{children}</main>
            <Footer />
          </CartProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
