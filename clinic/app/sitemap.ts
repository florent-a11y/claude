import type { MetadataRoute } from "next";
import { site } from "@/lib/config";
import { allPublishedPosts } from "@/lib/posts";
import { localizedPath, routing } from "@/i18n/routing";
import { PUBLIC_PATHS } from "@/i18n/seo";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [...PUBLIC_PATHS, "/blog"].flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${site.url}${localizedPath(locale, path)}`,
      changeFrequency: "weekly" as const,
      priority: path === "/" ? 1 : path.startsWith("/legal") ? 0.2 : 0.7,
      alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, `${site.url}${localizedPath(l, path)}`])) },
    })),
  );
  // Articles: each language version lists its translations, so search engines show the right one to each reader.
  const posts = await allPublishedPosts();
  const articles: MetadataRoute.Sitemap = posts.map((p) => {
    const versions = posts.filter((o) => o.id === p.id || (p.translationKey && o.translationKey === p.translationKey));
    return {
      url: `${site.url}${localizedPath(p.locale, `/blog/${p.slug}`)}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      alternates: { languages: Object.fromEntries(versions.map((v) => [v.locale, `${site.url}${localizedPath(v.locale, `/blog/${v.slug}`)}`])) },
    };
  });
  return [...pages, ...articles];
}
