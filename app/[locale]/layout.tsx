import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DisclosureBar } from "@/components/Disclosure";
import { site } from "@/lib/config";
import { routing } from "@/i18n/routing";
import { alternatesFor } from "@/i18n/seo";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

/** Namespaces used by client components (forms, menus, calculators). Long-form server-rendered
 *  content (guide, legal, FAQ…) stays on the server and is not serialized into every page. */
const CLIENT_NAMESPACES = ["Common", "Header", "Products", "Apply", "Validation", "Options", "ReminderForm", "Evoa", "Customs", "NotFound", "Countries"] as const;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    metadataBase: new URL(site.url),
    title: { default: t("defaultTitle", { siteName: site.name }), template: t("titleTemplate", { shortName: site.shortName }) },
    description: t("description"),
    openGraph: { type: "website", siteName: site.name, url: site.url, locale },
    robots: { index: true, follow: true },
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
          <DisclosureBar />
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
