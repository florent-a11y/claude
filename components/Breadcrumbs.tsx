import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localizedPath, PUBLIC_PATHS } from "@/i18n/seo";
import { site } from "@/lib/config";
import { JsonLd } from "./JsonLd";

type PublicPath = Exclude<(typeof PUBLIC_PATHS)[number], "/">;

/** Where each page's breadcrumb label lives in the catalog (same strings as the header and footer navigation). */
const LABELS: Record<PublicPath, { ns: "Header" | "Footer"; key: string }> = {
  "/apply": { ns: "Header", key: "nav.arrivalCard" },
  "/reminder": { ns: "Header", key: "nav.reminder" },
  "/evoa": { ns: "Header", key: "nav.evoa" },
  "/pricing": { ns: "Header", key: "nav.pricing" },
  "/guide": { ns: "Header", key: "nav.guide" },
  "/customs": { ns: "Header", key: "nav.customs" },
  "/news": { ns: "Header", key: "nav.news" },
  "/faq": { ns: "Header", key: "nav.faq" },
  "/contact": { ns: "Header", key: "nav.contact" },
  "/legal/disclosure": { ns: "Footer", key: "disclosure" },
  "/legal/terms": { ns: "Footer", key: "terms" },
  "/legal/privacy": { ns: "Footer", key: "privacy" },
  "/legal/refunds": { ns: "Footer", key: "refunds" },
};

/**
 * Discreet "Home › Page" trail above the h1 plus the matching BreadcrumbList JSON-LD (absolute, localized URLs).
 * Server component; render it once per public page except the home page.
 */
export async function Breadcrumbs({ path, label: given, className = "mb-4" }: { path: PublicPath | `/info/${string}`; label?: string; className?: string }) {
  const locale = await getLocale();
  const tb = await getTranslations("Breadcrumbs");
  let label = given ?? "";
  if (!label) {
    const { ns, key } = LABELS[path as PublicPath];
    label = (await getTranslations(ns))(key);
  }
  const crumbs = [
    { href: "/", label: tb("home") },
    { href: path, label },
  ];
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: crumbs.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: c.label,
            item: `${site.url}${localizedPath(locale, c.href)}`,
          })),
        }}
      />
      <nav aria-label={tb("ariaLabel")} className={`text-sm text-ink-500 ${className}`.trim()}>
        {/* The !important utilities keep the trail flat inside .prose-basic containers (legal pages), whose ol/a rules would otherwise win. */}
        <ol className="flex flex-wrap items-center gap-1 !mb-0 !list-none !pl-0">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={c.href} className="flex items-center gap-1 !my-0">
                {i > 0 && <span aria-hidden className="text-ink-500/60">›</span>}
                {last ? (
                  <span aria-current="page">{c.label}</span>
                ) : (
                  <Link href={c.href} className="!text-ink-500 !no-underline hover:!text-brand-600 hover:!underline">{c.label}</Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
