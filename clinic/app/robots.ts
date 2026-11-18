import type { MetadataRoute } from "next";
import { demoMode, site } from "@/lib/config";
import { seoSettings } from "@/lib/seo";
import { AI_CRAWLERS } from "@/lib/seo-settings";

const PRIVATE = ["/admin", "/api/orders", "/api/leads", "/api/admin", "/api/webhooks", "/cart", "/checkout", "/order/", "/ru/cart", "/ru/checkout", "/ru/order/", "/fr/cart", "/fr/checkout", "/fr/order/"];

/** Read on each request so a change in the console applies at once. */
export const dynamic = "force-dynamic";

/**
 * AI crawlers are named one by one so the choice is explicit: allowed ones may read the public pages (that is how
 * the site gets quoted and linked in AI answers) but not the private ones; refused ones are turned away entirely.
 * The choices are made in the console, under "SEO & AI".
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  // A test site stays out of search engines and AI indexes entirely.
  if (demoMode()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  const { blockedCrawlers } = await seoSettings();
  const allowed = AI_CRAWLERS.map((c) => c.agent).filter((a) => !blockedCrawlers.includes(a));
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      ...(allowed.length ? [{ userAgent: allowed, allow: ["/", "/llms.txt", "/api/blog/", "/api/feed/"], disallow: PRIVATE }] : []),
      ...(blockedCrawlers.length ? [{ userAgent: blockedCrawlers, disallow: "/" }] : []),
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
