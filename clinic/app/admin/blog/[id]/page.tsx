import { notFound } from "next/navigation";
import en from "@/messages/en.json";
import { getPost, listPosts } from "@/lib/store";
import { PRODUCTS } from "@/lib/catalog";
import { PHOTOS } from "@/lib/photos";
import { site } from "@/lib/config";
import { localizedPath } from "@/i18n/routing";
import { isLive } from "@/lib/blog";
import { PostEditor } from "@/components/PostEditor";
import { deletePostAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function AdminPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = id === "new" ? null : await getPost(id);
  if (id !== "new" && !post) notFound();
  const names = en.Catalog.items as Record<string, { name: string }>;
  const others = (await listPosts()).filter((p) => p.id !== post?.id).map((p) => ({ id: p.id, title: p.title, locale: p.locale, translationKey: p.translationKey }));
  return (
    <>
      <a href="/admin/blog" className="text-sm font-semibold text-deep-700 underline underline-offset-2">← All articles</a>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-semibold text-deep-900">{post ? "Edit article" : "New article"}</h1>
        {post && isLive(post) && <a className="btn-secondary btn-sm" href={localizedPath(post.locale, `/blog/${post.slug}`)} target="_blank" rel="noopener noreferrer">View on the site</a>}
      </div>
      <div className="mt-6">
        <PostEditor
          post={post}
          others={others}
          products={PRODUCTS.map((p) => ({ slug: p.slug, name: names[p.slug]?.name ?? p.slug }))}
          photos={Object.keys(PHOTOS)}
          defaultAuthor={`${site.name} team`}
        />
      </div>
      {post && (
        <form action={deletePostAction} className="mt-10 border-t border-mist-200 pt-6">
          <input type="hidden" name="id" value={post.id} />
          <button type="submit" className="text-sm font-semibold text-red-700 underline underline-offset-2">Delete this article</button>
          <span className="ml-3 text-xs text-ink-500">This cannot be undone.</span>
        </form>
      )}
    </>
  );
}
