/** Tiny in-memory limiter for sign-in attempts (per process). Enough for a small team behind one server. */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 8;
const failures = new Map<string, { count: number; first: number }>();

export function loginBlocked(key: string): boolean {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const f = failures.get(key);
  if (!f || now - f.first > WINDOW_MS) failures.set(key, { count: 1, first: now });
  else f.count += 1;
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}
