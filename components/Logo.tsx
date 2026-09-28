/**
 * Brand mark: a candi bentar (Balinese split gate) in white on a rounded green badge, with the
 * setting sun in the gap and a thin flight path arcing over it. Wordmark set in the site font.
 *
 * - `variant="full"` (default): mark + wordmark, for the header and the OG image.
 * - `variant="mark"`: mark only, for tight spaces (footer, mobile) and the favicon (app/icon.svg is
 *   a simplified copy of this mark; keep them in sync when changing the geometry).
 * - `size`: mark height in px; the wordmark scales with it.
 */
export function LogoMark({ size = 36, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id="lg-badge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#13886a" />
          <stop offset="1" stopColor="#0a5c48" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lg-badge)" />
      {/* setting sun, cradled between the two pinnacles */}
      <circle cx="32" cy="15.5" r="6.5" fill="#f2833a" />
      {/* split gate: tiered left half, mirrored for the right half */}
      <g fill="#ffffff">
        <path id="lg-half" d="M9 50V44.5H12V40H10.5V37.5H14V33H12.5V30.5H16V26H14.5V23.5H15.5C15.5 18 19 14.5 24 11.5H27V50Z" />
        <use href="#lg-half" transform="matrix(-1 0 0 1 64 0)" />
      </g>
      {/* threshold */}
      <rect x="8" y="51.5" width="48" height="3" rx="1.5" fill="#ffffff" />
    </svg>
  );
}

export function Logo({ variant = "full", size = 36, className = "" }: { variant?: "full" | "mark"; size?: number; className?: string }) {
  if (variant === "mark") return <LogoMark size={size} className={className} />;
  const fontSize = Math.round(size * 0.5);
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} className="shrink-0" />
      <span className="flex flex-col whitespace-nowrap leading-none">
        <span className="font-semibold uppercase tracking-[0.18em] text-ink-500" style={{ fontSize: Math.round(size * 0.27) }}>Indonesia</span>
        {/* whitespace between the two lines so the text content reads "Indonesia Arrival Card Assist" (matches the header link's aria-label); a flex column never renders it */}
        {" "}
        <span className="mt-0.5 font-semibold tracking-tight text-brand-700" style={{ fontSize }}>
          Arrival Card <span className="text-accent-500">Assist</span>
        </span>
      </span>
    </span>
  );
}
