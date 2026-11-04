import { timingSafeEqual } from "node:crypto";
import { guard } from "@/lib/auth";
import { syncBiRates } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/fx/sync[?date=YYYY-MM-DD] → fetches Bank Indonesia's table (today's, or the given day) and caches every
 * currency. Called every working day by the Vercel cron in vercel.json with `Authorization: Bearer $CRON_SECRET`,
 * and by an admin from the app. The daily run is what makes past dates available offline: BI only shows its
 * latest table reliably, so the cache is built one day at a time.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const cronOk = Boolean(secret) && bearer.length === secret.length && timingSafeEqual(Buffer.from(bearer), Buffer.from(secret));
  if (!cronOk) {
    const user = await guard("admin");
    if (user instanceof Response) return user;
  }
  const q = new URL(req.url).searchParams;
  const date = q.get("date") ?? undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ ok: false, error: "date must be YYYY-MM-DD" }, { status: 400 });
  const r = await syncBiRates(date);
  if (!r) return Response.json({ ok: false, error: "Bank Indonesia could not be reached or its page has no rate table." }, { status: 502 });
  return Response.json({ ok: true, ...r, requested: date ?? null }, { headers: { "cache-control": "private, no-store" } });
}
