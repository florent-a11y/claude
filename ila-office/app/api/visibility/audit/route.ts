import { guard } from "@/lib/auth";
import { runAudit } from "@/lib/visibility/audit";
import { getConfig } from "@/lib/visibility/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/visibility/audit → crawls ILA's public site (the first domain in the visibility settings) and stores the audit. */
export async function POST() {
  const user = await guard("crm:write");
  if (user instanceof Response) return user;
  try {
    const config = await getConfig();
    const audit = await runAudit(config.domains[0] ?? "");
    return Response.json({ ok: true, id: audit.id, score: audit.score });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
