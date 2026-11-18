import type { MetadataRoute } from "next";
import { demoMode, site } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  // A test site stays out of search engines entirely.
  if (demoMode()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/cart", "/checkout", "/order/", "/ru/cart", "/ru/checkout", "/ru/order/", "/fr/cart", "/fr/checkout", "/fr/order/"] }],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
