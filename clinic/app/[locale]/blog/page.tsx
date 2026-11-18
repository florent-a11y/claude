import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageSeo } from "@/lib/seo";
import { site } from "@/lib/config";
import { publishedPosts } from "@/lib/posts";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { Reveal } from "@/components/Reveal";

type Props = { params: Promise<{ locale: string }> };

/** Rebuilt at most every five minutes, and at once when an article is saved in the console. */
export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Blog" });
  const meta = await pageSeo(locale, "/blog");
  return { ...meta, alternates: { ...meta.alternates, types: { "application/atom+xml": [{ url: `/api/feed/${locale}`, title: t("feed", { brand: site.name }) }] } } };
}

export default async function Blog({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Blog");
  const posts = await publishedPosts(locale);
  const [first, ...rest] = posts;
  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />
      <section className="container-page py-14">
        {!first ? <p className="lead">{t("empty")}</p> : (
          <>
            <Reveal variant="scale"><PostCard post={first} large /></Reveal>
            {rest.length > 0 && (
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((p, i) => <Reveal key={p.id} index={i % 3}><PostCard post={p} /></Reveal>)}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
