"use client";
import { useEffect, useRef, useState } from "react";

/** A number that counts up from zero the first time it is seen. The page is rendered with the final number, so it
 *  is correct without JavaScript; the count is skipped for visitors who prefer reduced motion. */
export function CountUp({ value, suffix = "", durationMs = 1400 }: { value: number; suffix?: string; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setShown(0);
    let frame = 0;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        setShown(Math.round(value * (1 - Math.pow(1 - t, 3)))); // ease-out
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(frame); };
  }, [value, durationMs]);

  return <span ref={ref} className="tabular-nums">{shown}{suffix}</span>;
}
