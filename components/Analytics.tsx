"use client";
import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { rememberFirstTouch, trackPageView } from "@/lib/analytics-client";

/** Ids are inlined at build time. Only [A-Za-z0-9_-] is accepted so nothing can break out of the inline snippets. */
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const GA_ID = ID_RE.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "") ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID! : "";
const PIXEL_ID = ID_RE.test(process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "") ? process.env.NEXT_PUBLIC_META_PIXEL_ID! : "";

/**
 * GA4 (gtag.js) and Meta pixel, rendered once in the root layout. Renders nothing when the ids are not set.
 * The initial page_view / PageView comes from the base snippets; client-side navigations are tracked here.
 */
export function Analytics() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => { rememberFirstTouch(); }, []);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (GA_ID || PIXEL_ID) trackPageView(pathname);
  }, [pathname]);

  if (!GA_ID && !PIXEL_ID) return null;
  return (
    <>
      {GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}',{send_page_view:true,anonymize_ip:true});`}</Script>
        </>
      )}
      {PIXEL_ID && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView');`}</Script>
          <noscript><img height="1" width="1" style={{ display: "none" }} alt="" src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`} /></noscript>
        </>
      )}
    </>
  );
}
