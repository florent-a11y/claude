import type { NextConfig } from "next";
import path from "node:path";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /** This app has its own lockfile inside a larger repository; pin the tracing root so Next does not guess. */
  outputFileTracingRoot: path.join(__dirname),
  /** pdfkit reads its font metrics from disk at runtime; keep it out of the bundle and trace its data files. */
  serverExternalPackages: ["pdfkit", "xlsx", "pdfjs-dist"],
  outputFileTracingIncludes: { "/**": ["./node_modules/pdfkit/js/data/**/*", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"] },
  /** Attachment uploads go through server actions (default limit 1 MB): allow a few files per submit. Vercel still caps a request at 4.5 MB. */
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
