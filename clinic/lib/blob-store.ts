import "server-only";
import { get, list, put } from "@vercel/blob";
import { demoMode } from "./config";

/**
 * Storage for the hosted test site: a PRIVATE Vercel Blob store (nothing in it has a public address; every read
 * needs the store's token). Used only when DEMO_MODE=on, the project has a Blob store connected and no database
 * is set. One small JSON file per order or message, and the uploaded transfer proofs.
 *
 * Why not temporary files: on Vercel, pages and API routes run as separate functions that do not share a disk,
 * so an order saved by one would be invisible to the other.
 */
export function blobStoreEnabled(): boolean {
  return demoMode() && Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/** Reads skip the CDN cache so a change (doctor's approval, payment) is visible on the very next request. */
export async function blobReadBytes(pathname: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  try {
    const res = await get(pathname, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) return null;
    return { bytes: Buffer.from(await new Response(res.stream).arrayBuffer()), contentType: res.blob.contentType };
  } catch (e) {
    if (e instanceof Error && e.name === "BlobNotFoundError") return null;
    throw e;
  }
}

export async function blobReadJson<T>(pathname: string): Promise<T | null> {
  const file = await blobReadBytes(pathname);
  return file ? (JSON.parse(file.bytes.toString("utf8")) as T) : null;
}

export async function blobWriteJson(pathname: string, value: unknown): Promise<void> {
  await put(pathname, JSON.stringify(value), { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 });
}

export async function blobWriteBytes(pathname: string, bytes: Buffer, contentType: string): Promise<void> {
  await put(pathname, bytes, { access: "private", allowOverwrite: false, addRandomSuffix: false, contentType, cacheControlMaxAge: 60 });
}

/** Every JSON file under a folder, most recently written first (a test site holds a handful, so no paging). */
export async function blobListJson<T>(prefix: string, limit: number): Promise<T[]> {
  const { blobs } = await list({ prefix, limit: 1000 });
  const newest = [...blobs].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()).slice(0, limit);
  const items = await Promise.all(newest.map((b) => blobReadJson<T>(b.pathname)));
  return items.filter((x): x is Awaited<T> => x !== null) as T[];
}
