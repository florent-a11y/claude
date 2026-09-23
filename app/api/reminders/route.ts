import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { reminderInputSchema, type Reminder } from "@/lib/schema";
import { findReminder, saveReminder } from "@/lib/store";
import { hoursUntilArrival } from "@/lib/window";

export const runtime = "nodejs";

/** Best-effort in-memory rate limit: max 20 sign-ups per IP per hour (resets when the instance restarts). */
const LIMIT = 20;
const WINDOW_MS = 3.6e6;
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string) {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || cur.resetAt < now) { hits.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false; }
  cur.count += 1;
  if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  return cur.count > LIMIT;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Honeypot: bots fill every field; people never see this one.
  if (body && typeof body === "object" && (body as Record<string, unknown>).website) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const parsed = reminderInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }
  const input = parsed.data;
  const now = new Date().toISOString();

  // Same person, same date: update the existing row instead of adding a second one.
  const existing = await findReminder(input.email, input.arrivalDate);
  const reminder: Reminder = {
    id: existing?.id ?? randomUUID(),
    email: input.email,
    arrivalDate: input.arrivalDate,
    travelers: input.travelers,
    nationality: input.nationality || existing?.nationality,
    productInterest: input.productInterest,
    locale: input.locale,
    source: input.source || existing?.source,
    createdAt: existing?.createdAt ?? now,
    notifiedAt: existing?.notifiedAt,
    notifiedEarlyAt: existing?.notifiedEarlyAt,
    unsubscribedAt: undefined, // signing up again re-subscribes
    convertedOrderId: existing?.convertedOrderId,
    token: existing?.token ?? randomBytes(16).toString("hex"),
    attribution: {
      ...existing?.attribution,
      ...input.attribution,
      ...(ip !== "unknown" ? { ip: ip.slice(0, 200) } : {}),
      ...(req.headers.get("user-agent") ? { userAgent: req.headers.get("user-agent")!.slice(0, 200) } : {}),
    },
  };
  await saveReminder(reminder);

  return NextResponse.json({ ok: true, id: reminder.id, hoursLeft: hoursUntilArrival(reminder.arrivalDate) });
}
