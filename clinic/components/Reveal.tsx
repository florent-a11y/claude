"use client";
import { createElement, useEffect, useRef, useState } from "react";

/** One observer for the whole page: each element is shown once, the first time it scrolls into view. */
let observer: IntersectionObserver | null = null;
const pending = new WeakMap<Element, () => void>();

function watch(el: Element, show: () => void) {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        pending.get(entry.target)?.();
        pending.delete(entry.target);
        observer?.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -7% 0px", threshold: 0.06 },
  );
  pending.set(el, show);
  observer.observe(el);
}

type Variant = "rise" | "scale" | "left" | "right" | "fade";

/**
 * Fades and slides its content in when it scrolls into view. `index` staggers neighbours (cards in a grid).
 * The hidden state lives in CSS and only applies when scripts run and the visitor has not asked for reduced
 * motion, so without JavaScript the content is simply there.
 */
export function Reveal({ children, className = "", index = 0, variant = "rise", as = "div" }: { children: React.ReactNode; className?: string; index?: number; variant?: Variant; as?: "div" | "li" | "section" | "span" }) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) { setShown(true); return; }
    watch(el, () => setShown(true));
    return () => { pending.delete(el); observer?.unobserve(el); };
  }, []);

  return createElement(as, { ref, className: `reveal reveal-${variant} ${shown ? "in" : ""} ${className}`, style: { "--i": index } as React.CSSProperties }, children);
}
