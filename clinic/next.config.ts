import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isProd = process.env.NODE_ENV === "production";

/**
 * Content Security Policy. `script-src` carries 'unsafe-inline' because the App Router streams its payload through
 * inline scripts; everything else is locked down: no eval in production, no frames, no objects, no off-site form
 * posts. Payment pages (Xendit, Airwallex) are full-page redirects, so they need no directive.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://vercel.live https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://vitals.vercel-insights.com https://vercel.live",
  "frame-src https://vercel.live",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// A test site (DEMO_MODE=on) tells search engines to stay away on every response.
if ((process.env.DEMO_MODE ?? "").trim().toLowerCase() === "on") securityHeaders.push({ key: "X-Robots-Tag", value: "noindex, nofollow" });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // This app lives in a subfolder of a repository that holds other apps: keep file tracing inside it.
  outputFileTracingRoot: __dirname,
  // Photographs are served as AVIF or WebP at the size each screen needs.
  images: { formats: ["image/avif", "image/webp"] },
  async rewrites() {
    // IndexNow asks for the key at /<key>.txt; the key itself is stored in the console's SEO settings.
    return [{ source: "/:key([a-f0-9]{32}).txt", destination: "/api/indexnow/:key" }];
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);
