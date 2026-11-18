import "server-only";
import os from "node:os";
import path from "node:path";
import { demoMode } from "./config";

/**
 * Where orders, messages and uploaded proofs are kept when no database is connected.
 *  - On your own machine: ./data, next to the app.
 *  - On a hosted test site (DEMO_MODE=on): the server's temporary folder. It is emptied whenever the host restarts
 *    the server, so test orders disappear after a while. Good enough to click through the flow, nothing more.
 *  - On a hosted live site: nowhere. It throws, so a missing database is noticed at once instead of losing orders.
 */
export function dataDir(): string {
  if (!process.env.VERCEL) return path.join(process.cwd(), "data");
  if (demoMode()) return path.join(os.tmpdir(), "clinic-data");
  throw new Error("No database configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or DEMO_MODE=on for a test site).");
}
