import { NextResponse } from "next/server";
import { seoSettings } from "@/lib/seo";

export const runtime = "nodejs";

/** The IndexNow key file. Search engines fetch /<key>.txt (rewritten here) to check that the key belongs to this site. */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const { indexNowKey } = await seoSettings();
  if (!indexNowKey || key !== indexNowKey) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(indexNowKey, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
