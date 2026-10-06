/**
 * Bulk import clients, contacts, workspaces and tasks from CSV files (e.g. data exported from Moxo).
 *
 *   npx tsx scripts/import-csv.ts <folder> [--dry-run] [--strict] [--actor you@company.com]
 *
 * Run it from hub/. It reads whichever of these files exist in <folder> (file names are matched
 * case-insensitively) and imports them in this order so later files can refer to earlier ones:
 *
 *   clients.csv     name*, industry, website, email, phone, address, notes
 *   contacts.csv    name*, email*, client, title, role, password
 *                   role: client (default) | member | admin. "client" rows need a client name that
 *                   exists in clients.csv or in the database; team rows (member/admin) must leave it empty.
 *                   password: optional; when empty a temporary password is generated and written to
 *                   <folder>/credentials-out.csv (temporary passwords are never printed to the console).
 *   workspaces.csv  name*, client, description, status, owner, due_date, members, moxo_url
 *                   status: active (default) | on_hold | completed | archived
 *                   owner: email of a team user (defaults to the actor); members: emails separated by ";"
 *                   (the owner is always a member); moxo_url: optional, appended to the description.
 *   tasks.csv       workspace*, client, title*, description, kind, assignee, due_date, status, priority, internal
 *                   client: only needed when two clients have a workspace with the same name
 *                   kind: task (default) | file_request; status: todo (default) | in_progress | done
 *                   priority: low | normal (default) | high; internal: yes/no (default no)
 *                   assignee: email of an existing user (added to the workspace if not yet a member)
 *
 * (* = required). Headers are case-insensitive, spaces and dashes count as underscores
 * ("Due date" == due_date), cells are trimmed, blank rows are skipped, quoted cells may contain commas,
 * quotes ("") and line breaks. Dates must be YYYY-MM-DD (or an unambiguous "6 Oct 2026").
 * Status, priority and kind accept common synonyms ("In progress", "Completed", "Medium", "To-do", "File Request").
 *
 * Idempotent: clients are matched by name, users by email, workspaces by name + client, tasks by
 * workspace + title + kind. Existing rows are left untouched (but a listed member or assignee is still
 * added to an existing workspace). Rows with problems are skipped and reported with their line number;
 * everything else is written in one transaction. --dry-run validates and prints the same report
 * without writing anything; --strict writes nothing if any row has a problem.
 *
 * The database must already have an administrator (complete the Set up page or run `npm run seed`):
 * imported workspaces and tasks are recorded as created by that administrator (or by --actor).
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, one, run } from "../lib/db";
import { newId, nowIso } from "../lib/ids";
import { pickColor } from "../lib/format";

// ---------- CLI ----------

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--") && !a.includes("=")));
const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--actor");
const dryRun = flags.has("--dry-run");
const strict = flags.has("--strict");
const actorFlag = argv.includes("--actor") ? argv[argv.indexOf("--actor") + 1] : (argv.find((a) => a.startsWith("--actor="))?.slice("--actor=".length) ?? null);

if (flags.has("--help") || flags.has("-h") || !positional[0]) {
  console.log(`Usage: npx tsx scripts/import-csv.ts <folder> [--dry-run] [--strict] [--actor email]

Reads clients.csv, contacts.csv, workspaces.csv and tasks.csv from <folder> (all optional).
See the comment at the top of scripts/import-csv.ts or docs/migrating-from-moxo.md for the columns.
  --dry-run   validate and report, write nothing
  --strict    write nothing if any row has a problem
  --actor     email of the team user recorded as creator/owner (default: the first administrator)`);
  process.exit(positional[0] ? 0 : 2);
}

const folder = path.resolve(positional[0]);

// ---------- Tiny CSV parser (RFC 4180-ish, tolerant) ----------

interface CsvRecord {
  /** 1-based line number where the record starts (header is line 1). */
  line: number;
  fields: string[];
}

