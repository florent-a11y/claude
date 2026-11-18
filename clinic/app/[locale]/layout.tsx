import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/manrope";
import "../globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CartProvider } from "@/components/cart";
import { site } from "@/lib/config";
import { routing } from "@/i18n/routing";
import { alternatesFor } from "@/i18n/seo";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

/** Namespaces used by client components (basket, checkout, order page, forms). Long server-rendered copy
 *  (home, FAQ, how it works…) stays on the server and is not serialized into every page. */
const CLIENT_NAMESPACES = ["Common", "Nav", "Kinds", "Goals", "Listing", "Catalog", "Cart", "Checkout", "Order", "Contact", "NotFound"] as const;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = { themeColor: "#fbf8f2" };

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    metadataBase: new URL(site.url),
    title: { default: t("defaultTitle", { brand: site.name }), template: t("titleTemplate", { brand: site.name }) },
    description: t("description"),
    alternates: alternatesFor(locale, "/"),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const all = (await getMessages()) as Record<string, unknown>;
  const messages = Object.fromEntries(CLIENT_NAMESPACES.filter((ns) => ns in all).map((ns) => [ns, all[ns]]));
  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider messages={messages}>
          <CartProvider>
            <Header />
            <main id="main" className="flex-1">{children}</main>
            <Footer />
          </CartProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
