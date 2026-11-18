import { useLocale, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { readingMinutes, type Post } from "@/lib/blog";
import { PHOTOS, type PhotoKey } from "@/lib/photos";
import { Photo } from "./Photo";

const TAGS: Record<string, string> = { en: "en-GB", ru: "ru-RU", fr: "fr-FR" };
export function postDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(TAGS[locale] ?? "en-GB", { dateStyle: "long", timeZone: "Asia/Makassar" }).format(new Date(iso));
}
export const coverOf = (post: Pick<Post, "cover">): PhotoKey => (post.cover in PHOTOS ? (post.cover as PhotoKey) : "rice-field-palms");

/** Article card for the blog listing and the home page. `large` is the wide version used for the newest article. */
export function PostCard({ post, large = false }: { post: Post; large?: boolean }) {
  const t = useTranslations("Blog");
  const locale = useLocale();
  const href = `/blog/${post.slug}` as const;
  return (
    <article className={`group h-full overflow-hidden rounded-3xl border border-mist-200 bg-white transition duration-300 hover:-translate-y-1 hover:border-mist-300 hover:shadow-[0_28px_50px_-30px_rgba(6,32,31,0.4)] ${large ? "grid lg:grid-cols-2" : "flex flex-col"}`}>
      <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
        <Photo name={coverOf(post)} sizes={large ? "(min-width: 1024px) 600px, 100vw" : "(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"} className={large ? "aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[22rem]" : "aspect-[16/10]"} />
      </Link>
      <div className={`flex flex-1 flex-col ${large ? "justify-center p-7 sm:p-10" : "p-6"}`}>
        {post.tags.length > 0 && <p className="eyebrow">{post.tags.slice(0, 2).join(" · ")}</p>}
        <h2 className={`mt-2 font-display font-semibold leading-tight text-deep-900 ${large ? "text-3xl sm:text-4xl" : "text-xl"}`} style={large ? { letterSpacing: "-0.035em" } : undefined}>
          <Link href={href} className="underline-offset-4 hover:underline">{post.title}</Link>
        </h2>
        <p className={`mt-3 flex-1 leading-relaxed text-ink-700 ${large ? "text-base" : "text-sm"}`}>{post.excerpt}</p>
        <p className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-ink-500">
          <span>{post.publishedAt ? postDate(post.publishedAt, locale) : ""} · {t("minutes", { count: readingMinutes(post.body) })}</span>
          <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-deep-900">{t("read")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </p>
      </div>
    </article>
  );
}
