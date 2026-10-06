import { randomBytes } from "node:crypto";

/** Short, URL-safe, unguessable id (12 chars). */
export function newId(): string {
  return randomBytes(9).toString("base64url");
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export function nowIso(): string {
  return new Date().toISOString();
}
