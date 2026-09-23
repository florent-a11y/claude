import type { MetadataRoute } from "next";
import { site } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ["", "/apply", "/evoa", "/pricing", "/guide", "/customs", "/news", "/faq", "/contact", "/legal/disclosure", "/legal/terms", "/legal/privacy", "/legal/refunds"]
    .map((p) => ({ url: `${site.url}${p}`, lastModified: now, changeFrequency: p === "/news" ? "weekly" : "monthly", priority: p === "" ? 1 : p === "/apply" ? 0.9 : 0.6 }));
}
