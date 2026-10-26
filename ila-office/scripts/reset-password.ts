/**
 * Resets a user's password from the command line (local installs, or anywhere with the data backend configured):
 *   npm run reset-password -- florent@ilaglobalconsulting.com "my new password"
 * Creates the user as an admin if the email does not exist yet, so a lost login never locks you out.
 */
import { existsSync } from "node:fs";
for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
import { db } from "../lib/db";
import { hashPassword } from "../lib/password";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) { console.error('Usage: npm run reset-password -- <email> "<new password>"'); process.exit(1); }
  if (password.length < 10) { console.error("The password must be at least 10 characters."); process.exit(1); }
  const users = await db.list("users", { where: (u) => u.email.toLowerCase() === email.toLowerCase() });
  const now = new Date().toISOString();
  if (users[0]) {
    await db.update("users", users[0].id, { passwordHash: hashPassword(password), active: true });
    console.log(`Password reset for ${users[0].email} (${users[0].role}). You can sign in now.`);
  } else {
    await db.insert("users", { id: db.newId(), email: email.toLowerCase(), name: email.split("@")[0], role: "admin", passwordHash: hashPassword(password), active: true, createdAt: now });
    console.log(`No user had that email, so an admin account was created for ${email.toLowerCase()}. You can sign in now.`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
