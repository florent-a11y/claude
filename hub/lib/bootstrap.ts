import { db, one, run } from "./db";
import { hashPassword } from "./auth";
import { newId, nowIso } from "./ids";
import { pickColor } from "./format";

/**
 * Runs once when the server starts: makes sure the database exists and, if there are no users
 * yet and SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are set, creates the first administrator.
 * Without those variables the app shows the /setup page instead.
 */
export async function bootstrap(): Promise<void> {
  db();
  const users = one<{ n: number }>("SELECT COUNT(*) AS n FROM users")!.n;
  if (users > 0) return;
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    console.log("[hub] No users yet. Open the app and complete the Set up page to create the first administrator.");
    return;
  }
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Administrator";
  run(
    "INSERT INTO users (id, name, email, password_hash, role, title, client_id, color, active, created_at) VALUES (?, ?, ?, ?, 'admin', '', NULL, ?, 1, ?)",
    newId(), name, email, await hashPassword(password), pickColor(email), nowIso(),
  );
  console.log(`[hub] Created the first administrator ${email} from SEED_ADMIN_* environment variables.`);
}
