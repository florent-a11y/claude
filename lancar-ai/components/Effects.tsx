"use client";

import { useEffect } from "react";
import { usePathname } from "@/i18n/navigation";

declare global {
  interface Window {
    __effectsReady?: boolean;
  }
}

/**
 * Page-wide motion that needs JavaScript, mounted once in the layout:
 * - reveals `.reveal` blocks as they scroll into view (re-scanned after each navigation);
 * - moves the light on `.glow-card` elements to follow the pointer.
 * The matching styles are in app/globals.css.
 */
export function Effects() {
  const pathname = usePathname();

  useEffect(() => {
    window.__effectsReady = true;
    const pending = document.querySelectorAll<HTMLElement>(".reveal:not(.is-visible)");
    if (!("IntersectionObserver" in window)) {
      pending.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    pending.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    const onMove = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest?.<HTMLElement>(".glow-card");
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - box.left}px`);
      card.style.setProperty("--my", `${event.clientY - box.top}px`);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  return null;
}

/**
 * Runs before the first paint: marks the document as script-enabled so `.reveal` blocks start hidden, and
 * undoes that if the page script has not taken over after three seconds, so content can never stay invisible.
 */
export const REVEAL_BOOTSTRAP = `document.documentElement.classList.add("js");setTimeout(function(){if(!window.__effectsReady)document.documentElement.classList.remove("js")},3000);`;
