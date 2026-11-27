import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge gate: every page and API route needs a session cookie with a valid HMAC signature, except the login flow.
 * The server (lib/auth.ts) re-validates the user record on each request; this only keeps anonymous traffic out.
 *
 * A session marked "setup" (the policy requires two-step sign-in and the account has none yet) reaches only the
 * account security page and the sign-out route until the setup is done there.
 *
 * Pages asked for at an address the app has moved away from (`MOVED_HOSTS`) are sent to the current one.
 */
export const config = { matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff2?|ttf)$).*)"] };

const PUBLIC = [/^\/login$/, /^\/login\/verify$/, /^\/api\/auth\//, /^\/api\/health$/];
const COOKIE = "ila_session";
const SECURITY_PATH = "/account/security";

/**
 * Earlier addresses of this installation and where each now lives. Only page requests (GET) are sent on:
 * - API routes keep answering there, because the scheduled jobs of vercel.json call the deployment and do not follow
 *   a redirect, and so does `/api/health`;
 * - a form posted from a page that was still open there goes through, so nobody loses what they were typing; the
 *   next page they open is at the new address, where they sign in once (sessions belong to one address).
 * The redirect is temporary (307) on purpose: browsers do not remember it, so the old address can be opened up again
 * by removing its line here if the new one ever has a DNS problem.
 */
const MOVED_HOSTS: Readonly<Record<string, string>> = { "ila-office.vercel.app": "office.ilaglobalconsulting.com" };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  return "dev-only-insecure-secret-change-me";
}

/** "ok" for a full session, "setup" for one held at the two-step setup, null for none. */
async function verify(token: string | undefined): Promise<"ok" | "setup" | null> {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const [, expires, flag] = payload.split(".");
  if (!expires || !(Number(expires) > Date.now())) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  const expected = btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let j = 0; j < expected.length; j++) diff |= expected.charCodeAt(j) ^ sig.charCodeAt(j);
  if (diff !== 0) return null;
  return flag === "setup" ? "setup" : "ok";
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const movedTo = MOVED_HOSTS[(req.headers.get("host") ?? "").toLowerCase()];
  if (movedTo && (req.method === "GET" || req.method === "HEAD") && !path.startsWith("/api/")) {
    return NextResponse.redirect(`https://${movedTo}${path}${req.nextUrl.search}`, 307);
  }
  if (PUBLIC.some((re) => re.test(path))) return NextResponse.next();
  // The Bank Indonesia rate sync is called by the Vercel cron with a bearer token that the route itself verifies.
  if (path === "/api/fx/sync" && req.headers.get("authorization")?.startsWith("Bearer ")) return NextResponse.next();
  // Same for the daily run of recurring transactions (app/api/recurring/run verifies the token).
  if (path === "/api/recurring/run" && req.headers.get("authorization")?.startsWith("Bearer ")) return NextResponse.next();
  // And for the weekly AI visibility run (app/api/visibility/run verifies the token).
  if (path === "/api/visibility/run" && req.method === "GET" && req.headers.get("authorization")?.startsWith("Bearer ")) return NextResponse.next();
  const session = await verify(req.cookies.get(COOKIE)?.value);
  if (session === "setup" && path !== SECURITY_PATH) {
    if (path.startsWith("/api/")) return new NextResponse("Set up two-step sign-in first.", { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = SECURITY_PATH;
    url.search = "?required=1";
    return NextResponse.redirect(url);
  }
  if (session) {
    const res = NextResponse.next();
    res.headers.set("cache-control", "private, no-store");
    return res;
  }
  if (path.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = path !== "/" ? `?next=${encodeURIComponent(path + req.nextUrl.search)}` : "";
  return NextResponse.redirect(url);
}
