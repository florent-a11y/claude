/**
 * Browser-side analytics helpers. No "use client" directive on purpose: this module has no React
 * and only touches `window` inside functions, so the server can import the pure helpers
 * (`purchaseEventId`) and client components can import the rest.
 */
import { readConsent, type ConsentState } from "./consent";

export interface Attribution {
  /** Cookie-consent decision at the time of the order / reminder; the server only sends identified events when "granted". */
  consent?: ConsentState;
  gaClientId?: string;
  fbp?: string;
  fbc?: string;
  gclid?: string;
  fbclid?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  landingPage?: string;
  userAgent?: string;
}

/** Shared by the browser (fbq eventID) and the Conversions API (event_id) so Meta deduplicates. */
export function purchaseEventId(orderId: string) {
  return `purchase-${orderId}`;
}

const MAX = 200;
const STORAGE_KEY = "aca_first_touch";
const FIRST_TOUCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Meta standard events go through fbq('track'); anything else is a custom event. */
const META_STANDARD = new Set(["PageView", "ViewContent", "Search", "AddToCart", "AddToWishlist", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead", "CompleteRegistration", "Contact", "Schedule", "StartTrial", "SubmitApplication", "Subscribe"]);

type Gtag = (...args: unknown[]) => void;
type Fbq = (...args: unknown[]) => void;
type TrackingWindow = Window & { gtag?: Gtag; fbq?: Fbq };

function win(): TrackingWindow | null {
  return typeof window === "undefined" ? null : (window as TrackingWindow);
}

export interface TrackOptions {
  /** Meta event to send alongside the GA4 event. Omit to send to GA4 only. */
  meta?: { event: string; params?: Record<string, unknown> };
  /** Deduplication id shared with the server-side event (Meta eventID). */
  eventId?: string;
}

/** Sends one event to GA4 (gtag) and optionally to Meta (fbq). Never throws; no-op when the tags are not loaded. */
export function track(event: string, params: Record<string, unknown> = {}, opts: TrackOptions = {}) {
  const w = win();
  if (!w) return;
  try { w.gtag?.("event", event, params); } catch { /* ignore */ }
  if (opts.meta) {
    try {
      const method = META_STANDARD.has(opts.meta.event) ? "track" : "trackCustom";
      const extra = opts.eventId ? { eventID: opts.eventId } : undefined;
      w.fbq?.(method, opts.meta.event, opts.meta.params ?? {}, extra);
    } catch { /* ignore */ }
  }
}

/** Client-side page view for App Router navigations (the base snippets only fire the first one). */
export function trackPageView(path: string) {
  const w = win();
  if (!w) return;
  try { w.gtag?.("event", "page_view", { page_path: path, page_location: w.location.href, page_title: document.title }); } catch { /* ignore */ }
  try { w.fbq?.("track", "PageView"); } catch { /* ignore */ }
}

function clip(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const s = String(v).trim();
  return s ? s.slice(0, MAX) : undefined;
}

function cookie(name: string): string | undefined {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return m ? clip(decodeURIComponent(m[1])) : undefined;
  } catch { return undefined; }
}

interface FirstTouch {
  at: number;
  landingPage?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  gclid?: string;
  fbclid?: string;
}

function hasCampaignData(t: Partial<FirstTouch>) {
  return Boolean(t.utmSource || t.utmMedium || t.utmCampaign || t.gclid || t.fbclid);
}

function readFirstTouch(): FirstTouch | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as FirstTouch;
    if (!t || typeof t.at !== "number" || Date.now() - t.at > FIRST_TOUCH_TTL_MS) return null;
    return t;
  } catch { return null; }
}

function currentTouch(): FirstTouch {
  const w = win()!;
  const p = new URLSearchParams(w.location.search);
  return {
    at: Date.now(),
    landingPage: clip(w.location.pathname + w.location.search),
    utmSource: clip(p.get("utm_source")),
    utmMedium: clip(p.get("utm_medium")),
    utmCampaign: clip(p.get("utm_campaign")),
    gclid: clip(p.get("gclid")),
    fbclid: clip(p.get("fbclid")),
  };
}

/**
 * Persists the first-touch landing page and campaign parameters for 30 days. Call once per page load.
 * A stored touch without campaign data is replaced when a later visit carries UTMs or a click id,
 * so a direct visit followed by an ad click keeps the ad click.
 */
export function rememberFirstTouch(): FirstTouch | null {
  const w = win();
  if (!w) return null;
  try {
    const stored = readFirstTouch();
    const now = currentTouch();
    if (stored && (hasCampaignData(stored) || !hasCampaignData(now))) return stored;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(now));
    return now;
  } catch { return null; }
}

/** Everything the server needs to match a conversion back to the ad click. Safe to call anywhere; returns {} on the server. */
export function getAttribution(): Attribution {
  const w = win();
  if (!w) return {};
  const out: Attribution = { consent: readConsent() };
  try {
    const touch = rememberFirstTouch() ?? currentTouch();
    const ga = cookie("_ga"); // GA1.1.<client>.<timestamp> → <client>.<timestamp>
    if (ga) { const parts = ga.split("."); out.gaClientId = parts.length >= 4 ? parts.slice(2).join(".") : ga; }
    const fbp = cookie("_fbp"); if (fbp) out.fbp = fbp;
    const fbc = cookie("_fbc") ?? (touch.fbclid ? `fb.1.${touch.at}.${touch.fbclid}` : undefined); if (fbc) out.fbc = clip(fbc);
    if (touch.gclid) out.gclid = touch.gclid;
    if (touch.fbclid) out.fbclid = touch.fbclid;
    if (touch.utmSource) out.utmSource = touch.utmSource;
    if (touch.utmMedium) out.utmMedium = touch.utmMedium;
    if (touch.utmCampaign) out.utmCampaign = touch.utmCampaign;
    if (touch.landingPage) out.landingPage = touch.landingPage;
    const ua = clip(navigator.userAgent); if (ua) out.userAgent = ua;
  } catch { /* ignore */ }
  return out;
}
