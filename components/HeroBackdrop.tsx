"use client";
import { useState } from "react";
import { preload } from "react-dom";
import { HeroScene } from "./HeroScene";

/** Responsive candidates for the Kecak photo (public/): JPEG originals and WebP re-encodes (about half the bytes).
 *  Phones and small tablets get the 1200×600 variant; from ~1200 CSS px (or high-DPI laptops) the 2400×1200 one. */
const JPEG_SRCSET = "/hero-1200.jpg 1200w, /hero.jpg 2400w";
const WEBP_SRCSET = "/hero-1200.webp 1200w, /hero.webp 2400w";
const SIZES = "100vw";

/**
 * Decorative backdrop for the hero sections (home, e-VOA, reminder): the Kecak photo
 * key visual with a readability overlay on the copy side. Purely presentational (aria-hidden, no
 * pointer events). Use inside a `relative overflow-hidden` section as its first child; give the content
 * `relative` and enough bottom padding (see the pages) so the lower band of the picture stays visible.
 *
 * Image source, in order:
 *   1. `/hero.jpg` (public/hero.jpg, 2400×1200): a licensed photo of a Kecak performance in Bali by
 *      Jakub Hałun, Wikimedia Commons, CC BY-SA 4.0 (attribution in the footer, link in lib/config.ts
 *      `heroPhotoUrl`). To swap it, replace the file with a 2400×1200 JPEG (quality ~75, under 400 KB,
 *      subject in the right two thirds so the left-side fade keeps the copy readable), regenerate the
 *      phone/WebP variants (public/hero-1200.jpg 1200×600 q75, public/hero.webp, public/hero-1200.webp,
 *      all from the same crop, e.g. with Pillow) and update the credit. The files are served with a
 *      one-year immutable cache (next.config.ts), so a new picture also needs new file names.
 *      The illustrated version lives in public/hero-illustrated.jpg (scripts/render-hero.tsx).
 *   2. If the image fails to load, the inline SVG scene renders instead, so the hero never goes blank.
 *
 * Performance: with `priority` (pages where the photo is the LCP element) the image is loaded eagerly with
 * fetchpriority=high and announced with a `<link rel="preload" as="image">` (React's `preload`, emitted into
 * <head> during SSR) so the browser starts the download before it has parsed the hero markup.
 *
 * Layout: on phones the picture is a band at the bottom of the section (the hero stacks copy, then the
 * card, then the picture); from `md` it covers the whole section and the overlay fades the left side
 * to white so the text keeps ≥ 4.5:1 contrast.
 */
export function HeroBackdrop({ priority = false }: { priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (priority) {
    // Only from `md`, where the photo covers the hero and is the largest element in the first viewport. On phones it
    // is a band below the fold, and a preload there would compete with the stylesheet and the heading (the LCP element).
    // Browsers without WebP ignore a preload whose `type` they cannot decode and fetch the JPEG normally.
    preload("/hero.webp", { as: "image", type: "image/webp", fetchPriority: "high", imageSrcSet: WEBP_SRCSET, imageSizes: SIZES, media: "(min-width: 768px)" });
  }
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      {/* base wash so the section never flashes pure white while the image arrives */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-50 via-white to-[#fbead8]" />
      <div className="absolute inset-x-0 bottom-0 h-72 md:inset-0 md:h-auto">
        {failed ? (
          <HeroScene className="h-full w-full" />
        ) : (
          // Plain <picture>/<img>: static, pre-sized assets that must not be re-encoded per request.
          <picture>
            <source type="image/webp" srcSet={WEBP_SRCSET} sizes={SIZES} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero.jpg"
              srcSet={JPEG_SRCSET}
              sizes={SIZES}
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
          </picture>
        )}
        {/* feather the top of the band into the page on phones */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white to-white/0 md:hidden" />
      </div>
      {/* readability overlay: top-down on phones, left-to-right from md */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-white/70 via-45% to-white/0 md:bg-gradient-to-r md:from-white md:from-34% md:via-white/88 md:via-54% md:to-white/0 md:to-88%" />
    </div>
  );
}
