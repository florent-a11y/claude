import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, BadgeCheck, ListChecks } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LOCALE_LABELS, OG_LOCALES, localizedPath, type AppLocale } from "@/i18n/routing";
import { getProduct } from "@/lib/catalog";
import { site } from "@/lib/config";
import { readingMinutes, tableOfContents, wordCount } from "@/lib/blog";
import { PHOTOS } from "@/lib/photos";
import { findPostElsewhere, publishedPost, translationsOf } from "@/lib/posts";
import type { Post } from "@/lib/blog";
import { Markdown } from "@/components/Markdown";
import { Photo } from "@/components/Photo";
import { FaqList } from "@/components/Faq";
import { JsonLd } from "@/components/JsonLd";
import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";
import { coverOf, postDate } from "@/components/PostCard";

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Articles are written after the site is built: each is rendered on first visit, then kept for five minutes. */
export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

/**
 * The article for this address. `original` is true when it is shown in a language other than the page's: the
 * reader's language has no version, so they get the original instead of an error.
 */
async function resolve(locale: string, slug: string): Promise<{ post: Post; original: boolean } | { redirectTo: string } | null> {
  const post = await publishedPost(locale, slug);
  if (post) return { post, original: false };
  const found = await findPostElsewhere(locale, slug);
  if (!found) return null;
  if (found.translation) return { redirectTo: `/blog/${found.translation.slug}` };
  return { post: found.post, original: true };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const found = await resolve(locale, slug);
  if (!found || "redirectTo" in found) return {};
  const { post, original } = found;
  const others = await translationsOf(post);
  // An article shown in its original language under another language's address points search engines at its real home.
  const self = localizedPath(post.locale, `/blog/${post.slug}`);
  const languages: Record<string, string> = { [post.locale]: self };
  for (const o of others) languages[o.locale] = localizedPath(o.locale, `/blog/${o.slug}`);
  languages["x-default"] = languages.en ?? self;
  const image = `${site.url}${PHOTOS[coverOf(post)].src}`;
  return {
    title: post.title,
    description: post.excerpt,
    authors: post.author ? [{ name: post.author }] : undefined,
    keywords: post.tags,
    alternates: { canonical: self, languages },
    ...(original ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: "article", siteName: site.name, title: post.title, description: post.excerpt, url: `${site.url}${self}`,
      locale: OG_LOCALES[post.locale as AppLocale] ?? OG_LOCALES.en, publishedTime: post.publishedAt, modifiedTime: post.updatedAt, tags: post.tags, images: [{ url: image }],
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.excerpt, images: [image] },
  };
}

