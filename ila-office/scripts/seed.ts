/**
 * Seeds a development database: first admin, ILA's own entity with its chart of accounts, the service catalogue,
 * ILA's vendor list, and a fictional demo client (company, contact, client entity with its own books).
 * Idempotent: skips anything that already exists. Run with `npm run seed`.
 */
import { existsSync } from "node:fs";
// `next dev` reads .env.local by itself; this script runs under plain Node, so load it here too.
for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
import { db } from "../lib/db";
import { hashPassword } from "../lib/password";
import { seedBase, seedDemoClient } from "../lib/seed";
import type { User } from "../lib/types";

async function main() {
  const now = new Date().toISOString();

  // 1. Admin user
  const users = await db.list("users");
  let admin = users.find((u) => u.role === "admin");
  if (!admin) {
    const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@ila.local").toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD ?? "change-me-now-please";
    admin = { id: db.newId(), email, name: process.env.SEED_ADMIN_NAME ?? "ILA Admin", role: "admin", passwordHash: hashPassword(password), active: true, createdAt: now } satisfies User;
    await db.insert("users", admin);
    console.log(`admin user: ${email} / ${password}`);
  }

  // 2. ILA's own entity, chart of accounts, price list, vendors; 3. a fictional demo client.
  for (const what of await seedBase()) console.log(`created ${what}`);
  if (await seedDemoClient()) console.log("created demo client with its own books");

  console.log("seed complete");
}

main().catch((e) => { console.error(e); process.exit(1); });