function parseCsv(text: string): CsvRecord[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // UTF-8 BOM (Excel)
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordStart = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (c === "\n") line++;
        if (c !== "\r") field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(field);
      field = "";
    } else if (c === "\r") {
      // CRLF: the "\n" that follows ends the record
    } else if (c === "\n") {
      fields.push(field);
      records.push({ line: recordStart, fields });
      fields = [];
      field = "";
      line++;
      recordStart = line;
    } else field += c;
  }
  if (field.length || fields.length) {
    fields.push(field);
    records.push({ line: recordStart, fields });
  }
  return records;
}

const HEADER_ALIASES: Record<string, string> = {
  company: "client",
  client_name: "client",
  organisation: "client",
  organization: "client",
  e_mail: "email",
  email_address: "email",
  full_name: "name",
  contact_name: "name",
  job_title: "title",
  position: "title",
  due: "due_date",
  deadline: "due_date",
  target_date: "due_date",
  assigned_to: "assignee",
  assignee_email: "assignee",
  owner_email: "owner",
  workspace_name: "workspace",
  binder: "workspace",
  project: "workspace",
  type: "kind",
  desc: "description",
  url: "website",
  link: "moxo_url",
};

function normaliseHeader(h: string): string {
  const key = h.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s\-]+/g, "_").replace(/[^a-z0-9_]/g, "");
  return HEADER_ALIASES[key] ?? key;
}

interface Row {
  line: number;
  get: (col: string) => string;
}

interface CsvTable {
  file: string;
  headers: string[];
  rows: Row[];
}

/** `name` is the canonical file name (clients.csv …) used in the report, whatever the on-disk spelling. */
function readCsv(file: string, name: string, known: string[], required: string[]): CsvTable | null {
  const records = parseCsv(fs.readFileSync(file, "utf8"));
  if (!records.length) {
    warn(name, 1, "file is empty");
    return null;
  }
  const headers = records[0]!.fields.map(normaliseHeader);
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length) {
    problem(name, 1, `missing required column(s): ${missing.join(", ")} — found: ${headers.filter(Boolean).join(", ") || "(none)"}`);
    return null;
  }
  const unknown = headers.filter((h) => h && !known.includes(h));
  if (unknown.length) warn(name, 1, `ignoring unknown column(s): ${unknown.join(", ")}`);

  const rows: Row[] = [];
  for (const rec of records.slice(1)) {
    const cells = rec.fields.map((f) => f.trim());
    if (cells.every((c) => c === "")) continue;
    if (cells.length > headers.length && cells.slice(headers.length).some((c) => c !== "")) {
      warn(name, rec.line, `row has ${cells.length} cells but the header has ${headers.length}; extra cells ignored (unquoted comma?)`);
    }
    const map: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) map[h] = cells[i] ?? "";
    });
    rows.push({ line: rec.line, get: (col) => map[col] ?? "" });
  }
  return { file: name, headers, rows };
}

// ---------- Reporting ----------

const problems: string[] = [];
const warnings: string[] = [];
function problem(file: string, line: number, msg: string): void {
  problems.push(`${file} line ${line}: ${msg}`);
}
function warn(file: string, line: number, msg: string): void {
  warnings.push(`${file} line ${line}: ${msg}`);
}

interface Stats {
  created: number;
  existing: number;
  skipped: number;
  extra: string[];
}
const stats: Record<string, Stats> = {};
function stat(file: string): Stats {
  return (stats[file] ??= { created: 0, existing: 0, skipped: 0, extra: [] });
}

// ---------- Value normalisation ----------

