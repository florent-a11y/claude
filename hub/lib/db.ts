import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, UPLOAD_DIR } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var __hubDb: Database.Database | undefined;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#0ea5e9',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','member','client')),
  title TEXT NOT NULL DEFAULT '',
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','completed','archived')),
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS workspaces_client ON workspaces(client_id);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('direct','group')),
  title TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  last_read_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user ON conversation_members(user_id);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  storage_key TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT '',
  internal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS files_ws ON files(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS files_conv ON files(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL DEFAULT '',
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS direct_messages_conv ON direct_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','system')),
  body TEXT NOT NULL DEFAULT '',
  internal INTEGER NOT NULL DEFAULT 0,
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  ref_type TEXT,
  ref_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_ws ON messages(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task','file_request')),
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  internal INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS tasks_ws ON tasks(workspace_id, status);
CREATE INDEX IF NOT EXISTS tasks_assignee ON tasks(assignee_id, status);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approver_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decision_note TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS approvals_ws ON approvals(workspace_id, status);
CREATE INDEX IF NOT EXISTS approvals_approver ON approvals(approver_id, status);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  href TEXT NOT NULL DEFAULT '/',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, read, created_at);
`;

function open(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const d = new Database(path.join(DATA_DIR, "hub.db"));
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  d.pragma("busy_timeout = 5000");
  migrate(d); // upgrade tables from older versions first, so the CREATE ... IF NOT EXISTS statements below apply cleanly
  d.exec(SCHEMA);
  return d;
}

const SCHEMA_VERSION = 1;

/** Upgrades databases created by earlier versions. Runs before the schema, so a fresh (empty) database just gets its version stamped. */
function migrate(d: Database.Database): void {
  const version = d.pragma("user_version", { simple: true }) as number;
  if (version >= SCHEMA_VERSION) return;
  if (version < 1) {
    // v1: files may belong to a direct-message conversation instead of a workspace.
    const cols = d.prepare("PRAGMA table_info(files)").all() as { name: string }[];
    if (cols.length && !cols.some((c) => c.name === "conversation_id")) {
      d.pragma("foreign_keys = OFF");
      try {
        d.exec(`
          BEGIN;
          CREATE TABLE files_v1 (
            id TEXT PRIMARY KEY,
            workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
            conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
            uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            size INTEGER NOT NULL DEFAULT 0,
            mime TEXT NOT NULL DEFAULT 'application/octet-stream',
            storage_key TEXT NOT NULL,
            folder TEXT NOT NULL DEFAULT '',
            internal INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
          );
          INSERT INTO files_v1 (id, workspace_id, conversation_id, uploader_id, name, size, mime, storage_key, folder, internal, created_at)
            SELECT id, workspace_id, NULL, uploader_id, name, size, mime, storage_key, folder, internal, created_at FROM files;
          DROP TABLE files;
          ALTER TABLE files_v1 RENAME TO files;
          CREATE INDEX IF NOT EXISTS files_ws ON files(workspace_id, created_at);
          CREATE INDEX IF NOT EXISTS files_conv ON files(conversation_id, created_at);
          COMMIT;
        `);
      } catch (e) {
        d.exec("ROLLBACK");
        throw e;
      } finally {
        d.pragma("foreign_keys = ON");
      }
    }
  }
  d.pragma(`user_version = ${SCHEMA_VERSION}`);
}

/** Shared connection (kept on globalThis so dev hot-reloads reuse it). */
export function db(): Database.Database {
  if (!globalThis.__hubDb) globalThis.__hubDb = open();
  return globalThis.__hubDb;
}

export function one<T>(sql: string, ...params: unknown[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}
export function all<T>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}
export function run(sql: string, ...params: unknown[]): Database.RunResult {
  return db().prepare(sql).run(...params);
}
export function transaction<T>(fn: () => T): T {
  return db().transaction(fn)();
}
