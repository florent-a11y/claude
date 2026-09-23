import type { MetadataRoute } from "next";
import { site } from "@/lib/config";
import { routing } from "@/i18n/routing";
import { localizedPath, PUBLIC_PATHS } from "@/i18n/seo";

/** Every public path in every locale, each entry carrying its hreflang alternates. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_PATHS.flatMap((p) => {
    const languages: Record<string, string> = {};
    for (const l of routing.locales) languages[l] = `${site.url}${localizedPath(l, p)}`;
    languages["x-default"] = `${site.url}${localizedPath(routing.defaultLocale, p)}`;
    return routing.locales.map((locale) => ({
      url: `${site.url}${localizedPath(locale, p)}`,
      lastModified: now,
      changeFrequency: p === "/news" ? ("weekly" as const) : ("monthly" as const),
      priority: (p === "/" ? 1 : p === "/apply" || p === "/reminder" ? 0.9 : 0.6) * (locale === routing.defaultLocale ? 1 : 0.9),
      alternates: { languages },
    }));
  });
}
