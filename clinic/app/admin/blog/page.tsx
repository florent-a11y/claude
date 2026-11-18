import { listPosts } from "@/lib/store";
import { isLive, wordCount } from "@/lib/blog";
import { localizedPath } from "@/i18n/routing";
import { baliTime } from "@/lib/admin-ui";
import { addSamplePostsAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminBlog() {
  const posts = await listPosts();
  const now = new Date();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-deep-900">Blog</h1>
          <p className="mt-2 text-sm text-ink-500">Each article is written in one language. Link translations together in the editor so search engines show the right version to each reader.</p>
        </div>
        <a href="/admin/blog/new" className="btn-primary btn-sm">Write a new article</a>
      </div>

      {posts.length === 0 && (
        <div className="mt-8 rounded-2xl border border-mist-200 bg-white p-8 text-center">
          <p className="text-ink-700">No articles yet. Start writing, or add three sample articles to see how the blog looks.</p>
          <form action={addSamplePostsAction} className="mt-5"><button type="submit" className="btn-secondary btn-sm">Add the sample articles</button></form>
          <p className="hint mt-3">The samples were written without a doctor. Review or delete them before the site goes live.</p>
        </div>
      )}

      {posts.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-mist-200 bg-white">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="bg-mist-100 text-xs uppercase tracking-wider text-ink-500">
              <tr>
                <th scope="col" className="px-4 py-3">Article</th>
                <th scope="col" className="px-4 py-3">Language</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Words</th>
                <th scope="col" className="px-4 py-3">Reviewed by</th>
                <th scope="col" className="px-4 py-3">Last edited</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Links</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist-200">
              {posts.map((p) => {
                const live = isLive(p, now);
                return (
                  <tr key={p.id} className="align-top hover:bg-mist-50">
                    <td className="px-4 py-3"><a className="font-semibold text-deep-700 underline underline-offset-2" href={`/admin/blog/${p.id}`}>{p.title}</a><br /><span className="text-ink-500">/blog/{p.slug}</span></td>
                    <td className="px-4 py-3 uppercase">{p.locale}</td>
                    <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${live ? "bg-tide-200 text-deep-900" : p.status === "published" ? "bg-lime-300 text-deep-900" : "bg-mist-200 text-ink-700"}`}>{live ? "Live" : p.status === "published" ? "Scheduled" : "Draft"}</span></td>
                    <td className="px-4 py-3 text-ink-700">{wordCount(p.body)}</td>
                    <td className="px-4 py-3 text-ink-700">{p.reviewer || <span className="text-coral-600">not yet</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-700">{baliTime(p.updatedAt)}</td>
                    <td className="px-4 py-3">{live && <a className="text-deep-700 underline underline-offset-2" href={localizedPath(p.locale, `/blog/${p.slug}`)} target="_blank" rel="noopener noreferrer">View</a>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
