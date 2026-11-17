import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { fill, getDictionary } from "@/content";
import { formatPostDate, postsFor } from "@/lib/blog";
import { pageMetadata } from "@/lib/seo";
import { FinalCta } from "@/components/FinalCta";
import { PageHeader } from "@/components/PageHeader";
import { delay } from "@/components/Reveal";

type Props = { params: Promise<{ locale: AppLocale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { blog } = getDictionary(locale);
  return pageMetadata(locale, "/blog", { title: blog.metaTitle, description: blog.metaDescription });
}

export default async function BlogPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = getDictionary(locale);
  const posts = postsFor(locale);

  return (
    <>
      <PageHeader eyebrow={dict.nav.blog} title={dict.blog.intro} />
      <section className="section">
        <div className="container-page grid max-w-4xl gap-5">
          {posts.map((post, index) => (
            <Link
              key={post.key}
              href={{ pathname: "/blog/[slug]", params: { slug: post.slug } }}
              className="card glow-card reveal group sm:p-9"
              style={delay(index * 90)}
            >
              <p className="text-sm font-semibold text-gold-700">
                <time dateTime={post.date}>{formatPostDate(post.date, locale)}</time> · {fill(dict.blog.minutes, { n: post.minutes })}
              </p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">{post.title}</h2>
              <p className="mt-3 text-lg leading-relaxed text-ink-600">{post.description}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 font-bold text-azure-600 transition group-hover:text-azure-700">
                {dict.blog.readMore}
                <ArrowRight size={18} aria-hidden="true" className="transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <FinalCta dict={dict} title={dict.blog.ctaTitle} />
    </>
  );
}
