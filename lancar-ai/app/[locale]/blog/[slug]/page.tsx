import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { Link, permanentRedirect } from "@/i18n/navigation";
import { LOCALES, type AppLocale } from "@/i18n/routing";
import { fill, getDictionary } from "@/content";
import { allPosts, formatPostDate, postByAnySlug, postBySlug, translationOf } from "@/lib/blog";
import { site } from "@/lib/config";
import { absoluteUrl, pageMetadata, type Href } from "@/lib/seo";
import { FinalCta } from "@/components/FinalCta";

type Props = { params: Promise<{ locale: AppLocale; slug: string }> };

/** Only published slugs exist. Each language also answers the other language's slugs with a redirect. */
export const dynamicParams = false;

export function generateStaticParams() {
  const slugs = [...new Set(allPosts().map((post) => post.slug))];
  return LOCALES.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

const postHref = (slug: string): Href => ({ pathname: "/blog/[slug]", params: { slug } });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = postBySlug(locale, slug);
  if (!post) return {};
  const hrefs = Object.fromEntries(LOCALES.map((l) => [l, postHref((translationOf(post, l) ?? post).slug)])) as Record<AppLocale, Href>;
  const metadata = pageMetadata(locale, hrefs, { title: post.title, description: post.description });
  return { ...metadata, openGraph: { ...metadata.openGraph, type: "article", publishedTime: post.date } };
}

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = postBySlug(locale, slug);
  if (!post) {
    // The slug belongs to the article in another language (the visitor switched language on this page).
    const other = postByAnySlug(slug);
    const translated = other && translationOf(other, locale);
    if (!translated) notFound();
    return permanentRedirect({ href: postHref(translated.slug), locale });
  }
  const dict = getDictionary(locale);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    inLanguage: locale,
    mainEntityOfPage: absoluteUrl(locale, postHref(post.slug)),
    author: { "@type": "Organization", name: site.name, url: site.url },
    publisher: { "@id": `${site.url}/#organization` },
  };

  return (
    <>
      <article className="container-page max-w-3xl py-14 sm:py-20">
        <Link href="/blog" className="inline-flex items-center gap-1.5 font-bold text-sea-700 hover:text-sea-600">
          <ArrowLeft size={18} aria-hidden="true" />
          {dict.blog.back}
        </Link>
        <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-ink-950 sm:text-5xl">{post.title}</h1>
        <p className="mt-5 text-sm font-semibold text-ink-600">
          {dict.blog.published} <time dateTime={post.date}>{formatPostDate(post.date, locale)}</time> · {fill(dict.blog.minutes, { n: post.minutes })}
        </p>
        <p className="mt-6 text-xl leading-relaxed text-ink-700">{post.description}</p>
        <div className="prose-basic mt-8" dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <FinalCta dict={dict} title={dict.blog.ctaTitle} />
    </>
  );
}
