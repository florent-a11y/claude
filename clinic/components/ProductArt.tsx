import type { Kind, Tone } from "@/lib/catalog";

/** [light, mid, line] colours per tone. */
const TONES: Record<Tone, [string, string, string]> = {
  sage: ["#e3eadd", "#bccab3", "#2f4a3d"],
  sand: ["#f5eddf", "#e2d2b8", "#6f5433"],
  clay: ["#f7e6da", "#e6bfa7", "#964f2e"],
  moss: ["#d8e1d2", "#a3b69a", "#1c2f27"],
  sea: ["#e0ebe8", "#b2cdc7", "#28524d"],
};

function Glyph({ kind }: { kind: Kind }) {
  switch (kind) {
    case "iv":
      return (
        <>
          <path d="M160 34v12" />
          <rect x="134" y="46" width="52" height="80" rx="15" />
          <path d="M134 94c9-6 17 6 26 0s17-6 26 0" />
          <path d="M160 126v20" />
          <rect x="154" y="146" width="12" height="17" rx="4" />
          <path d="M160 163v14" />
          <path d="M160 184c4.500 5.500 7 9 7 12.500a7 7 0 0 1-14 0c0-3.500 2.500-7 7-12.500Z" />
        </>
      );
    case "shot":
      return (
        <>
          <path d="M146 52h28M160 52v24" />
          <rect x="147" y="76" width="26" height="72" rx="5" />
          <path d="M147 96h9M147 110h9M147 124h9" />
          <path d="M153 148h14l-3.500 11h-7Z" />
          <path d="M160 159v30" />
        </>
      );
    case "peptide":
      return (
        <>
          <rect x="145" y="50" width="30" height="13" rx="3.500" />
          <path d="M150 63v11c-8 4-13 10-13 19v64a11 11 0 0 0 11 11h24a11 11 0 0 0 11-11V93c0-9-5-15-13-19V63" />
          <path d="M137 112h46M137 140h46" />
          <circle cx="150" cy="126" r="3.500" /><circle cx="160" cy="126" r="3.500" /><circle cx="170" cy="126" r="3.500" />
        </>
      );
    case "supplement":
      return (
        <>
          <rect x="134" y="56" width="52" height="17" rx="5" />
          <path d="M139 73v7c-6 3-9 8-9 15v62a11 11 0 0 0 11 11h38a11 11 0 0 0 11-11V95c0-7-3-12-9-15v-7" />
          <rect x="141" y="104" width="38" height="38" rx="5" />
          <path d="M160 133c-6-3-8-9-6-16 6 1 9 5 9 11M160 133v-22" />
        </>
      );
    case "membership":
      return (
        <>
          <circle cx="160" cy="118" r="52" />
          <circle cx="160" cy="118" r="38" />
          <path d="M160 96c8 9.500 12 16 12 22a12 12 0 0 1-24 0c0-6 4-12.500 12-22Z" />
        </>
      );
  }
}

/** Illustrated panel used where a product photo will go. Replace with photography when it exists. */
export function ProductArt({ kind, tone, className = "" }: { kind: Kind; tone: Tone; className?: string }) {
  const [light, mid, line] = TONES[tone];
  const id = `${kind}-${tone}`;
  return (
    <svg viewBox="0 0 320 240" className={className} role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={mid} />
        </linearGradient>
      </defs>
      <rect width="320" height="240" fill={`url(#bg-${id})`} />
      <circle cx="252" cy="62" r="34" fill="#fff" opacity="0.38" />
      <g fill="none" stroke={line} strokeWidth="1" opacity="0.16">
        <path d="M-10 176c50-22 96 16 150-2s110-30 190-6" />
        <path d="M-10 194c50-22 96 16 150-2s110-30 190-6" />
        <path d="M-10 212c50-22 96 16 150-2s110-30 190-6" />
        <path d="M-10 230c50-22 96 16 150-2s110-30 190-6" />
      </g>
      <g fill="none" stroke={line} strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round">
        <Glyph kind={kind} />
      </g>
    </svg>
  );
}
