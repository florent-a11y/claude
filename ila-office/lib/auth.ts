import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { hashPassword, verifyPassword } from "./password";
export { hashPassword, verifyPassword };
import { db } from "./db";
import type { Role, User } from "./types";

/**
 * Authentication: email + password (scrypt) and an HMAC-signed session cookie.
 * The cookie carries `userId.expires.signature`; middleware.ts verifies the signature on the Edge,
 * server code re-reads the user record so deactivated users are locked out immediately.
 */

export const SESSION_COOKIE = "ila_session";
const SESSION_DAYS = 14;

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (≥ 16 characters) in production");
  return "dev-only-insecure-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string, days = SESSION_DAYS): string {
  const expires = Date.now() + days * 864e5;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token: string | undefined): { userId: string } | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [userId, expires] = payload.split(".");
  if (!userId || !expires || Number(expires) < Date.now()) return null;
  return { userId };
}

export async function setSessionCookie(userId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

/** Current user or null. Safe to call from server components, route handlers and server actions. */
export async function getUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const parsed = parseSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!parsed) return null;
  const user = await db.get("users", parsed.userId);
  if (!user || !user.active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Redirects to /login when not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

const ROLE_RANK: Record<Role, number> = { viewer: 0, consultant: 1, accountant: 1, admin: 2 };

/**
 * Coarse permissions. Consultants own the CRM, accountants own books/tax, admins everything; viewers read only.
 * Both consultant and accountant may read everything (a visa project needs the invoice, the accountant needs the client).
 */
export type Permission = "crm:write" | "books:write" | "tax:write" | "admin" | "read";
export function can(user: SessionUser | null, perm: Permission): boolean {
  if (!user) return false;
  if (perm === "read") return true;
  if (user.role === "admin") return true;
  if (perm === "admin") return false;
  if (perm === "crm:write") return user.role === "consultant";
  return user.role === "accountant"; // books:write, tax:write
}

export async function requirePermission(perm: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, perm)) throw new Error("Forbidden");
  return user;
}

/** Route-handler guard: returns the user or a 401/403 Response. */
export async function guard(perm: Permission = "read"): Promise<SessionUser | Response> {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, perm)) return new Response("Forbidden", { status: 403 });
  return user;
}

export async function authenticate(email: string, password: string): Promise<User | null> {
  const users = await db.list("users", { where: (u) => u.email.toLowerCase() === email.toLowerCase() });
  const user = users[0];
  if (!user || !user.active) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  await db.update("users", user.id, { lastLoginAt: new Date().toISOString() });
  return user;
}

export async function hasAnyUser(): Promise<boolean> {
  return (await db.list("users", { limit: 1 })).length > 0;
}

/** First-run: create the admin account. Refuses once any user exists. */
export async function createFirstAdmin(input: { email: string; name: string; password: string }): Promise<User> {
  if (await hasAnyUser()) throw new Error("Setup already completed");
  const user: User = {
    id: db.newId(), email: input.email.trim().toLowerCase(), name: input.name.trim(), role: "admin",
    passwordHash: hashPassword(input.password), active: true, createdAt: new Date().toISOString(),
  };
  await db.insert("users", user);
  return user;
}

/** Base-level ratelimit for the login form (per process). */
const attempts = new Map<string, { n: number; until: number }>();
export function loginAllowed(key: string): boolean {
  const a = attempts.get(key);
  if (!a) return true;
  if (Date.now() > a.until) { attempts.delete(key); return true; }
  return a.n < 8;
}
export function recordLoginFailure(key: string) {
  const a = attempts.get(key) ?? { n: 0, until: Date.now() + 15 * 60_000 };
  a.n += 1;
  attempts.set(key, a);
}
