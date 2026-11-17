/**
 * Blog articles are Markdown files: content/blog/<article>/<language>.md, one folder per article and one file
 * per language. Each file starts with a small header:
 *
 *   ---
 *   title: The title
 *   description: One or two sentences for search results and the article list.
 *   date: 2026-11-17
 *   slug: the-url-of-the-article
 *   ---
 *
 * Files are read at build time only; publishing an article means committing it and redeploying.
 */
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { LOCALES, type AppLocale } from "@/i18n/routing";

export type Post = {
  /** Folder name: identifies the article across languages. */
  key: string;
  locale: AppLocale;
  slug: string;
  title: string;
  description: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  minutes: number;
  html: string;
};

const BLOG_DIR = path.join(process.cwd(), "content", "blog");
const WORDS_PER_MINUTE = 200;

function parsePost(key: string, locale: AppLocale, raw: string): Post {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) throw new Error(`content/blog/${key}/${locale}.md must start with a --- header`);
  const header: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator > 0) header[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  for (const field of ["title", "description", "date", "slug"]) {
    if (!header[field]) throw new Error(`content/blog/${key}/${locale}.md is missing "${field}" in its header`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(header.date)) throw new Error(`content/blog/${key}/${locale}.md: date must be YYYY-MM-DD`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(header.slug)) throw new Error(`content/blog/${key}/${locale}.md: slug must be lowercase-with-dashes`);
  const body = match[2];
  return {
    key,
    locale,
    slug: header.slug,
    title: header.title,
    description: header.description,
    date: header.date,
    minutes: Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / WORDS_PER_MINUTE)),
    html: marked.parse(body, { async: false }),
  };
}

let cache: Post[] | undefined;

/** Every article in every language, newest first. */
export function allPosts(): Post[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const posts: Post[] = [];
  if (fs.existsSync(BLOG_DIR)) {
    for (const entry of fs.readdirSync(BLOG_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const locale of LOCALES) {
        const file = path.join(BLOG_DIR, entry.name, `${locale}.md`);
        if (fs.existsSync(file)) posts.push(parsePost(entry.name, locale, fs.readFileSync(file, "utf8")));
      }
    }
  }
  posts.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  cache = posts;
  return posts;
}

export function postsFor(locale: AppLocale) {
  return allPosts().filter((post) => post.locale === locale);
}

export function postBySlug(locale: AppLocale, slug: string) {
  return allPosts().find((post) => post.locale === locale && post.slug === slug);
}

/** The same article in another language, if it has been translated. */
export function translationOf(post: Post, locale: AppLocale) {
  return allPosts().find((other) => other.key === post.key && other.locale === locale);
}

/** A slug from any language: lets the language switcher land on the translated article. */
export function postByAnySlug(slug: string) {
  return allPosts().find((post) => post.slug === slug);
}

export function formatPostDate(date: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
