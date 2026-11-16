import Link from "next/link";
import { getUser, isClient } from "@/lib/auth";
import { AUDITED_TABLES, AUDIT_ACTION_LABELS, AUDIT_SYSTEM, auditHref, auditQueryFrom, auditTableName, listAudit, type AuditQuery } from "@/lib/audit";
import { fmtDateTime } from "@/lib/dates";
import { AUDIT_ACTIONS, type AuditAction, type AuditEntry, type Table } from "@/lib/types";
import { Badge, Card, CardTable, Cols, Dash, EmptyState, Notice, Select, TableCard, withParams, type Tone } from "@/components/ui";

/**
 * Audit trail screens (rules and storage: lib/audit.ts). `AuditTrail` is the "History" card at the bottom of a
 * document page; `AuditLog` is the filterable list behind Settings → Audit log (every entity, admins) and
 * Books → Audit log (one entity, team roles). Server components; neither is ever shown to a client login.
 */

const ACTION_TONE: Record<AuditAction, Tone> = { create: "blue", update: "slate", delete: "red", post: "green", void: "red", approve: "green", pay: "green", lock: "amber", unlock: "amber", import: "indigo" };
const PAGE_SIZE = 100;
const TRAIL_SIZE = 30;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SETUP_HINT = "On Supabase, run supabase/schema.sql once: it creates the audit_log table.";

function ActionBadge({ action }: { action: AuditAction }) {
  return <Badge tone={ACTION_TONE[action] ?? "slate"}>{AUDIT_ACTION_LABELS[action] ?? action}</Badge>;
}

/** Date and time in WITA on two lines; the exact instant (UTC) on hover. */
function When({ at }: { at: string }) {
  const [date, time] = fmtDateTime(at).split(", ");
  return <span title={at}>{date}<span className="cell-sub">{time}</span></span>;
}

function Who({ entry }: { entry: AuditEntry }) {
  return <><span className="cell-primary" title={entry.userName}>{entry.userName}</span>{entry.userEmail && <span className="cell-sub" title={entry.userEmail}>{entry.userEmail}</span>}</>;
}

