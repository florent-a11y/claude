import { NextResponse } from "next/server";
import { publishedPost } from "@/lib/posts";
import { routing } from "@/i18n/routing";
import { postMarkdown } from "@/lib/blog-markdown";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await ctx.params;
  if (!(routing.locales as readonly string[]).includes(locale)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const post = await publishedPost(locale, slug);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(postMarkdown(post), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300" } });
}