export default async function Article({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const found = await resolve(locale, slug);
  if (!found) notFound();
  if ("redirectTo" in found) return redirect({ href: found.redirectTo, locale });
  const { post, original } = found;
  const t = await getTranslations("Blog");
  const others = await translationsOf(post);
  const toc = tableOfContents(post.body);
  const related = post.related.map(getProduct).filter((p) => p !== undefined);
  const url = `${site.url}${localizedPath(post.locale, `/blog/${post.slug}`)}`;
  const org = { "@type": "Organization", "@id": `${site.url}/#organization`, name: site.name, url: site.url };

  /* What search engines and AI assistants read: the article, who wrote and checked it, its questions, its place on the site. */
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting", "@id": `${url}#article`, headline: post.title, description: post.excerpt, inLanguage: post.locale, url,
        datePublished: post.publishedAt, dateModified: post.updatedAt, wordCount: wordCount(post.body), keywords: post.tags.join(", ") || undefined,
        image: `${site.url}${PHOTOS[coverOf(post)].src}`,
        author: post.author ? { "@type": "Person", name: post.author } : org,
        publisher: org, mainEntityOfPage: { "@id": url },
        citation: post.sources.map((s) => ({ "@type": "CreativeWork", name: s.title, url: s.url })),
      },
      {
        "@type": "WebPage", "@id": url, url, name: post.title, inLanguage: post.locale, isPartOf: { "@id": `${site.url}/#website` },
        ...(post.reviewer ? { reviewedBy: { "@type": "Person", name: post.reviewer }, lastReviewed: post.updatedAt.slice(0, 10) } : {}),
      },
      {
        "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: site.name, item: `${site.url}${localizedPath(locale, "/")}` },
          { "@type": "ListItem", position: 2, name: t("eyebrow"), item: `${site.url}${localizedPath(locale, "/blog")}` },
          { "@type": "ListItem", position: 3, name: post.title, item: url },
        ],
      },
      ...(post.faq.length ? [{ "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: post.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] : []),
    ],
  };

  return (
    <article className="container-page py-10 lg:py-14" lang={original ? post.locale : undefined}>
      <JsonLd data={graph} />
      <div className="mx-auto max-w-3xl">
        <Link href="/blog" className="load-rise inline-flex items-center gap-1.5 text-sm font-semibold text-deep-900"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("back")}</Link>
        {post.tags.length > 0 && <p className="eyebrow load-rise mt-6">{post.tags.join(" · ")}</p>}
        <h1 className="h-display load-rise mt-3 text-4xl sm:text-5xl" style={{ "--i": 1 } as React.CSSProperties}>{post.title}</h1>
        <p className="lead load-rise mt-5" style={{ "--i": 2 } as React.CSSProperties}>{post.excerpt}</p>
        <div className="load-rise mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-500" style={{ "--i": 3 } as React.CSSProperties}>
          {post.author && <span>{t("by", { author: post.author })}</span>}
          {post.publishedAt && <time dateTime={post.publishedAt}>{t("published", { date: postDate(post.publishedAt, locale) })}</time>}
          {post.updatedAt.slice(0, 10) > (post.publishedAt ?? "").slice(0, 10) && <time dateTime={post.updatedAt}>{t("updated", { date: postDate(post.updatedAt, locale) })}</time>}
          <span>{t("minutes", { count: readingMinutes(post.body) })}</span>
        </div>
        {post.reviewer && (
          <p className="load-rise mt-4 inline-flex items-center gap-2 rounded-full bg-tide-50 px-4 py-2 text-sm font-semibold text-deep-700" style={{ "--i": 4 } as React.CSSProperties}>
            <BadgeCheck className="h-4 w-4 text-tide-600" aria-hidden="true" />{t("reviewedBy", { name: post.reviewer })}
          </p>
        )}
      </div>

      <Photo name={coverOf(post)} sizes="(min-width: 1024px) 1000px, 100vw" className="load-scale kenburns mx-auto mt-10 aspect-[16/8] max-w-5xl rounded-[2rem]" priority />

      <div className="mx-auto mt-10 max-w-3xl">
        {post.takeaways.length > 0 && (
          <section aria-labelledby="takeaways" className="rounded-3xl bg-deep-950 p-7 text-white sm:p-9">
            <h2 id="takeaways" className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-lime-400"><ListChecks className="h-4 w-4" aria-hidden="true" />{t("takeaways")}</h2>
            <ul className="mt-4 space-y-3">
              {post.takeaways.map((k) => <li key={k} className="flex gap-3 leading-relaxed text-white/90"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" aria-hidden="true" />{k}</li>)}
            </ul>
          </section>
        )}

        {toc.length >= 3 && (
          <nav aria-labelledby="contents" className="mt-8 rounded-3xl border border-mist-200 p-6">
            <h2 id="contents" className="text-xs font-semibold uppercase tracking-[0.16em] text-tide-600">{t("contents")}</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {toc.map((h, i) => <li key={h.id}><a href={`#${h.id}`} className="nav-link font-medium text-deep-900"><span className="mr-2 text-ink-500">{String(i + 1).padStart(2, "0")}</span>{h.text}</a></li>)}
            </ol>
          </nav>
        )}

        <div className="mt-10"><Markdown>{post.body}</Markdown></div>

        {post.faq.length > 0 && (
          <section aria-labelledby="faq" className="mt-14">
            <h2 id="faq" className="h-display text-3xl">{t("faq")}</h2>
            <div className="mt-5"><FaqList items={post.faq} /></div>
          </section>
        )}

        {post.sources.length > 0 && (
          <section aria-labelledby="sources" className="mt-14">
            <h2 id="sources" className="h-display text-3xl">{t("sources")}</h2>
            <ol className="mt-5 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-ink-700 marker:text-tide-500">
              {post.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-deep-900 underline decoration-tide-300 underline-offset-4 hover:decoration-tide-600">{s.title}</a></li>)}
            </ol>
          </section>
        )}

        <p className="mt-12 rounded-2xl bg-mist-50 px-5 py-4 text-sm leading-relaxed text-ink-700">{t("disclaimer")}</p>

        {others.length > 0 && (
          <p className="mt-6 text-sm text-ink-500">{t("otherLanguages")}{" "}
            {others.map((o, i) => <span key={o.id}>{i > 0 ? ", " : ""}<Link href={`/blog/${o.slug}`} locale={o.locale} hrefLang={o.locale} className="font-semibold text-deep-900 underline underline-offset-4">{LOCALE_LABELS[o.locale]}</Link></span>)}
          </p>
        )}
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="h-display text-3xl sm:text-4xl">{t("related")}</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{related.map((p, i) => <Reveal key={p.slug} index={i}><ProductCard product={p} /></Reveal>)}</div>
        </section>
      )}
    </article>
  );
}
