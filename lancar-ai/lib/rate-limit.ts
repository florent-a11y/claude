/**
 * In-memory sliding-window limiter. It protects one server instance: on a serverless host each instance keeps
 * its own counters, so treat it as a brake on casual abuse, not as a hard quota. The hard limit on AI spend is
 * the monthly cap set in the Anthropic Console.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return true;
}

/** Caller's IP as reported by the platform proxy (Vercel sets x-forwarded-for). */
export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
