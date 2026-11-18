"use client";
import { useEffect, useState } from "react";

/** The floating navigation bar. It gains a shadow and a more solid background once the page has scrolled. */
export function HeaderFrame({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div data-scrolled={scrolled}
      className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 rounded-full border border-mist-200/80 bg-white/70 pl-2.5 pr-1.5 backdrop-blur-xl transition-[box-shadow,background-color,border-color] duration-300 data-[scrolled=true]:border-mist-200 data-[scrolled=true]:bg-white/90 data-[scrolled=true]:shadow-[0_14px_34px_-16px_rgba(6,32,31,0.32)] sm:gap-4 sm:pl-4 sm:pr-2.5">
      {children}
    </div>
  );
}
