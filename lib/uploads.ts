import "server-only";
import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Document storage for e-VOA (passport scan, photo). Supabase Storage bucket "documents" (private)
 * when configured, otherwise local ./data/uploads (dev only). Files are named by random id so the
 * id alone never reveals whose document it is. The browser-supplied name and MIME type are never used:
 * the type comes from the file's magic bytes and the name from the random id.
 */
export const BUCKET = "documents";
export const MAX_BYTES = 8 * 1024 * 1024;
export type DocumentType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
export const ALLOWED = new Set<string>(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/** Thrown by storeDocument; `status` is the HTTP status the route should answer with (413 too large, 422 not a valid file). */
export class UploadError extends Error {
  constructor(message: string, public readonly status: 413 | 422) { super(message); }
}

function sb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

const ext: Record<DocumentType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** Content type from magic bytes; null when the bytes are not a JPEG, PNG, WEBP or PDF. */
export function sniffType(bytes: Uint8Array): DocumentType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  // The PDF header must appear in the first 1024 bytes (ISO 32000-1 allows leading junk).
  if (Buffer.from(bytes.subarray(0, 1024)).indexOf("%PDF-") >= 0) return "application/pdf";
  return null;
}

export async function storeDocument(file: File): Promise<{ id: string; contentType: DocumentType }> {
  if (file.size > MAX_BYTES) throw new UploadError("File larger than 8 MB", 413);
  if (file.size === 0) throw new UploadError("Empty file", 422);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new UploadError("File larger than 8 MB", 413);
  const contentType = sniffType(bytes);
  if (!contentType) throw new UploadError("Only JPG, PNG, WEBP or PDF files are accepted", 422);
  const id = `${randomUUID()}.${ext[contentType]}`;
  const client = sb();
  if (client) {
    const { error } = await client.storage.from(BUCKET).upload(id, bytes, { contentType, upsert: false });
    if (error) throw new Error(`upload: ${error.message}`);
    return { id, contentType };
  }
  const dir = path.join(process.cwd(), "data", "uploads");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, id), bytes);
  return { id, contentType };
}

/** Returns a short-lived URL (Supabase) or the raw bytes (local dev) for the ops console. */
export async function readDocument(id: string): Promise<{ url?: string; bytes?: Buffer; contentType: string }> {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(id)) throw new Error("Bad document id");
  const type = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" }[id.split(".").pop()!]!;
  const client = sb();
  if (client) {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(id, 300);
    if (error || !data) throw new Error(`signed url: ${error?.message}`);
    return { url: data.signedUrl, contentType: type };
  }
  const bytes = await fs.readFile(path.join(process.cwd(), "data", "uploads", id));
  return { bytes, contentType: type };
}
