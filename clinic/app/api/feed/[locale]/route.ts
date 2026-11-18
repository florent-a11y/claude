import { NextResponse } from "next/server";
import { site } from "@/lib/config";
import { publishedPosts } from "@/lib/posts";
import { localizedPath, routing } from "@/i18n/routing";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));

/** Atom feed of the articles in one language: /api/feed/en. Feed readers and some AI crawlers discover new articles here. */
export async function GET(_req: Request, ctx: { params: Promise<{ locale: string }> }) {
  const { locale } = await ctx.params;
  if (!(routing.locales as readonly string[]).includes(locale)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const posts = (await publishedPosts(locale)).slice(0, 30);
  const blogUrl = `${site.url}${localizedPath(locale, "/blog")}`;
  const updated = posts.reduce((max, p) => (p.updatedAt > max ? p.updatedAt : max), posts[0]?.updatedAt ?? new Date(0).toISOString());
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${locale}">
  <title>${esc(site.name)}</title>
  <id>${esc(blogUrl)}</id>
  <link rel="alternate" type="text/html" href="${esc(blogUrl)}"/>
  <link rel="self" type="application/atom+xml" href="${esc(`${site.url}/api/feed/${locale}`)}"/>
  <updated>${updated}</updated>
${posts.map((p) => {
    const url = `${site.url}${localizedPath(locale, `/blog/${p.slug}`)}`;
    return `  <entry>
    <title>${esc(p.title)}</title>
    <id>${esc(url)}</id>
    <link rel="alternate" type="text/html" href="${esc(url)}"/>
    <published>${p.publishedAt}</published>
    <updated>${p.updatedAt}</updated>
    <author><name>${esc(p.author || site.name)}</name></author>
    <summary>${esc(p.excerpt)}</summary>
${p.tags.map((t) => `    <category term="${esc(t)}"/>`).join("\n")}
  </entry>`;
  }).join("\n")}
</feed>
`;
  return new NextResponse(xml, { headers: { "content-type": "application/atom+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