const WS_STATUS: Record<string, string> = {
  active: "active", open: "active", "in progress": "active", ongoing: "active",
  on_hold: "on_hold", "on hold": "on_hold", hold: "on_hold", paused: "on_hold", pending: "on_hold",
  completed: "completed", complete: "completed", done: "completed", closed: "completed", finished: "completed",
  archived: "archived", archive: "archived",
};
const TASK_STATUS: Record<string, string> = {
  todo: "todo", "to do": "todo", "to-do": "todo", open: "todo", pending: "todo", "not started": "todo", active: "todo", overdue: "todo", new: "todo",
  in_progress: "in_progress", "in progress": "in_progress", started: "in_progress", doing: "in_progress",
  done: "done", completed: "done", complete: "done", closed: "done", finished: "done",
};
const PRIORITY: Record<string, string> = { low: "low", normal: "normal", medium: "normal", default: "normal", high: "high", urgent: "high" };
const KIND: Record<string, string> = {
  task: "task", todo: "task", "to do": "task", "to-do": "task", action: "task", "action item": "task",
  file_request: "file_request", "file request": "file_request", file: "file_request", files: "file_request", upload: "file_request", "file upload": "file_request",
};
const ROLE: Record<string, string> = { client: "client", contact: "client", external: "client", member: "member", team: "member", internal: "member", staff: "member", admin: "admin", administrator: "admin" };

function pick(table: Record<string, string>, raw: string, fallback: string): string | null {
  const key = raw.trim().toLowerCase();
  if (!key) return fallback;
  return table[key] ?? table[key.replace(/[\s\-]+/g, "_")] ?? null;
}

function toBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (!v) return false;
  if (["yes", "y", "true", "1", "internal", "x"].includes(v)) return true;
  if (["no", "n", "false", "0", "public", "shared"].includes(v)) return false;
  return null;
}

