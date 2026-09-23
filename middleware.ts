import { NextResponse, type NextRequest } from "next/server";

export const config = { matcher: ["/((?!_next/|api/webhooks/|favicon.ico).*)"] };

const CANONICAL_HOST = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").host; } catch { return ""; }
})();

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

  // 2. Ops console: HTTP basic auth.
  const path = req.nextUrl.pathname;
  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
    const user = process.env.ADMIN_USER;
    const pass = process.env.ADMIN_PASSWORD;
    if (!user || !pass) return new NextResponse("Ops console disabled: set ADMIN_USER and ADMIN_PASSWORD.", { status: 503 });
    const header = req.headers.get("authorization") ?? "";
    if (header.startsWith("Basic ")) {
      const [u, p] = Buffer.from(header.slice(6), "base64").toString().split(":");
      if (u === user && p === pass) return NextResponse.next();
    }
    return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="ops", charset="UTF-8"' } });
  }
  return NextResponse.next();
}
