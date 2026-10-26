import { storageCheck } from "@/lib/db";
export const runtime = "nodejs";
/** Public liveness check: storage backend and whether the database answers with the expected schema. */
export async function GET() {
  const check = await storageCheck();
  return Response.json({ ok: check.database === "ok", ...check, time: new Date().toISOString() }, { status: check.database === "ok" ? 200 : 503 });
}
