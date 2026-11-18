import "server-only";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { isLive, type Post } from "./blog";
import { listPosts } from "./store";
import { routing } from "@/i18n/routing";

/**
 * Published articles for the public pages. The list is kept in the server cache for five minutes and refreshed
 * the moment an article is saved in the console (refreshBlog), so readers get fast pages and writers see their
 * changes at once.
 */
const cachedPublished = unstable_cache(async () => (await listPosts()).filter((p) => p.status === "published" && p.publishedAt), ["clinic-published-posts"], { tags: ["posts"], revalidate: 300 });

/** Live articles in one language, newest first. */
export async function publishedPosts(locale: string): Promise<Post[]> {
  const now = new Date();
  return (await cachedPublished())
    .filter((p) => p.locale === locale && isLive(p, now))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

export async function publishedPost(locale: string, slug: string): Promise<Post | null> {
  return (await publishedPosts(locale)).find((p) => p.slug === slug) ?? null;
}

/**
 * Finds an article by its address when it is not in the reader's language. Someone whose browser is in French who
 * opens a link to an English-only article is sent to /fr/blog/<english-address>: rather than "page not found",
 * they get the translation if one exists, or the original article.
 */
export async function findPostElsewhere(locale: string, slug: string): Promise<{ post: Post; translation: Post | null } | null> {
  const now = new Date();
  const live = (await cachedPublished()).filter((p) => isLive(p, now));
  const candidates = live.filter((p) => p.slug === slug && p.locale !== locale);
  const post = candidates.find((p) => p.locale === routing.defaultLocale) ?? candidates[0];
  if (!post) return null;
  const translation = live.find((p) => p.locale === locale && p.translationKey && p.translationKey === post.translationKey) ?? null;
  return { post, translation };
}

/** The same article in the other languages (live versions only), for the language links search engines read. */
export async function translationsOf(post: Post): Promise<Post[]> {
  if (!post.translationKey) return [];
  const now = new Date();
  return (await cachedPublished()).filter((p) => p.id !== post.id && p.translationKey === post.translationKey && p.locale !== post.locale && isLive(p, now));
}

/** Every live article in every language (sitemap, llms.txt). */
export async function allPublishedPosts(): Promise<Post[]> {
  const now = new Date();
  return (await cachedPublished()).filter((p) => isLive(p, now)).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

/** Call after saving or deleting an article: drops the cached list and the rendered blog pages. */
export function refreshBlog() {
  revalidateTag("posts");
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/blog`, "page");
    revalidatePath(`/${locale}/blog/[slug]`, "page");
    revalidatePath(`/${locale}`, "page");
  }
  revalidatePath("/sitemap.xml");
  revalidatePath("/llms.txt");
}
