"use client";
import { useState } from "react";
import { HeroScene } from "./HeroScene";

/**
 * Decorative backdrop for the hero sections (home, e-VOA, reminder): the illustrated Kecak-at-Uluwatu
 * key visual with a readability overlay on the copy side. Purely presentational (aria-hidden, no
 * pointer events). Use inside a `relative overflow-hidden` section as its first child; give the content
 * `relative` and enough bottom padding (see the pages) so the lower band of the picture stays visible.
 *
 * Image source, in order:
 *   1. `/hero.jpg` (public/hero.jpg, 2400×1200) — generated from components/HeroScene.tsx by
 *      `scripts/render-hero.tsx`. To swap in a licensed photo, overwrite that file with a 2400×1200 JPEG
 *      (quality ~75, under 350 KB, subject in the right two thirds and lower half so the crops work),
 *      re-run the script only for og.png if you want it to match, and add any attribution the licence
 *      requires (for example in the footer).
 *   2. If the image fails to load, the inline SVG scene renders instead, so the hero never goes blank.
 *
 * Layout: on phones the picture is a band at the bottom of the section (the hero stacks copy, then the
 * card, then the picture); from `md` it covers the whole section and the overlay fades the left side
 * to white so the text keeps ≥ 4.5:1 contrast.
 */
export function HeroBackdrop({ priority = false }: { priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      {/* base wash so the section never flashes pure white while the image arrives */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-50 via-white to-[#fbead8]" />
      <div className="absolute inset-x-0 bottom-0 h-72 md:inset-0 md:h-auto">
        {failed ? (
          <HeroScene className="h-full w-full" />
        ) : (
          // Plain <img>: a static, pre-sized asset that must not be re-encoded per request.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/hero.jpg"
            alt=""
            width={2400}
            height={1200}
            loading={priority ? "eager" : undefined}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover object-right-bottom md:object-bottom"
          />
        )}
        {/* feather the top of the band into the page on phones */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white to-white/0 md:hidden" />
      </div>
      {/* readability overlay: top-down on phones, left-to-right from md */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-white/70 via-45% to-white/0 md:bg-gradient-to-r md:from-white md:from-34% md:via-white/88 md:via-54% md:to-white/0 md:to-88%" />
    </div>
  );
}
