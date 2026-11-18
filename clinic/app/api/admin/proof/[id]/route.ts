import { NextResponse } from "next/server";
import { readProof } from "@/lib/uploads";
import { staff } from "@/lib/admin";

export const runtime = "nodejs";

/** Transfer proof for the console. The middleware authenticates the request; the role is checked again here. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try { await staff(); } catch { return NextResponse.json({ error: "Authentication required" }, { status: 401 }); }
  try {
    const file = await readProof(id);
    if (file.url) return NextResponse.redirect(file.url);
    return new NextResponse(new Uint8Array(file.bytes!), { headers: { "content-type": file.contentType, "content-disposition": "inline", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
