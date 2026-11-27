import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  RECOVERY_CODE_COUNT, base32Decode, base32Encode, cleanTotpInput, groupSecret, hashRecoveryCode, looksLikeRecoveryCode, matchRecoveryCode, newRecoveryCodes, newTotpSecret,
  normalizeRecoveryCode, openSecret, otpauthUri, sealSecret, sealedUnderCurrentKey, totpCode, totpStep, verifyTotp,
} from "../lib/two-factor";
import type { User } from "../lib/types";

/**
 * Two-step sign-in and the account lock: the codes (lib/two-factor.ts, against the test vectors of RFC 6238), the
 * store side (lib/account-security.ts) on the file backend, and the session tokens of lib/auth.ts. Invented accounts
 * only. lib/db.ts reads ILA_DATA_DIR when it is first loaded, so the temp directory is set before the store modules
 * are imported (dynamically, below: static imports are hoisted above these lines), and the Supabase variables are
 * removed so a developer's environment can never be written to.
 */

const DIR = mkdtempSync(path.join(os.tmpdir(), "ila-account-security-"));
process.env.ILA_DATA_DIR = DIR;
process.env.SESSION_SECRET = "test-session-secret-for-two-step-sign-in";
delete process.env.TWO_FACTOR_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------- Codes ----------

/** The secret of RFC 6238's test vectors: the ASCII text "12345678901234567890". */
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

test("base32: what authenticator apps expect, and what a person types", () => {
  assert.equal(RFC_SECRET, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI");
  assert.equal(base32Decode("MZXW6YTBOI").toString(), "foobar");
  assert.equal(base32Decode("mzxw 6ytb-oi======").toString(), "foobar", "case, spaces, dashes and padding are ignored");
  assert.throws(() => base32Decode("MZXW1"), /base32/);
  for (let i = 0; i < 20; i++) { const s = newTotpSecret(); assert.match(s, /^[A-Z2-7]{32}$/); assert.equal(base32Encode(base32Decode(s)), s); }
  assert.equal(groupSecret("ABCDEFGHIJKL"), "ABCD EFGH IJKL");
});

test("codes: the test vectors of RFC 6238 (SHA-1)", () => {
  const at = (seconds: number, digits = 6) => totpCode(RFC_SECRET, Math.floor(seconds / 30), digits);
  assert.equal(at(59, 8), "94287082");
  assert.equal(at(1111111109, 8), "07081804");
  assert.equal(at(1111111111, 8), "14050471");
  assert.equal(at(1234567890, 8), "89005924");
  assert.equal(at(2000000000, 8), "69279037");
  assert.equal(at(20000000000, 8), "65353130");
  assert.equal(at(59), "287082");
  assert.equal(at(1234567890), "005924", "leading zeros are kept");
  assert.equal(totpStep(59_000), 1);
});

test("codes: accepted for the current step and its neighbours, and never twice", () => {
  const now = 1_800_000_015_000, step = totpStep(now);
  const code = totpCode(RFC_SECRET, step);
  assert.equal(verifyTotp(RFC_SECRET, code, { now }), step);
  assert.equal(verifyTotp(RFC_SECRET, ` ${code.slice(0, 3)} ${code.slice(3)} `, { now }), step, "typed with a space");
  assert.equal(cleanTotpInput("123 456"), "123456");
  assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), { now }), step - 1, "the phone's clock is a little behind");
  assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), { now }), step + 1, "or ahead");
  assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), { now }), null, "an old code");
  assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), { now }), null);
  assert.equal(verifyTotp(RFC_SECRET, code, { now, lastStep: step }), null, "a code that was already used");
  assert.equal(verifyTotp(RFC_SECRET, code, { now, lastStep: step - 1 }), step);
  assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), { now, lastStep: step }), null, "nor an earlier one after a later one");
  for (const bad of ["", "12345", "1234567", "abcdef", "12345a", "١٢٣٤٥٦"]) assert.equal(verifyTotp(RFC_SECRET, bad, { now }), null, `"${bad}"`);
  const other = newTotpSecret();
  assert.equal(verifyTotp(other, code, { now }) === null || totpCode(other, step) === code, true, "another secret gives another code");
});

