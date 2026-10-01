import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge gate: every page and API route needs a session cookie with a valid HMAC signature, except the login flow.
 * The server (lib/auth.ts) re-validates the user record on each request; this only keeps anonymous traffic out.
 */
export const config = { matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff2?|ttf)$).*)"] };

const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/api\/health$/];
const COOKIE = "ila_session";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  return "dev-only-insecure-secret-change-me";
}

async function verify(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const [, expires] = payload.split(".");
  if (!expires || Number(expires) < Date.now()) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  const expected = btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let j = 0; j < expected.length; j++) diff |= expected.charCodeAt(j) ^ sig.charCodeAt(j);
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((re) => re.test(path))) return NextResponse.next();
  if (await verify(req.cookies.get(COOKIE)?.value)) {
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
