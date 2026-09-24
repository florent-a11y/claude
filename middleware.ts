import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/** Everything except Next internals, the payment webhook and static assets. /admin and /api/admin still pass
 *  through for basic auth; the locale step below skips /admin, /api and files with an extension. */
export const config = { matcher: ["/((?!_next/|api/webhooks/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff2?|ttf)$).*)"] };

const CANONICAL_HOST = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").host; } catch { return ""; }
})();

const intl = createMiddleware(routing);

/** Paths that never get locale routing: ops console, API, Next internals and static files (sitemap.xml, robots.txt, images…). */
function isUnlocalized(path: string) {
  return path.startsWith("/admin") || path.startsWith("/api") || path.startsWith("/_next") || /\.[a-z0-9]+$/i.test(path);
}

/**
 * Canonical form of the request path for the auth check: percent-decoded (so "/%61dmin" cannot slip past),
 * lower-cased, backslashes and repeated slashes folded, and a leading locale prefix removed
 * (so "/de/admin" is treated like "/admin" and never falls through to locale routing).
 */
function normalizedPath(pathname: string) {
  let p = pathname;
  try { p = decodeURIComponent(p); } catch { /* keep as is; Next will reject it */ }
  p = p.toLowerCase().replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  const locales = routing.locales as readonly string[];
  const first = p.split("/")[1] ?? "";
  if (locales.includes(first)) p = p.slice(first.length + 1) || "/";
  return p;
}

/** Ops console: "/admin", "/admin/…", "/admin.", "/api/admin/…" (after normalization), any method. */
function isAdminPath(path: string) {
  return /^\/(api\/)?admin(?![a-z0-9_-])/.test(path);
}

/**
 * Constant-time comparison (the Edge runtime has no node:crypto.timingSafeEqual). When the lengths differ the
 * loop still runs over the whole candidate so the response time does not reveal the expected length.
 */
function safeEqual(candidate: string, expected: string) {
  const enc = new TextEncoder();
  const a = enc.encode(candidate);
  const b = enc.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ (b[i % (b.length || 1)] ?? 0);
  return diff === 0;
}

function basicAuthOk(header: string, user: string, pass: string) {
  if (!header.startsWith("Basic ")) return false;
  let decoded = "";
  try { decoded = atob(header.slice(6).trim()); } catch { return false; }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  // Evaluate both so a wrong user name costs the same as a wrong password.
  const okUser = safeEqual(decoded.slice(0, i), user);
  const okPass = safeEqual(decoded.slice(i + 1), pass);
  return okUser && okPass;
}

export function middleware(req: NextRequest) {
  // 1. Canonical host: send www.<domain> (or any alias) to the configured site URL.
  const host = req.headers.get("host") ?? "";
  if (CANONICAL_HOST && host !== CANONICAL_HOST && !host.startsWith("localhost") && !host.endsWith(".vercel.app")) {
    const url = new URL(req.nextUrl);
    url.host = CANONICAL_HOST;
    url.port = "";
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  // 2. Ops console: HTTP basic auth, every method, checked before any locale handling.
  const path = req.nextUrl.pathname;
  if (isAdminPath(normalizedPath(path))) {
    const user = process.env.ADMIN_USER;
    const pass = process.env.ADMIN_PASSWORD;
    if (!user || !pass) return new NextResponse("Ops console disabled: set ADMIN_USER and ADMIN_PASSWORD.", { status: 503 });
    if (basicAuthOk(req.headers.get("authorization") ?? "", user, pass)) {
      const res = NextResponse.next();
      res.headers.set("cache-control", "private, no-store");
      res.headers.set("x-robots-tag", "noindex, nofollow");
      return res;
    }
    return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="ops", charset="UTF-8"', "cache-control": "no-store" } });
  }

  // 3. Public site: locale routing (en without prefix; /de, /zh, /fr, /id, /ja, /ko, /es).
  if (isUnlocalized(path)) return NextResponse.next();
  return intl(req);
}
