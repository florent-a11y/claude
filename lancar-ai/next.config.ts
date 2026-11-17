import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isProd = process.env.NODE_ENV === "production";

/**
 * Content Security Policy. The site loads nothing from other origins: fonts are bundled, there is no analytics
 * script, and the AI demo talks to our own /api route. 'unsafe-inline' stays on script-src because the App
 * Router streams its payload through inline scripts; the dev server also needs 'unsafe-eval' for Fast Refresh.
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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);
