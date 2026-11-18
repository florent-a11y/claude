import type { MetadataRoute } from "next";
import { LOCALES, type AppLocale, type StaticPathname } from "@/i18n/routing";
import { allPosts, translationOf } from "@/lib/blog";
import { SECTORS, SECTOR_IDS } from "@/lib/sectors";
import { absoluteUrl, type Href } from "@/lib/seo";

const STATIC_PAGES: StaticPathname[] = ["/", "/services", "/how-we-work", "/sectors", "/pricing", "/case-study", "/about", "/contact", "/quiz", "/demo", "/blog", "/privacy"];

/** One entry per page and language, each listing its translations so search engines pair them up. */
function entries(hrefs: Record<AppLocale, Href>, lastModified?: string): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LOCALES.map((locale) => [locale, absoluteUrl(locale, hrefs[locale])]));
  return LOCALES.map((locale) => ({ url: languages[locale], lastModified, alternates: { languages } }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  const same = (href: Href) => Object.fromEntries(LOCALES.map((locale) => [locale, href])) as Record<AppLocale, Href>;
  const sectorHref = (slug: string): Href => ({ pathname: "/sectors/[slug]", params: { slug } });
  const postHref = (slug: string): Href => ({ pathname: "/blog/[slug]", params: { slug } });

  const posts = allPosts()
    .filter((post) => post.locale === LOCALES[0])
    .flatMap((post) =>
      entries(Object.fromEntries(LOCALES.map((l) => [l, postHref((translationOf(post, l) ?? post).slug)])) as Record<AppLocale, Href>, post.date),
    );

  return [
    ...STATIC_PAGES.flatMap((page) => entries(same(page))),
    ...SECTOR_IDS.flatMap((id) => entries({ id: sectorHref(SECTORS[id].slug.id), en: sectorHref(SECTORS[id].slug.en) })),
    ...posts,
  ];
}
