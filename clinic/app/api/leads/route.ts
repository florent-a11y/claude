import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { leadSchema, type Lead } from "@/lib/schema";
import { saveLead } from "@/lib/store";
import { emailOps } from "@/lib/email";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
const limited = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });

export async function POST(req: Request) {
  if (limited(clientIp(req))) return NextResponse.json({ error: "rate" }, { status: 429 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "generic" }, { status: 400 }); }
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "generic" }, { status: 400 });
  // Honeypot filled: answer as if it worked, store nothing.
  if (parsed.data.website) return NextResponse.json({ ok: true });
  const { website: _website, ...data } = parsed.data;
  const lead: Lead = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  await saveLead(lead);
  await emailOps(`Message from ${lead.name}`, [`Topic: ${lead.topic}`, `Contact: ${lead.contact}`, `Language: ${lead.locale}`, "", lead.message]);
  return NextResponse.json({ ok: true });
}
