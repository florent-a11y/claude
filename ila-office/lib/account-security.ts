/**
 * Sign-in security on the store side: the password check with a lock after repeated failures, the second step
 * (authenticator code or recovery code), setting it up and removing it, and a user's own password change.
 * The codes and the sealing of the secret are in lib/two-factor.ts; cookies and sessions are in lib/auth.ts.
 *
 * - Lock: five wrong passwords or codes in a row lock the account for fifteen minutes. The count lives on the user
 *   record, so it holds across the hosting's many short-lived processes (the in-memory limit of lib/auth.ts does not).
 *   An unknown email costs the same time as a wrong password and writes nothing.
 * - Second step: off until a user turns it on, unless the policy asks for it (`TwoFactorPolicy`). A user who must have
 *   it and does not is signed in only as far as the setup page (the session carries a "setup" mark, lib/auth.ts).
 * - Nothing here ever returns a stored secret or hash; a new secret and new recovery codes are returned once, to be
 *   shown to their owner.
 */
import { db } from "./db";
import { hashPassword, verifyPassword } from "./password";
import {
  hashRecoveryCode, looksLikeRecoveryCode, matchRecoveryCode, newRecoveryCodes, newTotpSecret, openSecret, otpauthUri, sealSecret, verifyTotp,
} from "./two-factor";
import type { Role, User } from "./types";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const TWO_FACTOR_ISSUER = "ILA Office";
export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 200;
/** A setup left unconfirmed for longer than this starts again with a new secret. */
const SETUP_MINUTES = 30;

export class SecurityError extends Error {}

// ---------- Policy ----------

export const TWO_FACTOR_POLICIES = ["optional", "team", "everyone"] as const;
export type TwoFactorPolicy = (typeof TWO_FACTOR_POLICIES)[number];
export const TWO_FACTOR_POLICY_LABELS: Record<TwoFactorPolicy, string> = {
  optional: "Optional: each user decides",
  team: "Required for the team (clients decide)",
  everyone: "Required for everyone, client logins included",
};
const POLICY_KEY = "security:two_factor_policy";

export async function getTwoFactorPolicy(): Promise<TwoFactorPolicy> {
  const v = (await db.get("settings", POLICY_KEY))?.value;
  return TWO_FACTOR_POLICIES.includes(v as TwoFactorPolicy) ? (v as TwoFactorPolicy) : "optional";
}

export async function setTwoFactorPolicy(policy: TwoFactorPolicy): Promise<void> {
  if (!TWO_FACTOR_POLICIES.includes(policy)) throw new SecurityError("Unknown policy.");
  await db.upsert("settings", { id: POLICY_KEY, value: policy, updatedAt: new Date().toISOString() });
}

export function twoFactorRequiredFor(policy: TwoFactorPolicy, role: Role): boolean {
  return policy === "everyone" || (policy === "team" && role !== "client");
}

// ---------- State of an account ----------

export function hasTwoFactor(user: Pick<User, "twoFactor">): boolean {
  return Boolean(user.twoFactor?.enabledAt && user.twoFactor.secret);
}

/** The moment the lock ends, while the account is locked. */
export function lockedUntilOf(user: Pick<User, "lockedUntil">, now: number = Date.now()): string | undefined {
  return user.lockedUntil && Date.parse(user.lockedUntil) > now ? user.lockedUntil : undefined;
}

/** "about 12 minutes" until a lock ends. */
export function lockWait(until: string, now: number = Date.now()): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(until) - now) / 60_000));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

async function findByEmail(email: string): Promise<User | undefined> {
  const wanted = email.trim().toLowerCase();
  return (await db.list("users", { where: (u) => u.email.toLowerCase() === wanted }))[0];
}

/** One more failure; the fifth locks the account and starts the count again. Returns the end of the lock when it locks. */
async function registerFailure(user: User, now: number): Promise<string | undefined> {
  const failed = (user.failedLogins ?? 0) + 1;
  if (failed >= MAX_FAILED_LOGINS) {
    const until = new Date(now + LOCK_MINUTES * 60_000).toISOString();
    await db.update("users", user.id, { failedLogins: 0, lockedUntil: until });
    return until;
  }
  await db.update("users", user.id, { failedLogins: failed });
  return undefined;
}

/** What a success writes to wipe earlier failures: nothing when there were none, so a normal sign-in leaves no trace in the audit trail. */
function clearedFailures(user: Pick<User, "failedLogins" | "lockedUntil">): Partial<User> {
  return { ...((user.failedLogins ?? 0) > 0 ? { failedLogins: 0 } : {}), ...(user.lockedUntil ? { lockedUntil: undefined } : {}) };
}