test("the address for the authenticator app", () => {
  const uri = otpauthUri({ issuer: "ILA Office", account: "made.contoh@example.com", secret: RFC_SECRET });
  assert.equal(uri, `otpauth://totp/ILA%20Office:made.contoh%40example.com?secret=${RFC_SECRET}&issuer=ILA%20Office&algorithm=SHA1&digits=6&period=30`);
});

test("the secret is sealed at rest: opened only with the same key, never when altered", () => {
  const sealed = sealSecret(RFC_SECRET, "key material number one");
  assert.match(sealed, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.ok(!sealed.includes(RFC_SECRET));
  assert.notEqual(sealSecret(RFC_SECRET, "key material number one"), sealed, "a fresh nonce each time");
  assert.equal(openSecret(sealed, "key material number one"), RFC_SECRET);
  assert.equal(openSecret(sealed, "key material number two"), null);
  const parts = sealed.split(".");
  const flipped = [...parts.slice(0, 3), (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1)].join(".");
  assert.equal(openSecret(flipped, "key material number one"), null, "tampered");
  for (const junk of ["", "v1", "v2.a.b.c", "not sealed at all"]) assert.equal(openSecret(junk, "key material number one"), null);
  assert.equal(openSecret(sealSecret(RFC_SECRET)), RFC_SECRET, "with the installation's own key");
});

test("recovery codes: random, typed loosely, matched by hash", () => {
  const codes = newRecoveryCodes();
  assert.equal(codes.length, RECOVERY_CODE_COUNT);
  assert.equal(new Set(codes).size, codes.length);
  for (const c of codes) assert.match(c, /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/, "no 0, O, 1, I or L");
  const hashes = codes.map(hashRecoveryCode);
  assert.ok(hashes.every((h) => /^[0-9a-f]{64}$/.test(h)));
  assert.equal(matchRecoveryCode(codes[3], hashes), 3);
  assert.equal(matchRecoveryCode(` ${codes[5].toLowerCase().replace("-", " ")} `, hashes), 5);
  assert.equal(normalizeRecoveryCode("ab2cd-ef3gh"), "AB2CDEF3GH");
  assert.equal(matchRecoveryCode("AAAAA-AAAAA", hashes), -1);
  assert.equal(matchRecoveryCode(codes[0].slice(0, 9), hashes), -1);
  assert.equal(looksLikeRecoveryCode(codes[0]), true);
  assert.equal(looksLikeRecoveryCode("123 456"), false);
  assert.equal(looksLikeRecoveryCode("123456"), false);
});

// ---------- The store ----------

let db: typeof import("../lib/db").db;
let S: typeof import("../lib/account-security");
let A: typeof import("../lib/auth");
let P: typeof import("../lib/password");

const T0 = Date.parse("2026-11-27T02:00:00.000Z");
const minutes = (n: number) => n * 60_000;
const PASSWORD = "a long enough passphrase";
let seq = 0;
async function account(over: Partial<User> = {}): Promise<User> {
  const user: User = { id: `user-${++seq}`, email: `staff${seq}@example.com`, name: `Staff ${seq}`, role: "accountant", passwordHash: P.hashPassword(PASSWORD), active: true, createdAt: "2026-01-01T00:00:00.000Z", ...over };
  await db.insert("users", user);
  return user;
}
const row = async (id: string) => (await db.get("users", id))!;
/** Sets two-step sign-in up for an account at `now` and returns its secret and recovery codes. */
async function enrol(userId: string, now: number) {
  const setup = await S.startTwoFactorSetup(userId, now);
  const { recoveryCodes } = await S.confirmTwoFactorSetup(userId, totpCode(setup.secret, totpStep(now)), now);
  return { secret: setup.secret, recoveryCodes };
}

before(async () => {
  ({ db } = await import("../lib/db"));
  S = await import("../lib/account-security");
  A = await import("../lib/auth");
  P = await import("../lib/password");
});
after(() => rmSync(DIR, { recursive: true, force: true }));

test("password step: right, wrong, unknown, disabled", async () => {
  const u = await account();
  const ok = await S.checkPassword(u.email.toUpperCase(), PASSWORD, T0);
  assert.equal(ok.ok && ok.user.id, u.id, "the email is not case-sensitive");
  assert.equal(ok.ok && ok.twoFactor, false);
  assert.equal((await row(u.id)).lastLoginAt, new Date(T0).toISOString());
  assert.deepEqual(await S.checkPassword(u.email, "wrong", T0), { ok: false, reason: "invalid" });
  assert.equal((await row(u.id)).failedLogins, 1);
  assert.deepEqual(await S.checkPassword("nobody@example.com", PASSWORD, T0), { ok: false, reason: "invalid" }, "an unknown email says the same");
  const off = await account({ active: false });
  assert.deepEqual(await S.checkPassword(off.email, PASSWORD, T0), { ok: false, reason: "invalid" });
  assert.equal((await row(off.id)).failedLogins, undefined, "nothing is written for a disabled account");
  await S.checkPassword(u.email, PASSWORD, T0);
  assert.equal((await row(u.id)).failedLogins, 0, "a right password clears the count");
  const clean = await account();
  await S.checkPassword(clean.email, PASSWORD, T0);
  assert.equal((await row(clean.id)).failedLogins, undefined, "and writes no count where there was none");
});

test("lock: five wrong passwords lock the account for fifteen minutes, then it opens again", async () => {
  const u = await account();
  for (let i = 1; i <= 4; i++) assert.deepEqual(await S.checkPassword(u.email, `wrong ${i}`, T0), { ok: false, reason: "invalid" });
  const fifth = await S.checkPassword(u.email, "wrong 5", T0);
  const until = new Date(T0 + minutes(S.LOCK_MINUTES)).toISOString();
  assert.deepEqual(fifth, { ok: false, reason: "locked", until });
  assert.equal(S.lockedUntilOf(await row(u.id), T0), until);
  assert.equal(S.lockWait(until, T0), "15 minutes");
  assert.equal(S.lockWait(until, T0 + minutes(14) + 30_000), "1 minute");
  assert.deepEqual(await S.checkPassword(u.email, PASSWORD, T0 + minutes(5)), { ok: false, reason: "locked", until }, "even the right password waits");
  assert.equal((await row(u.id)).failedLogins, 0, "attempts during the lock are not counted");
  const after = await S.checkPassword(u.email, PASSWORD, T0 + minutes(16));
  assert.equal(after.ok, true);
  assert.equal((await row(u.id)).lockedUntil, undefined);
  // An administrator can lift it at once.
  for (let i = 1; i <= 5; i++) await S.checkPassword(u.email, "wrong", T0 + minutes(20));
  assert.ok(S.lockedUntilOf(await row(u.id), T0 + minutes(20)));
  await S.adminUnlock(u.id);
  assert.equal((await S.checkPassword(u.email, PASSWORD, T0 + minutes(20))).ok, true);
});

test("setting two-step sign-in up: nothing is on until a first code confirms it", async () => {
  const u = await account();
  const setup = await S.startTwoFactorSetup(u.id, T0);
  assert.match(setup.secret, /^[A-Z2-7]{32}$/);
  assert.ok(setup.uri.startsWith("otpauth://totp/ILA%20Office:") && setup.uri.includes(setup.secret));
  let stored = await row(u.id);
  assert.equal(S.hasTwoFactor(stored), false);
  assert.ok(!JSON.stringify(stored).includes(setup.secret), "the secret is stored sealed");
  assert.deepEqual(await S.startTwoFactorSetup(u.id, T0 + minutes(2)), setup, "reloading the page shows the same QR code");
  await assert.rejects(S.confirmTwoFactorSetup(u.id, "000000", T0), /not right/);
  assert.equal((await S.checkPassword(u.email, PASSWORD, T0)).ok && true, true, "the password alone still signs in");
  await assert.rejects(S.confirmTwoFactorSetup(u.id, totpCode(setup.secret, totpStep(T0)), T0 + minutes(45)), /expired/);
  const again = await S.startTwoFactorSetup(u.id, T0 + minutes(45));
  assert.notEqual(again.secret, setup.secret, "an abandoned setup starts over with a new secret");
  const now = T0 + minutes(46);
  const { recoveryCodes } = await S.confirmTwoFactorSetup(u.id, totpCode(again.secret, totpStep(now)), now);
  assert.equal(recoveryCodes.length, RECOVERY_CODE_COUNT);
  stored = await row(u.id);
  assert.equal(S.hasTwoFactor(stored), true);
  assert.equal(stored.twoFactorSetup, undefined);
  assert.equal(stored.twoFactor!.recoveryHashes.length, RECOVERY_CODE_COUNT);
  const dump = JSON.stringify(stored);
  assert.ok(!dump.includes(again.secret) && recoveryCodes.every((c) => !dump.includes(c) && !dump.includes(c.replace("-", ""))), "neither the secret nor a recovery code is stored readable");
  await assert.rejects(S.startTwoFactorSetup(u.id, now), /already on/);
  // Cancelling a setup leaves no trace.
  const v = await account();
  await S.startTwoFactorSetup(v.id, T0);
  await S.cancelTwoFactorSetup(v.id);
  assert.equal((await row(v.id)).twoFactorSetup, undefined);
});

test("second step: the password is no longer enough; a code works once; wrong codes lock", async () => {
  const u = await account();
  const { secret } = await enrol(u.id, T0);
  const now = T0 + minutes(10), step = totpStep(now);
  const first = await S.checkPassword(u.email, PASSWORD, now);
  assert.equal(first.ok && first.twoFactor, true);
  assert.equal((await row(u.id)).lastLoginAt, undefined, "not signed in until the code is given");
  assert.deepEqual(await S.checkSecondStep(u.id, "000000", now), { ok: false, reason: "invalid" });
  const code = totpCode(secret, step);
  const ok = await S.checkSecondStep(u.id, code, now);
  assert.equal(ok.ok && ok.user.id, u.id);
  assert.equal(ok.ok && ok.recoveryUsed, false);
  assert.equal((await row(u.id)).lastLoginAt, new Date(now).toISOString());
  assert.deepEqual(await S.checkSecondStep(u.id, code, now), { ok: false, reason: "invalid" }, "the same code a second time");
  assert.equal((await S.checkSecondStep(u.id, totpCode(secret, step + 1), now + 30_000)).ok, true, "the next code works");
  // Five wrong codes lock the account, for the password step too.
  const later = now + minutes(5);
  for (let i = 1; i <= 4; i++) assert.deepEqual(await S.checkSecondStep(u.id, "111111", later), { ok: false, reason: "invalid" });
  const locked = await S.checkSecondStep(u.id, "111111", later);
  assert.equal(!locked.ok && locked.reason, "locked");
  assert.equal((await S.checkPassword(u.email, PASSWORD, later)).ok, false);
  assert.equal(!(await S.checkSecondStep(u.id, totpCode(secret, totpStep(later)), later)).ok, true, "a right code waits too");
  // Accounts without a second step, or disabled, have no code page.
  const plain = await account();
  assert.deepEqual(await S.checkSecondStep(plain.id, "123456", now), { ok: false, reason: "unavailable" });
  assert.deepEqual(await S.checkSecondStep("nobody", "123456", now), { ok: false, reason: "unavailable" });
});

test("recovery codes: each signs in once; new ones cancel the old", async () => {
  const u = await account();
  const { recoveryCodes } = await enrol(u.id, T0);
  const now = T0 + minutes(10);
  const used = await S.checkSecondStep(u.id, recoveryCodes[2].toLowerCase(), now);
  assert.equal(used.ok && used.recoveryUsed, true);
  assert.equal(used.ok && used.recoveryLeft, RECOVERY_CODE_COUNT - 1);
  assert.deepEqual(await S.checkSecondStep(u.id, recoveryCodes[2], now), { ok: false, reason: "invalid" }, "spent");
  assert.equal((await S.checkSecondStep(u.id, recoveryCodes[0], now)).ok, true);
  await assert.rejects(S.regenerateRecoveryCodes(u.id, "wrong password"), /password is not right/);
  const fresh = (await S.regenerateRecoveryCodes(u.id, PASSWORD)).recoveryCodes;
  assert.equal(fresh.length, RECOVERY_CODE_COUNT);
  assert.deepEqual(await S.checkSecondStep(u.id, recoveryCodes[5], now), { ok: false, reason: "invalid" }, "an old code after new ones were made");
  assert.equal((await S.checkSecondStep(u.id, fresh[0], now)).ok, true);
});

test("adding TWO_FACTOR_KEY later locks nobody out, and the session secret can then be renewed", async () => {
  const u = await account();
  const { secret } = await enrol(u.id, T0);
  const sealedBefore = (await row(u.id)).twoFactor!.secret;
  const session = process.env.SESSION_SECRET!;
  process.env.TWO_FACTOR_KEY = "a key added after this account was set up";
  try {
    assert.equal(sealedUnderCurrentKey(sealedBefore), false);
    assert.equal(openSecret(sealedBefore), secret, "still opens, under the session secret it was sealed with");
    let now = T0 + minutes(10);
    assert.equal((await S.checkSecondStep(u.id, totpCode(secret, totpStep(now)), now)).ok, true, "the code still works");
    const sealedAfter = (await row(u.id)).twoFactor!.secret;
    assert.notEqual(sealedAfter, sealedBefore);
    assert.equal(sealedUnderCurrentKey(sealedAfter), true, "that sign-in sealed it again under the new key");
    // The session secret is renewed: the account is unaffected.
    process.env.SESSION_SECRET = "a renewed session secret, long enough";
    now = T0 + minutes(20);
    assert.equal((await S.checkSecondStep(u.id, totpCode(secret, totpStep(now)), now)).ok, true);
    // A new setup is sealed under the new key from the start.
    const v = await account();
    await enrol(v.id, now);
    assert.equal(sealedUnderCurrentKey((await row(v.id)).twoFactor!.secret), true);
  } finally { delete process.env.TWO_FACTOR_KEY; process.env.SESSION_SECRET = session; }
});

test("a secret whose key is gone: recovery codes and the administrator still open the account", async () => {
  const u = await account();
  const { secret, recoveryCodes } = await enrol(u.id, T0);
  const now = T0 + minutes(10);
  const session = process.env.SESSION_SECRET!;
  process.env.TWO_FACTOR_KEY = "a different key than the one it was sealed with";
  process.env.SESSION_SECRET = "and the session secret was renewed as well";
  try {
    assert.deepEqual(await S.checkSecondStep(u.id, totpCode(secret, totpStep(now)), now), { ok: false, reason: "invalid" });
    assert.equal((await S.checkSecondStep(u.id, recoveryCodes[0], now)).ok, true);
  } finally { delete process.env.TWO_FACTOR_KEY; process.env.SESSION_SECRET = session; }
  await S.adminResetTwoFactor(u.id);
  const stored = await row(u.id);
  assert.equal(S.hasTwoFactor(stored), false);
  const again = await S.checkPassword(u.email, PASSWORD, now);
  assert.equal(again.ok && again.twoFactor, false, "the password alone signs in until it is set up again");
});

test("turning it off and changing the password ask for the current password", async () => {
  const u = await account();
  await enrol(u.id, T0);
  await assert.rejects(S.disableTwoFactor(u.id, "wrong"), /password is not right/);
  assert.equal(S.hasTwoFactor(await row(u.id)), true);
  await S.disableTwoFactor(u.id, PASSWORD);
  assert.equal((await row(u.id)).twoFactor, undefined);
  await assert.rejects(S.changeOwnPassword(u.id, "wrong", "another long passphrase"), /current password is not right/);
  await assert.rejects(S.changeOwnPassword(u.id, PASSWORD, "short"), /at least 10 characters/);
  await assert.rejects(S.changeOwnPassword(u.id, PASSWORD, PASSWORD), /same as the current one/);
  await S.changeOwnPassword(u.id, PASSWORD, "another long passphrase");
  assert.deepEqual(await S.checkPassword(u.email, PASSWORD, T0), { ok: false, reason: "invalid" });
  assert.equal((await S.checkPassword(u.email, "another long passphrase", T0)).ok, true);
  assert.ok((await row(u.id)).passwordChangedAt);
});

test("policy: optional, the team, or everyone", async () => {
  assert.equal(await S.getTwoFactorPolicy(), "optional");
  assert.equal(S.twoFactorRequiredFor("optional", "admin"), false);
  assert.equal(S.twoFactorRequiredFor("team", "accountant"), true);
  assert.equal(S.twoFactorRequiredFor("team", "client"), false);
  assert.equal(S.twoFactorRequiredFor("everyone", "client"), true);
  await S.setTwoFactorPolicy("team");
  assert.equal(await S.getTwoFactorPolicy(), "team");
  await assert.rejects(S.setTwoFactorPolicy("sometimes" as never), /Unknown policy/);
  await S.setTwoFactorPolicy("optional");
});

test("sessions: a full session, one held at the setup, and the step in between are three different things", () => {
  const full = A.createSessionToken("user-9");
  assert.deepEqual(A.parseSessionToken(full), { userId: "user-9", setupRequired: false });
  const held = A.createSessionToken("user-9", 14, { setupRequired: true });
  assert.deepEqual(A.parseSessionToken(held), { userId: "user-9", setupRequired: true });
  assert.equal(A.parseSessionToken(held.replace(".setup.", ".")), null, "the mark cannot be cut off: it is signed");
  assert.equal(A.parseSessionToken(full.replace(/\.([^.]+)$/, ".setup.$1")), null, "nor added");
  const pending = A.createPendingToken("user-9");
  assert.deepEqual(A.parsePendingToken(pending), { userId: "user-9" });
  assert.equal(A.parseSessionToken(pending), null, "the cookie of the code page is never a session");
  assert.equal(A.parsePendingToken(full), null, "and a session is never a passed password step");
  assert.equal(A.parsePendingToken(A.createPendingToken("user-9", -1)), null, "expired");
  assert.equal(A.parseSessionToken(A.createSessionToken("user-9", -1)), null);
  for (const junk of [undefined, "", "a.b", "user-9.notanumber.sig", `${full}x`]) assert.equal(A.parseSessionToken(junk), null);
  assert.equal(A.safeNext("/books/x?tab=1"), "/books/x?tab=1");
  for (const bad of [undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "books"]) assert.equal(A.safeNext(bad), "/");
});

test("the audit trail records that two-step sign-in changed, never the secret or a code", async () => {
  const { draftAudit } = await import("../lib/audit");
  const u = await account();
  const beforeRow = await row(u.id);
  const { secret, recoveryCodes } = await enrol(u.id, T0);
  const afterRow = await row(u.id);
  const entry = draftAudit("users", beforeRow, afterRow)!;
  const text = JSON.stringify(entry);
  assert.match(text, /twoFactor\.enabledAt/);
  assert.ok(!text.includes(secret) && !text.includes(afterRow.twoFactor!.secret) && recoveryCodes.every((c) => !text.includes(c)) && afterRow.twoFactor!.recoveryHashes.every((h) => !text.includes(h)));
  // A sign-in with a code changes only the last step used: nothing worth a log line.
  const now = T0 + minutes(10);
  await S.checkSecondStep(u.id, totpCode(secret, totpStep(now)), now);
  assert.equal(draftAudit("users", afterRow, { ...(await row(u.id)), lastLoginAt: afterRow.lastLoginAt }), null);
});
