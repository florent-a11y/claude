import { timingSafeEqual } from "node:crypto";
import { guard } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { runDue } from "@/lib/recurring-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/recurring/run[?date=YYYY-MM-DD] → creates every due occurrence of every active recurring transaction, in
 * every entity, up to today (or the given day). Called daily by the Vercel cron in vercel.json with
 * `Authorization: Bearer $CRON_SECRET`, and by an admin from the app. Returns the run summary (lib/recurring-services.ts
 * `RunSummary`); each template records its own failures, so the response is 200 even when a document could not be made.
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
  const r = await runDue(date ?? todayISO());
  return Response.json({ ok: true, ...r }, { headers: { "cache-control": "private, no-store" } });
}
