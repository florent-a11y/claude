import "server-only";
import path from "node:path";

/**
 * Folder for orders, messages and uploaded proofs when the app runs on your own machine without a database.
 * A hosted site never uses local files: its functions do not share a disk and do not keep it between requests.
 * It needs a database, or, for a test site only, a connected Blob store (see lib/blob-store.ts).
 */
export function dataDir(): string {
  if (!process.env.VERCEL) return path.join(process.cwd(), "data");
  throw new Error("No storage configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or for a test site set DEMO_MODE=on and connect a Vercel Blob store to the project.");
}