// ---------- Sign-in ----------

/** A real scrypt hash of a random password nobody knows: verifying against it makes an unknown email take as long as a wrong password. */
let decoy: string | undefined;

export type PasswordResult =
  | { ok: true; user: User; twoFactor: boolean }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; until: string };

/** First step: email and password. On success the failure count is cleared; the sign-in is complete only when there is no second step. */
export async function checkPassword(email: string, password: string, now: number = Date.now()): Promise<PasswordResult> {
  const user = await findByEmail(email);
  if (!user || !user.active) {
    decoy ??= hashPassword(`decoy-${Math.random()}-${Date.now()}`);
    verifyPassword(password, decoy);
    return { ok: false, reason: "invalid" };
  }
  const locked = lockedUntilOf(user, now);
  if (locked) return { ok: false, reason: "locked", until: locked };
  if (!verifyPassword(password, user.passwordHash)) {
    const until = await registerFailure(user, now);
    return until ? { ok: false, reason: "locked", until } : { ok: false, reason: "invalid" };
  }
  const twoFactor = hasTwoFactor(user);
  const patch: Partial<User> = { ...clearedFailures(user), ...(twoFactor ? {} : { lastLoginAt: new Date(now).toISOString() }) };
  if (Object.keys(patch).length > 0) await db.update("users", user.id, patch);
  return { ok: true, user, twoFactor };
}

export type SecondStepResult =
  | { ok: true; user: User; recoveryUsed: boolean; recoveryLeft: number }
  | { ok: false; reason: "invalid" | "unavailable" }
  | { ok: false; reason: "locked"; until: string };

/**
 * Second step: a 6-digit authenticator code, or a recovery code (used up by this). "unavailable" means the account
 * has no second step, or is gone: the caller sends the person back to the sign-in page.
 */
export async function checkSecondStep(userId: string, input: string, now: number = Date.now()): Promise<SecondStepResult> {
  const user = await db.get("users", userId);
  if (!user || !user.active || !hasTwoFactor(user)) return { ok: false, reason: "unavailable" };
  const locked = lockedUntilOf(user, now);
  if (locked) return { ok: false, reason: "locked", until: locked };
  const tf = user.twoFactor!;
  let next: User["twoFactor"] | undefined;
  let recoveryUsed = false;
  if (looksLikeRecoveryCode(input)) {
    const i = matchRecoveryCode(input, tf.recoveryHashes);
    if (i >= 0) { next = { ...tf, recoveryHashes: tf.recoveryHashes.filter((_, j) => j !== i) }; recoveryUsed = true; }
  } else {
    // A secret sealed under a key that has since changed cannot be opened: only a recovery code or an admin reset helps then.
    const secret = openSecret(tf.secret);
    const step = secret ? verifyTotp(secret, input, { now, lastStep: tf.tokenStep }) : null;
    if (step !== null) next = { ...tf, tokenStep: step };
  }
  if (!next) {
    const until = await registerFailure(user, now);
    return until ? { ok: false, reason: "locked", until } : { ok: false, reason: "invalid" };
  }
  const updated = (await db.update("users", user.id, { twoFactor: next, ...clearedFailures(user), lastLoginAt: new Date(now).toISOString() }))!;
  return { ok: true, user: updated, recoveryUsed, recoveryLeft: next.recoveryHashes.length };
}

// ---------- Setting the second step up ----------

async function requireUserRow(userId: string): Promise<User> {
  const user = await db.get("users", userId);
  if (!user || !user.active) throw new SecurityError("User not found.");
  return user;
}

export interface TwoFactorSetup { secret: string; uri: string }

const describeSetup = (user: Pick<User, "email">, secret: string): TwoFactorSetup => ({ secret, uri: otpauthUri({ issuer: TWO_FACTOR_ISSUER, account: user.email, secret }) });

/** The setup in progress, if one was started recently and its secret can still be opened. */
export function pendingTwoFactorSetup(user: Pick<User, "email" | "twoFactorSetup">, now: number = Date.now()): TwoFactorSetup | null {
  const setup = user.twoFactorSetup;
  if (!setup || now - Date.parse(setup.startedAt) > SETUP_MINUTES * 60_000) return null;
  const secret = openSecret(setup.secret);
  return secret ? describeSetup(user, secret) : null;
}

