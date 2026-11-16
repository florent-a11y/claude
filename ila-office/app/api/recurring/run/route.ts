import { timingSafeEqual } from "node:crypto";
import { guard } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { runDue } from "@/lib/recurring-services";
import { runAutoDepreciation } from "@/lib/asset-auto";
import { withAuditActor } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/recurring/run[?date=YYYY-MM-DD] → creates every due occurrence of every active recurring transaction, in
 * every entity, up to today (or the given day). Called daily by the Vercel cron in vercel.json with
 * `Authorization: Bearer $CRON_SECRET`, and by an admin from the app. Returns the run summary (lib/recurring-services.ts
 * `RunSummary`); each template records its own failures, so the response is 200 even when a document could not be made.
 *
 * The same daily call then posts the fixed-asset depreciation of the month just ended for every entity that has it
 * switched on (lib/asset-auto.ts `runAutoDepreciation`): nothing is posted twice, so the 1st of the month does the
 * work and the other days find nothing due. Its summary comes back under `depreciation`
 * (`{ period, entities, posted: [{ entityId, journalNumber, amount }], skipped: [{ entityId, reason }] }`).
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
  const today = date ?? todayISO();
  // Called by the cron there is no signed-in user: the audit trail names the job instead of "System".
  const named = <T,>(name: string, fn: () => Promise<T>): Promise<T> => (cronOk ? withAuditActor({ name }, fn) : fn());
  const r = await named("Recurring job", () => runDue(today));
  // After the recurring documents, so a recurring purchase dated today is in the books first. Never throws.
  const depreciation = await named("Depreciation job", () => runAutoDepreciation(today));
  return Response.json({ ok: true, ...r, depreciation }, { headers: { "cache-control": "private, no-store" } });
}
