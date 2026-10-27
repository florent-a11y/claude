import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { supabaseClient } from "./db";
import type { Attachment } from "./types";

/**
 * Supporting documents (invoices, receipts, contracts…) attached to books records.
 *
 * Two backends, chosen the same way as lib/db.ts:
 * - Supabase Storage, private bucket `ila-office` (created by supabase/schema.sql), when the Supabase client is configured.
 * - Otherwise plain files under `${ILA_DATA_DIR ?? "data"}/files/<key>` (development / laptop).
 *
 * Storage keys are `<entityId>/<docType>/<docId>/<id>-<safe name>`: the entity prefix is what the download route checks,
 * the sanitised name keeps keys URL-safe without encoding. The MIME type is always derived from the extension, never
 * taken from the browser, so what we serve back matches what we accepted.
 */

/** 4 MB per file: Vercel caps server-action request bodies at 4.5 MB. */
export const ATTACHMENT_LIMIT = 4 * 1024 * 1024;
export const ATTACHMENT_BUCKET = "ila-office";

/** Allowed extensions and the MIME type stored and served for each. */
export const ATTACHMENT_TYPES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
};

/** MIME types browsers may report for the allowed extensions (Windows reports CSV as Excel, Safari HEIC as heif…). */
const ALLOWED_MIME = new Set<string>([
  ...Object.values(ATTACHMENT_TYPES),
  "application/x-pdf", "image/pjpeg", "image/heif", "image/heic-sequence", "image/heif-sequence",
  "application/csv", "text/comma-separated-values", "application/vnd.ms-excel.sheet.macroenabled.12",
  "text/x-csv", "application/x-msg", "application/vnd.ms-office",
]);
/** Reported when the browser does not know the type (.msg, .heic, .eml on many systems); the extension decides. */
const GENERIC_MIME = new Set(["", "application/octet-stream", "application/unknown", "binary/octet-stream"]);

/** `accept` attribute for the file input. */
export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES).map((e) => `.${e}`).join(",");
export const ATTACHMENT_HINT = "PDF, images, Excel or Word, up to 4 MB per file";

const MAX_NAME = 80;

/** Last path segment of whatever the browser sent (some send the full client path). */
function baseName(name: string): string {
  const parts = name.split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/** Lower-case extension without the dot, or "" when there is none. */
export function extensionOf(name: string): string {
  const base = baseName(name);
  const i = base.lastIndexOf(".");
  if (i <= 0 || i === base.length - 1) return "";
  return base.slice(i + 1).toLowerCase();
}

/** MIME type for a file name according to the allowlist (undefined when the extension is not allowed). */
export function mimeFor(name: string): string | undefined {
  return ATTACHMENT_TYPES[extensionOf(name)];
}

function asciiSlug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining marks left by NFKD (é → e)
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "");
}

/**
 * File name safe for a storage key or a filesystem path: ASCII letters, digits, dot, dash, underscore; at most 80
 * characters; the extension is kept (lower-cased) and the stem truncated instead.
 */
export function safeFileName(name: string): string {
  const base = baseName(name.trim());
  const ext = extensionOf(base);
  const stemRaw = ext ? base.slice(0, base.length - ext.length - 1) : base;
  let stem = asciiSlug(stemRaw) || "file";
  const suffix = ext ? `.${ext}` : "";
  const room = Math.max(1, MAX_NAME - suffix.length);
  if (stem.length > room) stem = stem.slice(0, room).replace(/[._-]+$/, "") || "file";
  return `${stem}${suffix}`;
}

function assertSegment(value: string, what: string) {
  if (!value || value === "." || value === ".." || /[\\/]/.test(value) || value.includes("..")) throw new Error(`Invalid ${what}`);
}

/** Storage key for an attachment: `<entityId>/<docType>/<docId>/<id>-<safe name>`. */
export function attachmentPath(entityId: string, docType: string, docId: string, id: string, name: string): string {
  assertSegment(entityId, "entity id");
  assertSegment(docType, "document type");
  assertSegment(docId, "document id");
  assertSegment(id, "attachment id");
  return `${entityId}/${docType}/${docId}/${id}-${safeFileName(name)}`;
}

/** A storage key we are willing to read or delete: relative, no `..`, no backslashes, no empty segments. */
export function isSafePath(key: string): boolean {
  if (!key || key.length > 1024) return false;
  if (key.startsWith("/") || key.includes("\\") || key.includes("\0")) return false;
  const parts = key.split("/");
  return parts.every((p) => p !== "" && p !== "." && p !== ".." && !p.includes(".."));
}

function assertSafePath(key: string) {
  if (!isSafePath(key)) throw new Error("Invalid file path");
}

function fmtMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

