import "server-only";
import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Document storage for e-VOA (passport scan, photo). Supabase Storage bucket "documents" (private)
 * when configured, otherwise local ./data/uploads (dev only). Files are named by random id so the
 * id alone never reveals whose document it is.
 */
export const BUCKET = "documents";
export const MAX_BYTES = 8 * 1024 * 1024;
export const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function sb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

const ext: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export async function storeDocument(file: File): Promise<{ id: string }> {
  if (!ALLOWED.has(file.type)) throw new Error("Only JPG, PNG, WEBP or PDF files are accepted");
  if (file.size > MAX_BYTES) throw new Error("File larger than 8 MB");
  const id = `${randomUUID()}.${ext[file.type]}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const client = sb();
  if (client) {
    const { error } = await client.storage.from(BUCKET).upload(id, bytes, { contentType: file.type, upsert: false });
    if (error) throw new Error(`upload: ${error.message}`);
    return { id };
  }
  const dir = path.join(process.cwd(), "data", "uploads");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, id), bytes);
  return { id };
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
