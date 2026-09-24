/**
 * Cookie-consent state shared by the banner (components/ConsentBanner.tsx), the tag loader
 * (components/Analytics.tsx) and the attribution payload (lib/analytics-client.ts).
 * No "use client" directive on purpose: no React here, and `window` is only touched inside functions,
 * so the server can import the types and constants.
 *
 * The decision lives in localStorage (`consent`) and is mirrored in a first-party cookie (`consent`) so
 * the API routes can read it without trusting the request body.
 */
export type ConsentState = "granted" | "denied" | "unknown";

export const CONSENT_KEY = "consent";
export const CONSENT_COOKIE = "consent";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

/** Fired on `window` after every decision, with the new state in `detail`. */
export const CONSENT_CHANGE_EVENT = "aca:consent-change";
/** Fired on `window` by the "Cookie settings" link to reopen the banner. */
export const CONSENT_OPEN_EVENT = "aca:consent-open";

interface StoredConsent { analytics: boolean; at: string }

/** Stored decision, or "unknown" when the visitor has not decided yet (or storage is unavailable). */
export function readConsent(): ConsentState {
  if (typeof window === "undefined") return "unknown";
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<StoredConsent>;
      if (typeof v?.analytics === "boolean") return v.analytics ? "granted" : "denied";
    }
  } catch { /* private mode, blocked storage… */ }
  // Fall back to the cookie (storage cleared but cookie kept, or storage blocked).
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=(granted|denied)(?:;|$)`));
    if (m) return m[1] as ConsentState;
  } catch { /* ignore */ }
  return "unknown";
}

/** Persists the decision (localStorage + cookie) and notifies listeners. Never throws. */
export function writeConsent(analytics: boolean) {
  if (typeof window === "undefined") return;
  const state: ConsentState = analytics ? "granted" : "denied";
  const stored: StoredConsent = { analytics, at: new Date().toISOString() };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(stored)); } catch { /* ignore */ }
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CONSENT_COOKIE}=${state}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_CHANGE_EVENT, { detail: state })); } catch { /* ignore */ }
}

/** Calls `fn` with the new state after every decision; returns the unsubscribe function. */
export function onConsentChange(fn: (state: ConsentState) => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => fn((e as CustomEvent<ConsentState>).detail ?? readConsent());
  window.addEventListener(CONSENT_CHANGE_EVENT, handler);
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, handler);
}

/** Reopens the banner (footer "Cookie settings" link). */
export function openConsentBanner() {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new Event(CONSENT_OPEN_EVENT)); } catch { /* ignore */ }
}

/** Parses the `consent` cookie out of a raw Cookie header (server side). */
export function consentFromCookieHeader(header: string | null | undefined): ConsentState | undefined {
  if (!header) return undefined;
  const m = header.match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=(granted|denied)(?:;|$)`));
  return m ? (m[1] as ConsentState) : undefined;
}
