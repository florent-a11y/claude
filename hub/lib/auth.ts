import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { one, run } from "./db";
import { COOKIE_SECURE, SESSION_COOKIE, SESSION_DAYS } from "./config";
import { newToken, nowIso } from "./ids";
import type { PublicUser, User } from "./types";

export const PUBLIC_USER_COLUMNS = "id, name, email, role, title, client_id, color, active, created_at";

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

/** The signed-in user for the current request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = one<User>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`,
    token,
    nowIso(),
  );
  if (!row) return null;
  const { password_hash: _ph, ...user } = row;
  void _ph;
  return user;
});

export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Internal team only (admin or member). Clients are sent to their home. */
export async function requireInternal(): Promise<PublicUser> {
  const user = await requireUser();
  if (user.role === "client") redirect("/");
  return user;
}

export async function requireAdmin(): Promise<PublicUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export function isInternal(user: Pick<PublicUser, "role">): boolean {
  return user.role !== "client";
}

export async function createSession(userId: string): Promise<void> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  run("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", token, userId, expires.toISOString(), nowIso());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
    expires,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token = ?", token);
  store.delete(SESSION_COOKIE);
}

export function revokeUserSessions(userId: string): void {
  run("DELETE FROM sessions WHERE user_id = ?", userId);
}
