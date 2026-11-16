import { guard } from "@/lib/auth";
import { AUDIT_ACTION_LABELS, auditQueryFrom, auditTableName, listAudit } from "@/lib/audit";
import { csvResponse } from "@/lib/csv";
import { todayISO } from "@/lib/dates";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAP = 5000;
/** WITA wall clock (UTC+8) as `YYYY-MM-DD HH:MM:SS`, sortable in a spreadsheet. */
const wita = (iso: string) => { const t = Date.parse(iso); return Number.isNaN(t) ? "" : new Date(t + 8 * 3_600_000).toISOString().slice(0, 19).replace("T", " "); };

/**
 * GET /settings/audit/export?entity=&user=&table=&action=&from=&to=&q=&doc= → the audit log as CSV, with the filters of
 * Settings → Audit log, newest first, at most 5,000 rows (a last line says so when there were more). Admins only.
 */
export async function GET(req: Request) {
  const g = await guard("admin");
  if (g instanceof Response) return g;
  const q = new URL(req.url).searchParams;
  const [found, entities] = await Promise.all([listAudit({ ...auditQueryFrom((k) => q.get(k)), limit: CAP + 1 }), db.list("entities")]);
  const entityName = new Map(entities.map((e) => [e.id, e.name]));
  const header = ["When (WITA)", "When (UTC)", "User", "Email", "Action", "Record type", "Record", "Entity", "Summary", "Changes", "Rows", "Record id", "Entry id"];
  const rows: unknown[][] = found.slice(0, CAP).map((e) => [
    wita(e.at), e.at, e.userName, e.userEmail ?? "", AUDIT_ACTION_LABELS[e.action] ?? e.action, auditTableName(e.table), e.label, e.entityId ? entityName.get(e.entityId) ?? e.entityId : "", e.summary ?? "",
    (e.changes ?? []).map((c) => (c.from === undefined && c.to === undefined ? `${c.field}: changed` : `${c.field}: ${c.from ?? "(none)"} → ${c.to ?? "(none)"}`)).join("; "),
    e.count ?? "", e.docId, e.id,
  ]);
  if (found.length > CAP) rows.push([`Only the newest ${CAP.toLocaleString("en-US")} entries are included; narrow the filters to export the rest.`]);
  return csvResponse(header, rows, `audit-log-${todayISO()}.csv`);
}
