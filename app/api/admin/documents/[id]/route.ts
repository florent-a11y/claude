import { NextResponse } from "next/server";
import { readDocument } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const doc = await readDocument(id);
    if (doc.url) return NextResponse.redirect(doc.url);
    return new NextResponse(new Uint8Array(doc.bytes!), { headers: { "content-type": doc.contentType, "cache-control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
