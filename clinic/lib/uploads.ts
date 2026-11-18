import "server-only";
import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir } from "./data-dir";

/**
 * Bank-transfer proofs. Private Supabase Storage bucket "clinic-proofs" when configured, otherwise a local folder
 * (development or a test site: see lib/data-dir.ts). Files are named by a random id; the browser-supplied name and MIME type are never used:
 * the type comes from the file's magic bytes.
 */
export const BUCKET = "clinic-proofs";
export const MAX_BYTES = 8 * 1024 * 1024;
export type ProofType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export class UploadError extends Error {
  constructor(message: string, public readonly status: 413 | 422) { super(message); }
}

function sb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

const ext: Record<ProofType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export function sniffType(bytes: Uint8Array): ProofType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (Buffer.from(bytes.subarray(0, 1024)).indexOf("%PDF-") >= 0) return "application/pdf";
  return null;
}

export async function storeProof(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new UploadError("too_large", 413);
  if (file.size === 0) throw new UploadError("bad_file", 422);
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = sniffType(bytes);
  if (!contentType) throw new UploadError("bad_file", 422);
  const id = `${randomUUID()}.${ext[contentType]}`;
  const client = sb();
  if (client) {
    const { error } = await client.storage.from(BUCKET).upload(id, bytes, { contentType, upsert: false });
    if (error) throw new Error(`upload: ${error.message}`);
    return id;
  }
  const dir = path.join(dataDir(), "uploads");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, id), bytes);
  return id;
}

/** A short-lived URL (Supabase) or the raw bytes (local development) for the ops console. */
export async function readProof(id: string): Promise<{ url?: string; bytes?: Buffer; contentType: string }> {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(id)) throw new Error("Bad file id");
  const contentType = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" }[id.split(".").pop()!]!;
  const client = sb();
  if (client) {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(id, 300);
    if (error || !data) throw new Error(`signed url: ${error?.message}`);
    return { url: data.signedUrl, contentType };
  }
  return { bytes: await fs.readFile(path.join(dataDir(), "uploads", id)), contentType };
}
