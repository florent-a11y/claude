import type { MetadataRoute } from "next";
import { site } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/cart", "/checkout", "/order/", "/ru/cart", "/ru/checkout", "/ru/order/", "/fr/cart", "/fr/checkout", "/fr/order/"] }],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
