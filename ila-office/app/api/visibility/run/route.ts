import { timingSafeEqual } from "node:crypto";
import { guard } from "@/lib/auth";
import { continueRun, retryErrors, startRun, tick } from "@/lib/visibility/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** One invocation asks questions for about two minutes, then lets the calls in flight finish (lib/visibility/run.ts). */
export const maxDuration = 300;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
const fail = (e: unknown, status = 400) => json({ ok: false, error: e instanceof Error ? e.message : String(e) }, status);

/**
 * GET /api/visibility/run[?start=1] → continues the run in progress; with `start=1` begins a new one when none is open.
 * Called by the Vercel cron (vercel.json) with `Authorization: Bearer $CRON_SECRET`: one entry starts the weekly run,
 * the following entries finish it. An admin may call it from the browser.
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
  try {
    return json({ ok: true, ...(await tick(new URL(req.url).searchParams.get("start") === "1")) });
  } catch (e) {
    return fail(e, 500);
  }
}

/**
 * POST /api/visibility/run { action: "start" | "continue" | "retry", runId? } → run progress. The "Run now" button posts
 * "start", then "continue" until `status` is "done".
 */
export async function POST(req: Request) {
  const user = await guard("crm:write");
  if (user instanceof Response) return user;
  const body = (await req.json().catch(() => ({}))) as { action?: string; runId?: string };
  try {
    if (body.action === "start") {
      const run = await startRun(user.id);
      // Return at once so the button can show the total; the first "continue" does the work.
      return json({ ok: true, runId: run.id, status: run.status, total: run.promptIds.length * run.engines.length, done: 0, errors: 0 });
    }
    if (!body.runId) return fail("runId is required");
    if (body.action === "retry") {
      const run = await retryErrors(body.runId);
      if (!run) return fail("Run not found", 404);
    } else if (body.action !== "continue") return fail("Unknown action");
    return json({ ok: true, ...(await continueRun(body.runId)) });
  } catch (e) {
    return fail(e);
  }
}