/** Returns YYYY-MM-DD, null for empty, or undefined when the value is not understood. */
function toDate(raw: string): string | null | undefined {
  const v = raw.trim();
  if (!v) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(v)) return undefined; // 03/04/2026 is ambiguous (DMY vs MDY)
  if (/[a-z]/i.test(v)) {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) {
      const d = new Date(t);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  return undefined;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function tempPassword(): string {
  const bytes = randomBytes(12);
  let s = "";
  for (const b of bytes) s += PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ---------- Lookups ----------

interface UserRow { id: string; name: string; email: string; role: string; client_id: string | null; active: number }
interface ClientRow { id: string; name: string }
interface WorkspaceRow { id: string; name: string; client_id: string | null }

function findClient(name: string): ClientRow | undefined {
  return one<ClientRow>("SELECT id, name FROM clients WHERE lower(trim(name)) = lower(?)", name.trim());
}
function findUser(email: string): UserRow | undefined {
  return one<UserRow>("SELECT id, name, email, role, client_id, active FROM users WHERE email = ?", email);
}
function findWorkspace(name: string, clientId: string | null): WorkspaceRow | undefined {
  return one<WorkspaceRow>("SELECT id, name, client_id FROM workspaces WHERE lower(trim(name)) = lower(?) AND client_id IS ?", name.trim(), clientId);
}
function findWorkspacesByName(name: string): WorkspaceRow[] {
  return db().prepare("SELECT id, name, client_id FROM workspaces WHERE lower(trim(name)) = lower(?)").all(name.trim()) as WorkspaceRow[];
}
function isMember(workspaceId: string, userId: string): boolean {
  return !!one("SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?", workspaceId, userId);
}
function addMember(workspaceId: string, userId: string, ts: string): boolean {
  if (isMember(workspaceId, userId)) return false;
  run("INSERT INTO workspace_members (workspace_id, user_id, joined_at) VALUES (?, ?, ?)", workspaceId, userId, ts);
  return true;
}

// ---------- Importers ----------

const credentials: { name: string; email: string; client: string; password: string }[] = [];

function importClients(table: CsvTable): void {
  const s = stat(table.file);
  const ts = nowIso();
  const seen = new Set<string>();
  for (const row of table.rows) {
    const name = row.get("name");
    if (!name) {
      problem(table.file, row.line, "name is empty");
      s.skipped++;
      continue;
    }
    if (seen.has(name.toLowerCase())) {
      warn(table.file, row.line, `duplicate client "${name}" in this file; ignored`);
      s.skipped++;
      continue;
    }
    seen.add(name.toLowerCase());
    if (findClient(name)) {
      s.existing++;
      console.log(`  = client    ${name} (exists)`);
      continue;
    }
    const email = normaliseEmail(row.get("email"));
    if (email && !EMAIL_RE.test(email)) warn(table.file, row.line, `client email "${email}" does not look like an email; kept as is`);
    run(
      "INSERT INTO clients (id, name, industry, website, email, phone, address, notes, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      newId(), name, row.get("industry"), row.get("website"), email, row.get("phone"), row.get("address"), row.get("notes"), pickColor(name), ts,
    );
    s.created++;
    console.log(`  + client    ${name}`);
  }
}

function importContacts(table: CsvTable): void {
  const s = stat(table.file);
  const ts = nowIso();
  const seen = new Set<string>();
  for (const row of table.rows) {
    const name = row.get("name");
    const email = normaliseEmail(row.get("email"));
    const clientName = row.get("client");
    const role = pick(ROLE, row.get("role"), "client");
    if (!name || !email) {
      problem(table.file, row.line, `${!name ? "name" : "email"} is empty`);
      s.skipped++;
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      problem(table.file, row.line, `"${email}" is not a valid email`);
      s.skipped++;
      continue;
    }
    if (!role) {
      problem(table.file, row.line, `unknown role "${row.get("role")}" (use client, member or admin)`);
      s.skipped++;
      continue;
    }
    if (seen.has(email)) {
      warn(table.file, row.line, `duplicate email ${email} in this file; ignored`);
      s.skipped++;
      continue;
    }
    seen.add(email);

    let clientId: string | null = null;
    if (role === "client") {
      if (!clientName) {
        problem(table.file, row.line, `${email}: a contact needs a client name (or set role to member/admin for your own team)`);
        s.skipped++;
        continue;
      }
      const client = findClient(clientName);
      if (!client) {
        problem(table.file, row.line, `${email}: client "${clientName}" not found (add it to clients.csv or create it in the app first)`);
        s.skipped++;
        continue;
      }
      clientId = client.id;
    } else if (clientName) {
      warn(table.file, row.line, `${email}: role ${role} is a team login, the client column ("${clientName}") was ignored`);
    }

    const existing = findUser(email);
    if (existing) {
      s.existing++;
      const note = existing.role !== role ? ` — note: existing role is ${existing.role}, not changed` : "";
      console.log(`  = user      ${existing.name} <${email}> (exists${existing.active ? "" : ", deactivated"})${note}`);
      continue;
    }

    let password = row.get("password");
    let generated = false;
    if (!password) {
      password = tempPassword();
      generated = true;
    } else if (password.length < 8) {
      problem(table.file, row.line, `${email}: password must be at least 8 characters (leave it empty to generate one)`);
      s.skipped++;
      continue;
    }
    run(
      "INSERT INTO users (id, name, email, password_hash, role, title, client_id, color, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
      newId(), name, email, bcrypt.hashSync(password, 10), role, row.get("title"), clientId, pickColor(email), ts,
    );
    if (generated) credentials.push({ name, email, client: role === "client" ? clientName : "", password });
    s.created++;
    console.log(`  + user      ${name} <${email}> (${role}${clientId ? `, ${clientName}` : ""})${generated ? " — temporary password generated" : ""}`);
  }
}

function splitEmails(raw: string): string[] {
  return raw.split(/[;|\s,]+/).map(normaliseEmail).filter(Boolean);
}

function importWorkspaces(table: CsvTable, actor: UserRow): void {
  const s = stat(table.file);
  let membersAdded = 0;
  for (const row of table.rows) {
    const ts = nowIso();
    const name = row.get("name");
    if (!name) {
      problem(table.file, row.line, "name is empty");
      s.skipped++;
      continue;
    }
    const clientName = row.get("client");
    let clientId: string | null = null;
    if (clientName) {
      const client = findClient(clientName);
      if (!client) {
        problem(table.file, row.line, `"${name}": client "${clientName}" not found (add it to clients.csv or create it in the app first)`);
        s.skipped++;
        continue;
      }
      clientId = client.id;
    }
    const status = pick(WS_STATUS, row.get("status"), "active");
    if (!status) {
      problem(table.file, row.line, `"${name}": unknown status "${row.get("status")}" (use active, on_hold, completed or archived)`);
      s.skipped++;
      continue;
    }
    const due = toDate(row.get("due_date"));
    if (due === undefined) {
      problem(table.file, row.line, `"${name}": due_date "${row.get("due_date")}" not understood; use YYYY-MM-DD`);
      s.skipped++;
      continue;
    }

    let owner = actor;
    const ownerEmail = normaliseEmail(row.get("owner"));
    if (ownerEmail) {
      const u = findUser(ownerEmail);
      if (!u) warn(table.file, row.line, `"${name}": owner ${ownerEmail} not found; ${actor.email} used instead`);
      else if (u.role === "client") warn(table.file, row.line, `"${name}": owner ${ownerEmail} is a client contact; ${actor.email} used instead`);
      else owner = u;
    }

    const memberIds = new Set<string>([owner.id]);
    for (const email of splitEmails(row.get("members"))) {
      const u = findUser(email);
      if (!u) {
        warn(table.file, row.line, `"${name}": member ${email} not found; skipped (add them to contacts.csv)`);
        continue;
      }
      if (u.role === "client" && clientId && u.client_id !== clientId) {
        warn(table.file, row.line, `"${name}": ${email} belongs to another client; skipped`);
        continue;
      }
      memberIds.add(u.id);
    }

    const existing = findWorkspace(name, clientId);
    if (existing) {
      s.existing++;
      let added = 0;
      for (const id of memberIds) if (addMember(existing.id, id, ts)) added++;
      membersAdded += added;
      console.log(`  = workspace ${name}${clientName ? ` — ${clientName}` : ""} (exists${added ? `, ${added} member(s) added` : ""})`);
      continue;
    }

    let description = row.get("description");
    const moxoUrl = row.get("moxo_url");
    if (moxoUrl) description = description ? `${description}\n\nMigrated from Moxo: ${moxoUrl}` : `Migrated from Moxo: ${moxoUrl}`;

    const id = newId();
    run(
      "INSERT INTO workspaces (id, name, description, client_id, status, owner_id, due_date, created_at, updated_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, name, description, clientId, status, owner.id, due, ts, ts, ts,
    );
    for (const uid of memberIds) addMember(id, uid, ts);
    run(
      "INSERT INTO messages (id, workspace_id, user_id, kind, body, internal, file_id, ref_type, ref_id, created_at) VALUES (?, ?, ?, 'system', ?, 0, NULL, NULL, NULL, ?)",
      newId(), id, actor.id, "created this workspace (imported)", ts,
    );
    s.created++;
    console.log(`  + workspace ${name}${clientName ? ` — ${clientName}` : ""} (${status}, ${memberIds.size} members)`);
  }
  if (membersAdded) s.extra.push(`${membersAdded} member(s) added to existing workspaces`);
}

function importTasks(table: CsvTable, actor: UserRow): void {
  const s = stat(table.file);
  let membersAdded = 0;
  for (const row of table.rows) {
    const ts = nowIso();
    const wsName = row.get("workspace");
    const title = row.get("title");
    if (!wsName || !title) {
      problem(table.file, row.line, `${!wsName ? "workspace" : "title"} is empty`);
      s.skipped++;
      continue;
    }

    let ws: WorkspaceRow | undefined;
    const clientName = row.get("client");
    if (clientName) {
      const client = findClient(clientName);
      if (!client) {
        problem(table.file, row.line, `"${title}": client "${clientName}" not found`);
        s.skipped++;
        continue;
      }
      ws = findWorkspace(wsName, client.id);
    } else {
      const matches = findWorkspacesByName(wsName);
      if (matches.length > 1) {
        problem(table.file, row.line, `"${title}": ${matches.length} workspaces are named "${wsName}"; fill in the client column to pick one`);
        s.skipped++;
        continue;
      }
      ws = matches[0];
    }
    if (!ws) {
      problem(table.file, row.line, `"${title}": workspace "${wsName}"${clientName ? ` for client "${clientName}"` : ""} not found (add it to workspaces.csv first)`);
      s.skipped++;
      continue;
    }

    const kind = pick(KIND, row.get("kind"), "task");
    const status = pick(TASK_STATUS, row.get("status"), "todo");
    const priority = pick(PRIORITY, row.get("priority"), "normal");
    const internal = toBool(row.get("internal"));
    const due = toDate(row.get("due_date"));
    const bad =
      !kind ? `unknown kind "${row.get("kind")}" (use task or file_request)`
      : !status ? `unknown status "${row.get("status")}" (use todo, in_progress or done)`
      : !priority ? `unknown priority "${row.get("priority")}" (use low, normal or high)`
      : internal === null ? `internal "${row.get("internal")}" not understood (use yes or no)`
      : due === undefined ? `due_date "${row.get("due_date")}" not understood; use YYYY-MM-DD`
      : null;
    if (bad) {
      problem(table.file, row.line, `"${title}": ${bad}`);
      s.skipped++;
      continue;
    }

    let assigneeId: string | null = null;
    const assigneeEmail = normaliseEmail(row.get("assignee"));
    if (assigneeEmail) {
      const u = findUser(assigneeEmail);
      if (!u) {
        warn(table.file, row.line, `"${title}": assignee ${assigneeEmail} not found; left unassigned`);
      } else if (u.role === "client" && ws.client_id && u.client_id !== ws.client_id) {
        warn(table.file, row.line, `"${title}": assignee ${assigneeEmail} belongs to another client; left unassigned`);
      } else {
        assigneeId = u.id;
        if (addMember(ws.id, u.id, ts)) {
          membersAdded++;
          warn(table.file, row.line, `"${title}": assignee ${assigneeEmail} was not a member of "${ws.name}" and has been added`);
        }
      }
    }

    if (one("SELECT 1 FROM tasks WHERE workspace_id = ? AND lower(trim(title)) = lower(?) AND kind = ?", ws.id, title, kind)) {
      s.existing++;
      console.log(`  = ${kind === "task" ? "task     " : "file req."} ${title} [${ws.name}] (exists)`);
      continue;
    }
    run(
      "INSERT INTO tasks (id, workspace_id, title, description, kind, assignee_id, due_date, status, priority, internal, created_by, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      newId(), ws.id, title, row.get("description"), kind, assigneeId, due, status, priority, internal ? 1 : 0, actor.id, ts, ts, status === "done" ? ts : null,
    );
    s.created++;
    console.log(`  + ${kind === "task" ? "task     " : "file req."} ${title} [${ws.name}]${assigneeEmail && assigneeId ? ` → ${assigneeEmail}` : ""}${status !== "todo" ? ` (${status})` : ""}`);
  }
  if (membersAdded) s.extra.push(`${membersAdded} assignee(s) added as workspace members`);
}

// ---------- Main ----------

const FILES: { name: string; known: string[]; required: string[] }[] = [
  { name: "clients.csv", known: ["name", "industry", "website", "email", "phone", "address", "notes"], required: ["name"] },
  { name: "contacts.csv", known: ["name", "email", "client", "title", "role", "password"], required: ["name", "email"] },
  { name: "workspaces.csv", known: ["name", "client", "description", "status", "owner", "due_date", "members", "moxo_url"], required: ["name"] },
  { name: "tasks.csv", known: ["workspace", "client", "title", "description", "kind", "assignee", "due_date", "status", "priority", "internal"], required: ["workspace", "title"] },
];

function resolveActor(): UserRow {
  if (actorFlag) {
    const u = findUser(normaliseEmail(actorFlag));
    if (!u) throw new Error(`--actor ${actorFlag}: no user with that email`);
    if (u.role === "client") throw new Error(`--actor ${actorFlag}: must be a team user, not a client contact`);
    return u;
  }
  const admin = one<UserRow>("SELECT id, name, email, role, client_id, active FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at LIMIT 1");
  if (!admin) throw new Error("No administrator in the database yet. Complete the Set up page in the app (or run `npm run seed`) first, or pass --actor.");
  return admin;
}

function main(): void {
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    console.error(`Folder not found: ${folder}`);
    process.exit(2);
  }
  const present = new Map(fs.readdirSync(folder).map((f) => [f.toLowerCase(), f]));
  const found = FILES.filter((f) => present.has(f.name));
  if (!found.length) {
    console.error(`No CSV files found in ${folder} (expected clients.csv, contacts.csv, workspaces.csv and/or tasks.csv).`);
    process.exit(2);
  }

  db();
  const actor = resolveActor();
  console.log(`${dryRun ? "DRY RUN — " : ""}Importing from ${folder}`);
  console.log(`Files: ${found.map((f) => f.name).join(", ")}   Actor: ${actor.name} <${actor.email}>\n`);

  const conn = db();
  conn.exec("BEGIN");
  let committed = false;
  try {
    for (const spec of FILES) {
      if (!present.has(spec.name)) continue;
      const table = readCsv(path.join(folder, present.get(spec.name)!), spec.name, spec.known, spec.required);
      console.log(`${spec.name}${table ? ` (${table.rows.length} rows)` : ""}`);
      if (!table) continue;
      if (spec.name === "clients.csv") importClients(table);
      else if (spec.name === "contacts.csv") importContacts(table);
      else if (spec.name === "workspaces.csv") importWorkspaces(table, actor);
      else importTasks(table, actor);
      console.log("");
    }
    if (dryRun || (strict && problems.length)) conn.exec("ROLLBACK");
    else {
      conn.exec("COMMIT");
      committed = true;
    }
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }

  // Temporary passwords go to a file next to the CSVs, never to the console.
  let credentialsNote = "";
  if (credentials.length) {
    const out = path.join(folder, "credentials-out.csv");
    if (committed) {
      const exists = fs.existsSync(out);
      const lines = credentials.map((c) => [c.name, c.email, c.client, c.password].map(csvCell).join(","));
      fs.appendFileSync(out, (exists ? "" : "name,email,client,temporary_password\n") + lines.join("\n") + "\n", { mode: 0o600 });
      credentialsNote = `${credentials.length} temporary password(s) written to ${out}${exists ? " (appended)" : ""}.\n  Send each one privately, ask people to change it after signing in, then delete the file.`;
    } else {
      credentialsNote = `${credentials.length} temporary password(s) would be written to ${out}.`;
    }
  }

  // Summary
  console.log("Summary");
  for (const spec of FILES) {
    const s = stats[spec.name];
    if (!s) continue;
    const extra = s.extra.length ? `; ${s.extra.join("; ")}` : "";
    console.log(`  ${spec.name.padEnd(15)} ${s.created} created, ${s.existing} already existed, ${s.skipped} skipped${extra}`);
  }
  if (credentialsNote) console.log(`  ${credentialsNote}`);
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length})`);
    for (const w of warnings) console.log(`  ${w}`);
  }
  if (problems.length) {
    console.log(`\nProblems (${problems.length}) — these rows were skipped`);
    for (const p of problems) console.log(`  ${p}`);
  }
  console.log("");
  if (dryRun) console.log("Dry run: nothing was written. Run again without --dry-run to import.");
  else if (!committed) console.log("--strict: problems found, nothing was written.");
  else console.log(problems.length ? "Done with problems: fix the rows above and run again (existing rows are skipped)." : "Done.");
  process.exit(problems.length ? 1 : 0);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
