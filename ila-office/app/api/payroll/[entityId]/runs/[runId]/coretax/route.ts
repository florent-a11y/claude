import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { slug } from "@/lib/util";
import { coretaxPayrollXml } from "@/lib/tax/withholding";

export const runtime = "nodejs";

/**
 * GET /api/payroll/:entityId/runs/:runId/coretax → the run's monthly PPh 21 employee slips in Coretax's bulk-import
 * layout (BPMP_Template.xml: MmPayrollBulk). Employees taxed with the annual method (December, termination) are left
 * out and named in a leading comment, as they go on the annual A1 form.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ entityId: string; runId: string }> }) {
  const { entityId, runId } = await params;
  const g = await guard("read", entityId);
  if (g instanceof Response) return g;
  const [entity, run] = await Promise.all([db.get("entities", entityId), db.get("payroll_runs", runId)]);
  if (!entity || !run || run.entityId !== entityId) return new Response("Not found", { status: 404 });
  const employees = await db.list("employees", { where: { entityId } });
  const r = coretaxPayrollXml(run, employees, entity);
  const note = r.skipped.length ? `<!-- Not in this file: ${r.skipped.map((s) => s.replace(/--/g, "-")).join("; ")} -->\n` : "";
  const xml = r.xml.replace(/^(<\?xml[^>]*>\n)/, `$1${note}`);
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "content-disposition": `attachment; filename="bpmp-${slug(entity.name)}-${run.period}.xml"`, "cache-control": "private, no-store" } });
}
