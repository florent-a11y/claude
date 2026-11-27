import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Two-step sign-in: time-based one-time codes (TOTP, RFC 6238, the 6-digit codes of Google Authenticator, Microsoft
 * Authenticator, 1Password, Authy…) and one-use recovery codes. Pure functions on node:crypto, no database and no
 * Next.js import, so scripts and tests use them as they are; the store side is lib/account-security.ts.
 *
 * - The authenticator secret is kept encrypted (AES-256-GCM) under a key derived from `TWO_FACTOR_KEY`, or from
 *   `SESSION_SECRET` when that is not set: a copy of the database alone does not let anyone compute codes.
 *   A secret sealed before `TWO_FACTOR_KEY` existed still opens (under `SESSION_SECRET`) and is sealed again under
 *   the new key at its owner's next sign-in, so adding the key later never locks anyone out.
 * - Recovery codes are stored as SHA-256 hashes: they are random, so a plain hash is enough, and each works once.
 * - A code is accepted for the current 30-second step and the one on either side (clock drift), and never twice:
 *   the last step used is remembered and anything at or before it is refused.
 */

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD = 30;
/** Steps accepted on either side of the current one. */
export const TOTP_WINDOW = 1;
export const RECOVERY_CODE_COUNT = 8;

// ---------- Base32 (RFC 4648, the alphabet authenticator apps expect) ----------

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Decodes base32 typed by a person: case, spaces, dashes and padding are ignored. Throws on any other character. */
export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Not a base32 text");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

// ---------- Codes ----------

/** A new authenticator secret: 20 random bytes, base32 (what the QR code carries and what is typed by hand). */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The step (30-second window) a moment falls in. */
export function totpStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD);
}

/** The code of one step (HMAC-SHA1, dynamic truncation: RFC 4226 §5.3). */
export function totpCode(secretBase32: string, step: number, digits = TOTP_DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const binary = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** What a person typed as a code: digits only ("123 456" is fine). */
export function cleanTotpInput(input: string): string {
  return input.replace(/[\s-]/g, "");
}

/**
 * Checks a 6-digit code. Returns the step it belongs to, or null when it is wrong, malformed, or belongs to a step
 * at or before `lastStep` (already used: a code read over someone's shoulder cannot be replayed).
 */
export function verifyTotp(secretBase32: string, input: string, opts: { now?: number; lastStep?: number } = {}): number | null {
  const code = cleanTotpInput(input);
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) return null;
  const current = totpStep(opts.now);
  let found: number | null = null;
  // Every candidate is compared, so the time taken does not tell which step matched.
  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step++) {
    if (sameText(totpCode(secretBase32, step), code) && found === null) found = step;
  }
  if (found === null) return null;
  if (opts.lastStep !== undefined && found <= opts.lastStep) return null;
  return found;
}

/** The address an authenticator app reads from the QR code. */
export function otpauthUri(opts: { issuer: string; account: string; secret: string }): string {
  const label = `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(opts.account)}`;
  return `otpauth://totp/${label}?secret=${opts.secret}&issuer=${encodeURIComponent(opts.issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

/** The secret in groups of four, for typing it into an app by hand. */
export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

// ---------- Secret at rest ----------

function keyFrom(material: string): Buffer {
  return Buffer.from(hkdfSync("sha256", material, "ila-office", "two-factor-secret:v1", 32));
}

/** The key material: `TWO_FACTOR_KEY` when set (so the session secret can be renewed on its own), else `SESSION_SECRET`. */
export function twoFactorKeyMaterial(): string {
  const own = process.env.TWO_FACTOR_KEY;
  if (own && own.length >= 16) return own;
  const session = process.env.SESSION_SECRET;
  if (session && session.length >= 16) return session;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (≥ 16 characters) in production");
  return "dev-only-insecure-secret-change-me";
}

/** `v1.<iv>.<tag>.<ciphertext>`, base64url. */
export function sealSecret(secretBase32: string, material: string = twoFactorKeyMaterial()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(material), iv);
  const body = Buffer.concat([cipher.update(secretBase32, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

/**
 * Every key a stored secret may have been sealed under, the current one first: `TWO_FACTOR_KEY`, then
 * `SESSION_SECRET` (what was used before `TWO_FACTOR_KEY` was set on this installation).
 */
export function twoFactorKeyMaterials(): string[] {
  const out = [twoFactorKeyMaterial()];
  const session = process.env.SESSION_SECRET;
  if (session && session.length >= 16 && !out.includes(session)) out.push(session);
  return out;
}

function openWith(sealed: string, material: string): string | null {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(material), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * The secret back from its sealed form, or null when it was sealed under another key or has been altered. Without
 * `material`, every key of this installation is tried (`twoFactorKeyMaterials`).
 */
export function openSecret(sealed: string, material?: string): string | null {
  for (const m of material === undefined ? twoFactorKeyMaterials() : [material]) {
    const secret = openWith(sealed, m);
    if (secret !== null) return secret;
  }
  return null;
}

/** Whether a sealed secret opens with the current key (else it was sealed under an earlier one and should be sealed again). */
export function sealedUnderCurrentKey(sealed: string): boolean {
  return openWith(sealed, twoFactorKeyMaterial()) !== null;
}

// ---------- Recovery codes ----------

/** Letters and digits that are not mistaken for one another when copied from paper (no 0/O, 1/I/L). */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** "K7QM2-X9RTB": ten characters, about 49 bits each. */
export function newRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

/** A recovery code as typed: case, spaces and the dash do not matter. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(`ila-office:recovery:${normalizeRecoveryCode(code)}`).digest("hex");
}

/** Index of the stored hash a typed recovery code matches, or -1. */
export function matchRecoveryCode(input: string, hashes: readonly string[]): number {
  const normalized = normalizeRecoveryCode(input);
  if (normalized.length !== 10) return -1;
  const hash = hashRecoveryCode(normalized);
  let found = -1;
  hashes.forEach((h, i) => { if (sameText(h, hash) && found < 0) found = i; });
  return found;
}

/** Whether an input looks like a recovery code rather than a 6-digit authenticator code. */
export function looksLikeRecoveryCode(input: string): boolean {
  return /[A-Za-z]/.test(input) || normalizeRecoveryCode(input).length > TOTP_DIGITS + 2;
}
