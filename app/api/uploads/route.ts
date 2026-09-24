import { NextResponse } from "next/server";
import { storeDocument, MAX_BYTES, UploadError } from "@/lib/uploads";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Best effort: an e-VOA order needs 2 files per traveler (max 10 travelers), plus retries. */
const limited = createRateLimiter({ limit: 60, windowMs: 3.6e6 });
/** Multipart framing overhead allowed on top of the file itself. */
const OVERHEAD = 64 * 1024;

export async function POST(req: Request) {
  if (limited(clientIp(req))) return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429 });

  // Refuse oversized bodies before the multipart parser reads them into memory.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES + OVERHEAD) return NextResponse.json({ error: "File larger than 8 MB" }, { status: 413 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  try {
    const { id } = await storeDocument(file);
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[uploads]", (e as Error).message);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 502 });
  }
}
