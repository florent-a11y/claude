import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Runs on everything except Next internals and the payment webhooks. Deliberately NOT skipped for paths that look
 * like files ("….png"): console routes can end in a file name (a transfer proof), and a skipped request would
 * neither be authenticated nor have forged role headers removed.
 */
export const config = { matcher: ["/((?!_next/|api/webhooks/).*)"] };

const intl = createMiddleware(routing);

/** Paths that never get locale routing: ops console, API, Next internals and static files. */
function isUnlocalized(path: string) {
  return path.startsWith("/admin") || path.startsWith("/api") || path.startsWith("/_next") || /\.[a-z0-9]+$/i.test(path);
}

/** Canonical form of the path for the auth check: percent-decoded, lower-cased, slashes folded, locale prefix removed. */
function normalizedPath(pathname: string) {
  let p = pathname;
  try { p = decodeURIComponent(p); } catch { /* keep as is; Next will reject it */ }
  p = p.toLowerCase().replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  const first = p.split("/")[1] ?? "";
  if ((routing.locales as readonly string[]).includes(first)) p = p.slice(first.length + 1) || "/";
  return p;
}

function isAdminPath(path: string) {
  return /^\/(api\/)?admin(?![a-z0-9_-])/.test(path);
}

/** Constant-time comparison (the Edge runtime has no node:crypto.timingSafeEqual). */
function safeEqual(candidate: string, expected: string) {
  const enc = new TextEncoder();
  const a = enc.encode(candidate);
  const b = enc.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ (b[i % (b.length || 1)] ?? 0);
  return diff === 0;
}

function credentials(header: string): { user: string; pass: string } | null {
  if (!header.startsWith("Basic ")) return null;
  let decoded = "";
  try { decoded = atob(header.slice(6).trim()); } catch { return null; }
  const i = decoded.indexOf(":");
  return i < 0 ? null : { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
}

/**
 * Two sign-ins for the console (HTTP basic auth):
 *  - ops    (ADMIN_USER / ADMIN_PASSWORD): orders, payments, delivery. Does not see health questionnaires.
 *  - doctor (DOCTOR_USER / DOCTOR_PASSWORD): sees questionnaires and approves or declines prescription items.
 * The role is passed to the pages in request headers that are always overwritten here, so a browser cannot forge them.
 */
function roleFor(header: string): { role: "ops" | "doctor"; user: string } | null {
  const given = credentials(header);
  if (!given) return null;
  const pairs = [
    { role: "doctor" as const, user: process.env.DOCTOR_USER, pass: process.env.DOCTOR_PASSWORD },
    { role: "ops" as const, user: process.env.ADMIN_USER, pass: process.env.ADMIN_PASSWORD },
  ];
  let match: { role: "ops" | "doctor"; user: string } | null = null;
  for (const p of pairs) {
    if (!p.user || !p.pass) continue;
    // Evaluate both parts for every pair so timing does not reveal which part was wrong.
    const okUser = safeEqual(given.user, p.user);
    const okPass = safeEqual(given.pass, p.pass);
    if (okUser && okPass && !match) match = { role: p.role, user: p.user };
  }
  return match;
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const headers = new Headers(req.headers);
  headers.delete("x-clinic-role");
  headers.delete("x-clinic-user");

  if (isAdminPath(normalizedPath(path))) {
    if (!(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) && !(process.env.DOCTOR_USER && process.env.DOCTOR_PASSWORD)) {
      return new NextResponse("Console disabled: set ADMIN_USER / ADMIN_PASSWORD and DOCTOR_USER / DOCTOR_PASSWORD.", { status: 503 });
    }
    const who = roleFor(req.headers.get("authorization") ?? "");
    if (!who) {
      return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="console", charset="UTF-8"', "cache-control": "no-store" } });
    }
    headers.set("x-clinic-role", who.role);
    headers.set("x-clinic-user", who.user);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("cache-control", "private, no-store");
    res.headers.set("x-robots-tag", "noindex, nofollow");
    return res;
  }

  if (isUnlocalized(path)) return NextResponse.next({ request: { headers } });
  return intl(req);
}
