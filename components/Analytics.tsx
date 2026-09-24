"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { rememberFirstTouch, trackPageView } from "@/lib/analytics-client";
import { onConsentChange, readConsent, type ConsentState } from "@/lib/consent";

/** Ids are inlined at build time. Only [A-Za-z0-9_-] is accepted so nothing can break out of the snippets. */
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const GA_ID = ID_RE.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "") ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID! : "";
const PIXEL_ID = ID_RE.test(process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "") ? process.env.NEXT_PUBLIC_META_PIXEL_ID! : "";

const CONSENT_DENIED = { ad_storage: "denied", analytics_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" } as const;
const CONSENT_GRANTED = { ad_storage: "granted", analytics_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" } as const;

type TagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; fbq?: ((...args: unknown[]) => void) & Record<string, unknown>; _fbq?: unknown };

let tagsLoaded = false;

/**
 * Injects gtag.js and the Meta pixel. Called only once consent is granted (Google Consent Mode v2, "basic"
 * implementation: nothing is requested from Google or Meta before the visitor accepts). The consent default
 * (all denied) is pushed before the config call, then updated to granted, as the Consent Mode docs require.
 */
function loadTags() {
  if (typeof window === "undefined") return;
  const w = window as TagWindow;
  if (tagsLoaded) {
    // Consent withdrawn then granted again in the same session: the scripts are already there.
    try { w.gtag?.("consent", "update", CONSENT_GRANTED); } catch { /* ignore */ }
    try { w.fbq?.("consent", "grant"); } catch { /* ignore */ }
    return;
  }
  tagsLoaded = true;
  if (GA_ID) {
    w.dataLayer = w.dataLayer || [];
    // gtag.js expects the `arguments` object itself on the dataLayer, not an array.
    // eslint-disable-next-line prefer-rest-params
    const gtag = function () { w.dataLayer!.push(arguments); } as (...args: unknown[]) => void;
    w.gtag = gtag;
    gtag("consent", "default", CONSENT_DENIED);
    gtag("consent", "update", CONSENT_GRANTED);
    gtag("js", new Date());
    gtag("config", GA_ID, { send_page_view: true, anonymize_ip: true });
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
  }
  if (PIXEL_ID && !w.fbq) {
    // Standard Meta pixel base code, without the inline <script>.
    const n = function (this: unknown) {
      // eslint-disable-next-line prefer-rest-params
      const args = arguments;
      if (n.callMethod) (n.callMethod as (...a: unknown[]) => void).apply(n, Array.from(args));
      else (n.queue as unknown[]).push(args);
    } as TagWindow["fbq"] & Record<string, unknown>;
    w.fbq = n;
    if (!w._fbq) w._fbq = n;
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
    n("init", PIXEL_ID);
    n("track", "PageView");
  }
}

/** Visitor withdrew consent after the tags were loaded: stop measurement for the rest of the session. */
function revokeTags() {
  if (!tagsLoaded) return;
  const w = window as TagWindow;
  try { w.gtag?.("consent", "update", CONSENT_DENIED); } catch { /* ignore */ }
  try { w.fbq?.("consent", "revoke"); } catch { /* ignore */ }
}

/**
 * GA4 (gtag.js) and Meta pixel, rendered once in the root layout. Renders nothing; the tags are injected from
 * an effect the moment consent is granted (on load when a decision is stored, or when the visitor clicks
 * "Accept" later in the session, without a reload). Client-side navigations are tracked here.
 */
export function Analytics() {
  const pathname = usePathname();
  const first = useRef(true);
  const [consent, setConsent] = useState<ConsentState>("unknown");
  const enabled = Boolean(GA_ID || PIXEL_ID);

  useEffect(() => { rememberFirstTouch(); }, []);
  useEffect(() => {
    setConsent(readConsent());
    return onConsentChange(setConsent);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    if (consent === "granted") loadTags();
    else if (consent === "denied") revokeTags();
  }, [consent, enabled]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (enabled && consent === "granted") trackPageView(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