/** Validates a file before it is stored. Returns an error message for the user, or null when the file is acceptable. */
export function checkAttachment(file: { name: string; size: number; type?: string | null }): string | null {
  const name = baseName(file.name ?? "");
  if (!name) return "Choose a file to upload.";
  const ext = extensionOf(name);
  if (!ext || !ATTACHMENT_TYPES[ext]) return `${name}: this file type is not allowed. Upload a PDF, an image, an Excel or Word file, a CSV, a text file or an email (.eml/.msg).`;
  const type = (file.type ?? "").trim().toLowerCase().split(";")[0];
  if (!GENERIC_MIME.has(type) && !ALLOWED_MIME.has(type)) return `${name}: this file type (${type}) is not allowed.`;
  if (!Number.isFinite(file.size) || file.size <= 0) return `${name} is empty.`;
  if (file.size > ATTACHMENT_LIMIT) return `${name} is ${fmtMB(file.size)}; the limit is ${fmtMB(ATTACHMENT_LIMIT)} per file.`;
  return null;
}

// ---------- File backend ----------

function filesDir(): string {
  return path.join(process.env.ILA_DATA_DIR ?? "data", "files");
}

/** Absolute path on disk for a storage key, guaranteed to stay inside the files directory. */
function diskPath(key: string): string {
  assertSafePath(key);
  const root = path.resolve(filesDir());
  const full = path.resolve(root, key);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Invalid file path");
  return full;
}

// ---------- Public API ----------

export interface PutAttachmentInput {
  entityId: string;
  docType: string;
  docId: string;
  file: File;
  byUserId?: string;
  byName?: string;
}

/** Validates, stores and describes one uploaded file. Throws with a user-facing message when the file is refused. */
export async function putAttachment(input: PutAttachmentInput): Promise<Attachment> {
  const { file } = input;
  const error = checkAttachment({ name: file.name, size: file.size, type: file.type });
  if (error) throw new Error(error);
  const id = randomUUID();
  const key = attachmentPath(input.entityId, input.docType, input.docId, id, file.name);
  const type = mimeFor(file.name)!;
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) throw new Error(`${baseName(file.name)} is empty.`);
  if (buffer.length > ATTACHMENT_LIMIT) throw new Error(`${baseName(file.name)} is ${fmtMB(buffer.length)}; the limit is ${fmtMB(ATTACHMENT_LIMIT)} per file.`);

  const client = supabaseClient();
  if (client) {
    const { error: upErr } = await client.storage.from(ATTACHMENT_BUCKET).upload(key, buffer, { contentType: type, upsert: false });
    if (upErr) throw new Error(`Could not store ${baseName(file.name)}: ${upErr.message}`);
  } else {
    const full = diskPath(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer, { flag: "wx" });
  }

  return {
    id,
    name: baseName(file.name).slice(0, 200),
    size: buffer.length,
    type,
    path: key,
    uploadedAt: new Date().toISOString(),
    byUserId: input.byUserId,
    byName: input.byName,
  };
}

/** Display name recovered from a storage key (`<id>-<safe name>` → `<safe name>`). */
function nameFromKey(key: string): string {
  const last = key.slice(key.lastIndexOf("/") + 1);
  return last.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "") || last;
}

/** Reads a stored file. Returns null when it does not exist; throws on an unsafe key or a storage failure. */
export async function readAttachment(key: string): Promise<{ buffer: Buffer; type: string; name: string } | null> {
  assertSafePath(key);
  const name = nameFromKey(key);
  const type = mimeFor(name) ?? "application/octet-stream";
  const client = supabaseClient();
  if (client) {
    const { data, error } = await client.storage.from(ATTACHMENT_BUCKET).download(key);
    if (error) {
      const status = (error as { statusCode?: string | number; status?: number }).statusCode ?? (error as { status?: number }).status;
      if (String(status) === "404" || String(status) === "400" || /not.?found/i.test(error.message)) return null;
      throw new Error(`Could not read file: ${error.message}`);
    }
    if (!data) return null;
    return { buffer: Buffer.from(await data.arrayBuffer()), type, name };
  }
  try {
    return { buffer: await fs.readFile(diskPath(key)), type, name };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT" || (e as NodeJS.ErrnoException).code === "EISDIR") return null;
    throw e;
  }
}

/** Deletes a stored file; a missing file is not an error. */
export async function deleteAttachment(key: string): Promise<void> {
  assertSafePath(key);
  const client = supabaseClient();
  if (client) {
    const { error } = await client.storage.from(ATTACHMENT_BUCKET).remove([key]);
    if (error) throw new Error(`Could not delete file: ${error.message}`);
    return;
  }
  await fs.rm(diskPath(key), { force: true });
}

/** "12 KB", "1.4 MB" for the attachments list. */
export function fmtFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