/** The one-line summary; the field-by-field list opens underneath when the entry has one. */
function Changes({ entry }: { entry: AuditEntry }) {
  const changes = entry.changes ?? [];
  const line = entry.summary ?? (entry.count ? `${entry.count} rows` : "");
  if (changes.length === 0) return line ? <span className="block whitespace-normal [overflow-wrap:anywhere]">{line}</span> : <Dash />;
  const none = <span className="text-ink-500">(none)</span>;
  return (
    <details className="whitespace-normal [overflow-wrap:anywhere]">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{line} <span className="whitespace-nowrap text-xs text-brand-600 hover:underline">{changes.length} field{changes.length === 1 ? "" : "s"}</span></summary>
      <dl className="mt-1.5 grid grid-cols-[fit-content(40%)_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
        {changes.map((c, i) => (
          <div key={i} className="contents">
            <dt className="text-ink-500">{c.field}</dt>
            <dd>{c.from === undefined && c.to === undefined ? <span className="text-ink-500">changed</span> : <>{c.from ?? none} <span className="text-ink-500">→</span> {c.to ?? none}</>}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** "History" card of one record: its last 30 log entries, newest first. Renders nothing for a client login. */
export async function AuditTrail({ table, docId, title = "History", className = "" }: { table: Table; docId: string; title?: string; className?: string }) {
  const user = await getUser();
  if (!user || isClient(user)) return null;
  let rows: AuditEntry[] = [];
  let failed = false;
  try {
    rows = await listAudit({ table, docId, limit: TRAIL_SIZE + 1 });
  } catch {
    failed = true;
  }
  const more = rows.length > TRAIL_SIZE && rows[0].entityId ? `/books/${rows[0].entityId}/audit?table=${table}&doc=${encodeURIComponent(docId)}` : undefined;
  return (
    <Card title={title} className={`no-print ${className}`} actions={<span className="text-xs text-ink-500">Who changed this record and when, newest first{more && <> · <Link href={more} className="text-brand-600 hover:underline">full history</Link></>}</span>}>
      {failed ? <p className="text-sm text-ink-500">The history could not be read. {SETUP_HINT}</p> : rows.length === 0 ? (
        <p className="text-sm text-ink-500">Nothing recorded yet (records created before the audit log existed, or in a bulk import, have no history of their own).</p>
      ) : (
        <CardTable>
          <table className="table table-data min-w-[640px]">
            <Cols widths={[140, 190, 100, undefined]} />
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>What changed</th></tr></thead>
            <tbody>
              {rows.slice(0, TRAIL_SIZE).map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap !align-top"><When at={e.at} /></td>
                  <td className="!align-top"><Who entry={e} /></td>
                  <td className="!align-top"><ActionBadge action={e.action} /></td>
                  <td className="!align-top"><Changes entry={e} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardTable>
      )}
    </Card>
  );
}

/**
 * The audit log as a list: filters (GET form, kept in the URL), 100 entries per page, Newer / Older. With `entityId`
 * the list is limited to that entity and the entity filter is hidden. The caller checks who may see it.
 */
export async function AuditLog({ base, params, entityId, entities = [], users, exportHref }: {
  /** Path of the page; filter and paging links are built on it. */
  base: string;
  /** The page's query string. */
  params: Record<string, string | string[] | undefined>;
  entityId?: string;
  entities?: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string }>;
  /** CSV route taking the same filters (admins only: app/settings/audit/export). */
  exportHref?: string;
}) {
  const get = (key: string) => { const v = params[key]; return Array.isArray(v) ? v[0] : v; };
  const query: AuditQuery = { ...auditQueryFrom(get), ...(entityId ? { entityId } : {}) };
  const page = Math.max(1, Number.parseInt(get("page") ?? "1", 10) || 1);
  let rows: AuditEntry[] = [];
  let problem: string | undefined;
  try {
    rows = await listAudit({ ...query, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE });
  } catch (e) {
    problem = e instanceof Error ? e.message : String(e);
  }
  const shown = rows.slice(0, PAGE_SIZE);
  const older = rows.length > PAGE_SIZE;
  const current = { entity: entityId ? undefined : query.entityId, user: query.userId, table: query.table, action: query.action, from: query.from, to: query.to, q: query.q, doc: query.docId };
  const filtered = Object.values(current).some(Boolean);
  const entityName = new Map(entities.map((e) => [e.id, e.name]));
  const tables = AUDITED_TABLES.map((t) => ({ value: t as string, label: cap(auditTableName(t, true)) })).sort((x, y) => x.label.localeCompare(y.label));
  const first = (page - 1) * PAGE_SIZE + 1;
  const pager = "text-brand-600 hover:underline";
  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap items-center gap-2 no-print">
        {!entityId && <Select name="entity" defaultValue={query.entityId ?? ""} options={[{ value: "", label: "All entities" }, ...entities.map((e) => ({ value: e.id, label: e.name }))]} className="input !w-auto !py-1" />}
        <Select name="user" defaultValue={query.userId ?? ""} options={[{ value: "", label: "Everyone" }, ...users.map((u) => ({ value: u.id, label: u.name })), { value: AUDIT_SYSTEM, label: "System and jobs" }]} className="input !w-auto !py-1" />
        <Select name="table" defaultValue={query.table ?? ""} options={[{ value: "", label: "All record types" }, ...tables]} className="input !w-auto !py-1" />
        <Select name="action" defaultValue={query.action ?? ""} options={[{ value: "", label: "All actions" }, ...AUDIT_ACTIONS.map((a) => ({ value: a as string, label: cap(AUDIT_ACTION_LABELS[a]) }))]} className="input !w-auto !py-1" />
        <label className="flex items-center gap-1 text-xs text-ink-500">From <input type="date" name="from" defaultValue={query.from} className="input !w-36 !py-1" /></label>
        <label className="flex items-center gap-1 text-xs text-ink-500">To <input type="date" name="to" defaultValue={query.to} className="input !w-36 !py-1" /></label>
        <input name="q" defaultValue={query.q} placeholder="Search number, name, period…" className="input !w-56 !py-1" />
        {query.docId && <input type="hidden" name="doc" value={query.docId} />}
        <button className="btn-secondary !py-1 text-xs">Filter</button>
        {filtered && <Link href={base} className="text-xs text-brand-600 hover:underline">Clear</Link>}
        {exportHref && <a href={withParams(exportHref, { ...current, entity: query.entityId }, {})} className="btn-secondary ml-auto !py-1 text-xs" title="The entries matching these filters, newest first (at most 5,000 rows)">Download CSV</a>}
      </form>
      {query.docId && <Notice tone="blue">Showing the history of one record. <Link href={withParams(base, current, { doc: undefined })} className="underline">Show every record</Link></Notice>}
      {problem ? <Notice tone="red">The audit log could not be read ({problem}). {SETUP_HINT}</Notice> : shown.length === 0 ? (
        <EmptyState title={filtered || page > 1 ? "No entry matches these filters" : "Nothing recorded yet"} hint="Every creation, edit, deletion, posting, void, approval, payment, period lock and import is written here as it happens. Records that existed before the audit log have no history." />
      ) : (
        <TableCard footer={
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>Entries {first}–{first + shown.length - 1}, newest first{older ? "" : " · end of the log"}</span>
            <span className="flex gap-4 no-print">
              {page > 1 ? <Link href={withParams(base, current, { page: page > 2 ? String(page - 1) : undefined })} className={pager}>‹ Newer</Link> : <span className="text-slate-300">‹ Newer</span>}
              {older ? <Link href={withParams(base, current, { page: String(page + 1) })} className={pager}>Older ›</Link> : <span className="text-slate-300">Older ›</span>}
            </span>
          </span>
        }>
          <table className="table table-data min-w-[1040px]">
            <Cols widths={[140, 190, 100, 290, undefined]} />
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>What changed</th></tr></thead>
            <tbody>
              {shown.map((e) => {
                const href = e.action === "delete" ? undefined : auditHref(e);
                const kind = [auditTableName(e.table), !entityId && e.entityId ? entityName.get(e.entityId) : undefined].filter(Boolean).join(" · ");
                return (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap !align-top"><When at={e.at} /></td>
                    <td className="!align-top"><Who entry={e} /></td>
                    <td className="!align-top"><ActionBadge action={e.action} /></td>
                    <td className="!align-top">
                      {href ? <Link href={href} className="cell-primary" title={e.label}>{e.label}</Link> : <span className="cell-primary" title={e.label}>{e.label}</span>}
                      <span className="cell-sub" title={kind}>{kind}</span>
                    </td>
                    <td className="!align-top"><Changes entry={e} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}
    </div>
  );
}
