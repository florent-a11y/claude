import type { MetadataRoute } from "next";
import { site } from "@/lib/config";
import { localizedPath, routing } from "@/i18n/routing";
import { PUBLIC_PATHS } from "@/i18n/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${site.url}${localizedPath(locale, path)}`,
      changeFrequency: "weekly" as const,
      priority: path === "/" ? 1 : path.startsWith("/legal") ? 0.2 : 0.7,
      alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, `${site.url}${localizedPath(l, path)}`])) },
    })),
  );
}
