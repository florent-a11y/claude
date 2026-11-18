import { NextResponse } from "next/server";
import { getOrder } from "@/lib/store";
import { attachProof, tokenMatches } from "@/lib/orders";
import { bankDetails } from "@/lib/pay/methods";
import { UploadError, storeProof } from "@/lib/uploads";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
const limited = createRateLimiter({ limit: 6, windowMs: 10 * 60_000 });

/** Customer uploads the proof of a manual bank transfer. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (limited(clientIp(req))) return NextResponse.json({ error: "generic" }, { status: 429 });
  const { id } = await ctx.params;
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "generic" }, { status: 400 }); }
  const order = await getOrder(id);
  if (!order || !tokenMatches(order, String(form.get("token") ?? ""))) return NextResponse.json({ error: "generic" }, { status: 404 });
  if (!bankDetails() || (order.status !== "awaiting_payment" && order.status !== "payment_review")) return NextResponse.json({ error: "generic" }, { status: 409 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "bad_file" }, { status: 422 });
  try {
    const proofId = await storeProof(file);
    await attachProof(order, proofId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[orders] proof", order.id, e);
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}
