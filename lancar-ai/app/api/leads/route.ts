import { NextResponse } from "next/server";
import { LeadInput, saveLead, toLead } from "@/lib/leads";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const MAX_BODY_BYTES = 20_000;

export async function POST(request: Request) {
  if (!rateLimit(`lead:${clientIp(request)}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "rate" }, { status: 429 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "invalid" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // Honeypot: a field people never see. A bot that fills it gets a normal-looking answer and nothing is saved.
  if (body && typeof body === "object" && typeof (body as { website?: unknown }).website === "string" && (body as { website: string }).website.trim()) {
    return NextResponse.json({ ok: true });
  }

  const parsed = LeadInput.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    return NextResponse.json({ error: "invalid", fields }, { status: 400 });
  }

  const outcome = await saveLead(toLead(parsed.data));
  if (!outcome.stored && !outcome.notified) {
    console.error("[leads] no storage or email channel accepted the lead; check SUPABASE_* and RESEND_* settings");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
