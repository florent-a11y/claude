/**
 * Loads .env.local then .env into process.env (variables already set in the shell win).
 * Import this FIRST in a script, before any module that reads process.env at import time.
 */
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file absent */
  }
}
