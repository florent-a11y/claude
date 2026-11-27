import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { hashPassword, verifyPassword } from "./password";
export { hashPassword, verifyPassword };
import { db } from "./db";
import { setAuditActorResolver, type AuditActor } from "./audit";
import type { User } from "./types";
import { can as canDo, canAccessEntity, isClient, type Permission } from "./access";
export { allowedEntityIds, canAccessEntity, isClient, scopeByEntity, scopeEntities, type Permission } from "./access";

/**
 * Authentication: email + password (scrypt), an optional second step (lib/account-security.ts) and an HMAC-signed
 * session cookie. The cookie carries `userId.expires.signature`; middleware.ts verifies the signature on the Edge,
 * server code re-reads the user record so deactivated users are locked out immediately.
 *
 * Two variations of the token:
 * - `userId.expires.setup.signature`: signed in, but the policy requires two-step sign-in and this account has none
 *   yet. middleware.ts lets such a session reach only the account security page until the setup is done.
 * - The "pending" cookie between the password and the second step: same shape, signed over a different text, so it
 *   can never be presented as a session.
 */

export const SESSION_COOKIE = "ila_session";
export const PENDING_COOKIE = "ila_2fa";
const SESSION_DAYS = 14;
const PENDING_MINUTES = 5;
/** Where a session marked "setup" is sent, and the only page it may use. */
export const SECURITY_PATH = "/account/security";

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (≥ 16 characters) in production");
  return "dev-only-insecure-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string, days = SESSION_DAYS, opts: { setupRequired?: boolean } = {}): string {
  const expires = Date.now() + days * 864e5;
  const payload = `${userId}.${expires}${opts.setupRequired ? ".setup" : ""}`;
  return `${payload}.${sign(payload)}`;
}

/** Splits `payload.signature` and checks the signature against `signed(payload)`; the payload when it holds and has not expired. */
function readToken(token: string | undefined, signed: (payload: string) => string): { userId: string; flag?: string } | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = signed(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [userId, expires, flag] = payload.split(".");
  if (!userId || !expires || !(Number(expires) > Date.now())) return null;
  return { userId, flag };
}

export function parseSessionToken(token: string | undefined): { userId: string; setupRequired: boolean } | null {
  const t = readToken(token, sign);
  return t ? { userId: t.userId, setupRequired: t.flag === "setup" } : null;
}

const cookieOptions = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge });

/** Signs the user in. `setupRequired`: only as far as the account security page, until two-step sign-in is set up. */
export async function setSessionCookie(userId: string, opts: { setupRequired?: boolean } = {}) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(userId, SESSION_DAYS, opts), cookieOptions(SESSION_DAYS * 86400));
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** Whether the current session is held at the setup of two-step sign-in. */
export async function sessionSetupRequired(): Promise<boolean> {
  return parseSessionToken((await cookies()).get(SESSION_COOKIE)?.value)?.setupRequired ?? false;
}

// ---------- Between the password and the second step ----------

const signPending = (payload: string) => sign(`two-step-pending:${payload}`);

export function createPendingToken(userId: string, minutes = PENDING_MINUTES): string {
  const payload = `${userId}.${Date.now() + minutes * 60_000}`;
  return `${payload}.${signPending(payload)}`;
}

export function parsePendingToken(token: string | undefined): { userId: string } | null {
  const t = readToken(token, signPending);
  return t ? { userId: t.userId } : null;
}

/** The password was right and the account has a second step: remembered for five minutes, for the code page only. */
export async function setPendingCookie(userId: string) {
  (await cookies()).set(PENDING_COOKIE, createPendingToken(userId), cookieOptions(PENDING_MINUTES * 60));
}

export async function clearPendingCookie() {
  (await cookies()).set(PENDING_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** The user who passed the password step and now owes a code, or null. */
export async function pendingUserId(): Promise<string | null> {
  return parsePendingToken((await cookies()).get(PENDING_COOKIE)?.value)?.userId ?? null;
}

export type SessionUser = Pick<User, "id" | "email" | "name" | "role" | "entityIds">;

/** Current user or null. Safe to call from server components, route handlers and server actions. */
export async function getUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const parsed = parseSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!parsed) return null;
  const user = await db.get("users", parsed.userId);
  if (!user || !user.active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role, entityIds: user.role === "client" ? user.entityIds ?? [] : undefined };
}

/**
 * Audit trail (lib/audit.ts): every write made during a request is attributed to its signed-in user. Outside a
 * request (seed, scripts, cron) and before sign-in there is none, and the log says "System". The actor is remembered
 * for a minute per user so that a burst of writes costs one lookup.
 */
const auditActors = new Map<string, { actor: AuditActor; until: number }>();
setAuditActorResolver(async () => {
  try {
    const parsed = parseSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
    if (!parsed) return null;
    const known = auditActors.get(parsed.userId);
    if (known && known.until > Date.now()) return known.actor;
    const user = await getUser();
    if (!user) return null;
    const actor = { id: user.id, name: user.name, email: user.email };
    auditActors.set(user.id, { actor, until: Date.now() + 60_000 });
    return actor;
  } catch {
    return null;
  }
});

/** Redirects to /login when not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Coarse permissions (rules in lib/access.ts). Consultants own the CRM, accountants own books/tax, admins everything;
 * viewers read only. Every team role reads everything (a visa project needs the invoice, the accountant needs the client).
 * Client users read only the entities allocated to them.
 */
export function can(user: SessionUser | null, perm: Permission): boolean {
  return canDo(user, perm);
}

/** Pages reserved for ILA's team (every role except client). Clients get a 404. */
export async function requireTeam(): Promise<SessionUser> {
  const user = await requireUser();
  if (isClient(user)) notFound();
  return user;
}

/** Entity-scoped pages and actions: signed in and allowed to see this entity, else 404. */
export async function requireEntityAccess(entityId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAccessEntity(user, entityId)) notFound();
  return user;
}

export async function requirePermission(perm: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, perm)) {
    if (isClient(user)) notFound(); // a client never sees team pages or actions
    throw new Error("Forbidden");
  }
  return user;
}

/** Route-handler guard: returns the user or a 401/403 Response; with `entityId`, also checks the entity allocation. */
export async function guard(perm: Permission = "read", entityId?: string): Promise<SessionUser | Response> {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, perm)) return new Response("Forbidden", { status: 403 });
  if (entityId !== undefined && !canAccessEntity(user, entityId)) return new Response("Forbidden", { status: 403 });
  return user;
}

/** Only safe, in-app paths are followed after sign-in. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
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

/**
 * First, cheap limit for the sign-in forms, per process and per address: it stops a burst from one place. The lock
 * that holds across processes is on the user record (lib/account-security.ts).
 */
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