/** Starts (or carries on) a setup: the secret to put in the authenticator app. Nothing is on until a first code confirms it. */
export async function startTwoFactorSetup(userId: string, now: number = Date.now()): Promise<TwoFactorSetup> {
  const user = await requireUserRow(userId);
  if (hasTwoFactor(user)) throw new SecurityError("Two-step sign-in is already on for this account.");
  const pending = pendingTwoFactorSetup(user, now);
  if (pending) return pending;
  const secret = newTotpSecret();
  await db.update("users", userId, { twoFactorSetup: { secret: sealSecret(secret), startedAt: new Date(now).toISOString() } });
  return describeSetup(user, secret);
}

export async function cancelTwoFactorSetup(userId: string): Promise<void> {
  const user = await requireUserRow(userId);
  if (user.twoFactorSetup) await db.update("users", userId, { twoFactorSetup: undefined });
}

/** Confirms the setup with a first code from the app and turns the second step on. Returns the recovery codes, once. */
export async function confirmTwoFactorSetup(userId: string, code: string, now: number = Date.now()): Promise<{ recoveryCodes: string[] }> {
  const user = await requireUserRow(userId);
  if (hasTwoFactor(user)) throw new SecurityError("Two-step sign-in is already on for this account.");
  const pending = pendingTwoFactorSetup(user, now);
  if (!pending) throw new SecurityError("This setup has expired. Start again to get a new QR code.");
  const step = verifyTotp(pending.secret, code, { now });
  if (step === null) throw new SecurityError("That code is not right. Check the app shows ILA Office and type the 6 digits it shows now.");
  const recoveryCodes = newRecoveryCodes();
  await db.update("users", userId, {
    twoFactor: { secret: sealSecret(pending.secret), recoveryHashes: recoveryCodes.map(hashRecoveryCode), enabledAt: new Date(now).toISOString(), tokenStep: step },
    twoFactorSetup: undefined,
  });
  return { recoveryCodes };
}

function requirePassword(user: User, password: string) {
  if (!verifyPassword(password, user.passwordHash)) throw new SecurityError("The password is not right.");
}

/** Turns the second step off; the account's own password is asked again. */
export async function disableTwoFactor(userId: string, password: string): Promise<void> {
  const user = await requireUserRow(userId);
  requirePassword(user, password);
  await db.update("users", userId, { twoFactor: undefined, twoFactorSetup: undefined });
}

/** New recovery codes; the old ones stop working. Returns them once. */
export async function regenerateRecoveryCodes(userId: string, password: string): Promise<{ recoveryCodes: string[] }> {
  const user = await requireUserRow(userId);
  requirePassword(user, password);
  if (!hasTwoFactor(user)) throw new SecurityError("Two-step sign-in is not on for this account.");
  const recoveryCodes = newRecoveryCodes();
  await db.update("users", userId, { twoFactor: { ...user.twoFactor!, recoveryHashes: recoveryCodes.map(hashRecoveryCode) } });
  return { recoveryCodes };
}

// ---------- Password ----------

export function checkNewPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `The new password needs at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `The new password is too long (at most ${MAX_PASSWORD} characters).`;
  return null;
}

/** A user changes their own password: the current one is asked, and the new one must differ. */
export async function changeOwnPassword(userId: string, current: string, next: string): Promise<void> {
  const user = await requireUserRow(userId);
  if (!verifyPassword(current, user.passwordHash)) throw new SecurityError("The current password is not right.");
  const refused = checkNewPassword(next);
  if (refused) throw new SecurityError(refused);
  if (verifyPassword(next, user.passwordHash)) throw new SecurityError("The new password is the same as the current one.");
  await db.update("users", userId, { passwordHash: hashPassword(next), passwordChangedAt: new Date().toISOString(), failedLogins: 0, lockedUntil: undefined });
}

// ---------- Administrator ----------

/** An administrator removes a user's second step (lost phone): the user signs in with the password and sets it up again. */
export async function adminResetTwoFactor(userId: string): Promise<void> {
  const user = await db.get("users", userId);
  if (!user) throw new SecurityError("User not found.");
  await db.update("users", userId, { twoFactor: undefined, twoFactorSetup: undefined, failedLogins: 0, lockedUntil: undefined });
}

export async function adminUnlock(userId: string): Promise<void> {
  const user = await db.get("users", userId);
  if (!user) throw new SecurityError("User not found.");
  await db.update("users", userId, { failedLogins: 0, lockedUntil: undefined });
}
