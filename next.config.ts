import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isProd = process.env.NODE_ENV === "production";

/**
 * Content Security Policy.
 *
 * Trade-off: `script-src` carries 'unsafe-inline'. Next.js App Router streams its RSC payload through inline
 * `<script>` tags, and the GA4 (gtag) and Meta pixel init snippets in components/Analytics.tsx are inline too.
 * The nonce-based alternative needs every page to render dynamically (no static pages) and next/script to be
 * fed the nonce on each request; that is a bigger change than this review allows, so the policy relies on the
 * other directives instead: no eval, no inline event handlers from foreign origins (only listed script hosts
 * can be loaded), no frames, no objects, no form posts off-site, no base tag hijacking, and a strict
 * connect-src so injected script could not exfiltrate to arbitrary hosts.
 *
 * Airwallex hosted checkout is a full-page redirect (not an iframe or a form post), so it needs no directive.
 * The dev server needs 'unsafe-eval' for React Fast Refresh; it is added only outside production.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://vercel.live https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://*.google.com https://*.doubleclick.net https://www.facebook.com",
  "font-src 'self' data:",
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://www.googletagmanager.com https://stats.g.doubleclick.net https://*.doubleclick.net https://www.facebook.com https://connect.facebook.net https://vitals.vercel-insights.com https://vercel.live",
  "frame-src https://td.doubleclick.net https://www.googletagmanager.com https://vercel.live",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
