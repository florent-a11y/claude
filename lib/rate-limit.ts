/**
 * Best-effort in-memory rate limiter for the public API routes. Per serverless instance and reset on restart,
 * so it blunts scripted abuse without being a hard guarantee; a real limit belongs at the edge (Vercel WAF).
 */
export function createRateLimiter(opts: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function limited(key: string): boolean {
    const now = Date.now();
    const cur = hits.get(key);
    if (!cur || cur.resetAt < now) {
      if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return false;
    }
    cur.count += 1;
    return cur.count > opts.limit;
  };
}

/** Client IP as seen behind the platform proxy (first x-forwarded-for hop). "unknown" when absent. */
export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
