/**
 * Illustrated key visual: a Kecak performance in the cliff-top amphitheatre at Uluwatu, Bali, at sunset.
 * Sky from deep indigo to orange, the sun half-set over the sea, a ring of seated dancers with raised
 * arms around the fire torch, a candi bentar (split gate) and palms on the right.
 *
 * Pure SVG (2400×1200, 2:1). It is rendered once to `public/hero.jpg` by `scripts/render-hero.tsx` and
 * also serves as the inline fallback in `HeroBackdrop` when that image fails to load, so keep it
 * self-contained: no external fonts, images or CSS classes. All geometry is deterministic.
 *
 * Composition notes: the action (sun, fire, dancers, gate) sits in the lower third so it stays visible
 * below the hero copy and price card on desktop, and the right two thirds carry the scene so a
 * right-anchored crop still reads on phones.
 */

const W = 2400;
const H = 1200;
const HORIZON = 900;
const RING = { cx: 1250, cy: 1062, rx: 640, ry: 108 };

/** Small deterministic PRNG so the star field and dancer jitter are identical on every render. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STARS = (() => {
  const r = rng(7);
  return Array.from({ length: 70 }, () => ({ x: Math.round(r() * W), y: Math.round(r() * 460), s: +(0.8 + r() * 1.6).toFixed(1), o: +(0.25 + r() * 0.6).toFixed(2) }));
})();

/** Dancers on the ellipse, sorted back to front; scale grows with y for perspective. */
const DANCERS = (() => {
  const r = rng(21);
  const n = 46;
  const list = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.1;
    const x = RING.cx + RING.rx * Math.cos(t) * (0.97 + r() * 0.06);
    const y = RING.cy + RING.ry * Math.sin(t);
    const depth = (Math.sin(t) + 1) / 2; // 0 = far side, 1 = near side
    const s = 0.5 + depth * 0.55;
    list.push({ x: Math.round(x), y: Math.round(y), s: +s.toFixed(3), v: r() < 0.4 ? 1 : 0, rot: +((r() - 0.5) * 10).toFixed(1) });
  }
  return list.sort((a, b) => a.y - b.y);
})();

/** One half of a candi bentar, built from tiers [width, height] bottom-up. Origin at the inner base corner. */
function gateHalf(tiers: Array<[number, number]>) {
  let y = 0;
  let d = "M0 0";
  for (const [w, h] of tiers) {
    d += `H-${w}V${-(y + h)}`;
    y += h;
  }
  return d + "H0Z";
}
const GATE_HALF = gateHalf([
  [132, 40], [98, 72], [124, 20], [88, 70], [112, 20], [76, 64], [98, 20], [62, 56], [82, 18],
  [50, 40], [62, 14], [40, 34], [50, 12], [30, 28], [36, 10], [20, 26], [24, 8], [12, 22],
]);

/** Palm frond: a curved tapered leaf, drawn from the crown outwards along +x, rotated per frond. */
const FROND = "M0 0C40-26 100-30 168 6C110 4 60 12 0 0Z";
const PALM_FRONDS = [-150, -120, -92, -64, -36, -10, 16, 42];

/** Ground edge of the amphitheatre (cliff top), left to right; the rim highlight reuses it. */
const EDGE = "C140 1050 260 1020 420 1004C560 989 700 976 900 968C1300 960 1900 956 2400 954";

export function HeroScene({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#131a45" />
          <stop offset="0.32" stopColor="#3b2f68" />
          <stop offset="0.54" stopColor="#8c4a5f" />
          <stop offset="0.65" stopColor="#cc5d3a" />
          <stop offset="0.71" stopColor="#ef8d46" />
          <stop offset="0.75" stopColor="#f9c67c" />
        </linearGradient>
        <radialGradient id="hs-glow" cx="1560" cy={HORIZON} r="620" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd08a" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="#ffab5c" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff9a4a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hs-rays" cx="1560" cy={HORIZON} r="1000" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe7b8" stopOpacity="0.09" />
          <stop offset="0.45" stopColor="#ffe7b8" stopOpacity="0.03" />
          <stop offset="1" stopColor="#ffe7b8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hs-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff7dc" />
          <stop offset="0.7" stopColor="#ffe3a3" />
          <stop offset="1" stopColor="#ffc879" />
        </radialGradient>
        <linearGradient id="hs-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1a45c" />
          <stop offset="0.35" stopColor="#b3605a" />
          <stop offset="1" stopColor="#3a3260" />
        </linearGradient>
        <radialGradient id="hs-reflect" cx="0.5" cy="0.15" r="0.75">
          <stop offset="0" stopColor="#fff0c8" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#ffd08a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffd08a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hs-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e3d33" />
          <stop offset="1" stopColor="#051f19" />
        </linearGradient>
        <linearGradient id="hs-gate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a7a60" />
          <stop offset="0.5" stopColor="#0c4a3a" />
          <stop offset="1" stopColor="#062a22" />
        </linearGradient>
        <radialGradient id="hs-fire" cx="1250" cy="1000" r="420" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffb457" stopOpacity="0.85" />
          <stop offset="0.3" stopColor="#ff9a3c" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff8a2a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hs-flame" cx="0.5" cy="0.75" r="0.6">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.5" stopColor="#ffcf6a" />
          <stop offset="1" stopColor="#ff8f3a" />
        </radialGradient>
        <filter id="hs-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.16 0" />
        </filter>
        {/* Seated Kecak dancer, back to the viewer, arms raised. Origin at the ground beneath the hips. */}
        <g id="hs-d0" fill="#04201a">
          <path d="M-36 0C-38-16-28-26-14-28H14C28-26 38-16 36 0Z" />
          <path d="M-17-26C-19-42-20-56-19-68H19C20-56 19-42 17-26Z" />
          <circle cx="0" cy="-80" r="12.5" />
          <path d="M-20-63L-11-59-32-108-42-113Z" />
          <path d="M20-63L11-59 32-108 42-113Z" />
          <g stroke="#04201a" strokeWidth="3.2" strokeLinecap="round">
            <path d="M-40-113l-8-8M-40-113l-1-11M-40-113l8-6M40-113l8-8M40-113l1-11M40-113l-8-6" />
          </g>
        </g>
        <g id="hs-d1" fill="#04201a">
          <path d="M-36 0C-38-16-28-26-14-28H14C28-26 38-16 36 0Z" />
          <path d="M-17-26C-19-42-20-56-19-68H19C20-56 19-42 17-26Z" />
          <circle cx="0" cy="-80" r="12.5" />
          <path d="M-19-64L-10-61-14-116-23-118Z" />
          <path d="M19-64L10-61 14-116 23-118Z" />
          <g stroke="#04201a" strokeWidth="3.2" strokeLinecap="round">
            <path d="M-20-118l-9-4M-20-118l-3-10M-20-118l6-8M20-118l9-4M20-118l3-10M20-118l-6-8" />
          </g>
        </g>
        <g id="hs-palm">
          <path d="M-14 0C-10-120-4-260 22-400L38-400C16-262 12-122 14 0Z" />
          {PALM_FRONDS.map((a) => (
            <path key={a} d={FROND} transform={`translate(30 -400) rotate(${a})`} />
          ))}
        </g>
      </defs>

      {/* sky, stars, glow, rays, clouds, sun */}
      <rect width={W} height={H} fill="url(#hs-sky)" />
      {STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#fff" opacity={s.o} />
      ))}
      <rect width={W} height={H} fill="url(#hs-glow)" />
      <g fill="url(#hs-rays)">
        <path d={`M1560 ${HORIZON}L200-60H420Z`} />
        <path d={`M1560 ${HORIZON}L980-140H1120Z`} />
        <path d={`M1560 ${HORIZON}L1700-160H1820Z`} />
        <path d={`M1560 ${HORIZON}L2380-40H2520Z`} />
        <path d={`M1560 ${HORIZON}L2600 420V530Z`} />
      </g>
      <g fill="#ffd9a3" opacity="0.5">
        <path d="M300 760C420 750 640 752 760 760C640 768 420 768 300 760Z" />
        <path d="M980 804C1080 796 1240 798 1330 806C1240 814 1080 814 980 804Z" />
        <path d="M1720 760C1830 752 2010 754 2120 764C2010 772 1830 770 1720 760Z" />
        <path d="M1200 720C1290 714 1420 716 1490 722C1420 728 1290 728 1200 720Z" />
      </g>
      <g fill="#5a3a5c" opacity="0.55">
        <path d="M600 820C740 810 980 812 1120 822C980 830 740 830 600 820Z" />
        <path d="M1800 830C1900 824 2100 826 2200 834C2100 840 1900 840 1800 830Z" />
      </g>
      <circle cx="1560" cy={HORIZON} r="96" fill="url(#hs-sun)" />
      <g fill="none" stroke="#3a2a48" strokeWidth="3" strokeLinecap="round" opacity="0.6">
        <path d="M1310 620q12-12 24 0q12-12 24 0" />
        <path d="M1372 588q9-9 18 0q9-9 18 0" />
        <path d="M1255 660q9-9 18 0q9-9 18 0" />
      </g>

      {/* sea with the sun's reflection, distant headlands on the left */}
      <rect x="0" y={HORIZON} width={W} height={H - HORIZON} fill="url(#hs-sea)" />
      <ellipse cx="1560" cy="965" rx="110" ry="150" fill="url(#hs-reflect)" opacity="0.85" />
      <g fill="#ffe4b0" opacity="0.28">
        <rect x="1470" y="936" width="180" height="4" rx="2" />
        <rect x="1430" y="958" width="260" height="5" rx="2.5" />
        <rect x="1390" y="984" width="330" height="6" rx="3" />
      </g>
      <path d={`M0 ${HORIZON}V830C120 816 260 808 380 836C470 856 560 872 700 886C780 894 900 898 1050 ${HORIZON}Z`} fill="#2a2350" opacity="0.9" />
      <path d={`M0 ${HORIZON}V860C90 852 180 848 260 864C330 878 420 890 560 ${HORIZON}Z`} fill="#1a1a3c" />

      {/* amphitheatre ground on the cliff top, with a lit rim */}
      <path d={`M0 1200V1080${EDGE}V1200Z`} fill="url(#hs-ground)" />
      <path d={`M0 1080${EDGE}V962C1900 964 1300 968 900 976C700 984 560 997 420 1012C260 1028 140 1058 0 1088Z`} fill="#1d5c4b" opacity="0.6" />

      {/* candi bentar and palms on the right */}
      <g fill="url(#hs-gate)">
        <path d={GATE_HALF} transform="translate(2000 1000) scale(0.62)" />
        <path d={GATE_HALF} transform="translate(2036 1000) scale(-0.62 0.62)" />
        <rect x="1900" y="994" width="236" height="10" rx="3" />
      </g>
      <g fill="#062b23">
        <use href="#hs-palm" transform="translate(2300 1010) scale(0.92) rotate(-6)" />
        <use href="#hs-palm" transform="translate(2180 1004) scale(0.58) rotate(10)" />
      </g>

      {/* fire glow, far side of the ring, torch, near side of the ring */}
      <rect width={W} height={H} fill="url(#hs-fire)" />
      {DANCERS.filter((d) => d.y < RING.cy).map((d, i) => (
        <use key={i} href={`#hs-d${d.v}`} transform={`translate(${d.x} ${d.y}) scale(${d.s}) rotate(${d.rot})`} />
      ))}
      <g transform={`translate(1250 ${RING.cy})`}>
        <path d="M-6 0V-120H6V0Z M-64-84H64V-76H-64Z M-48-118H48V-110H-48Z M-30-150H30V-142H-30Z" fill="#04201a" />
        {[-64, 64, -48, 48, -30, 30, 0].map((x, i) => {
          const y = i < 2 ? -84 : i < 4 ? -118 : i < 6 ? -150 : -170;
          return <path key={i} d={`M${x - 9} ${y}C${x - 12} ${y - 22} ${x - 3} ${y - 30} ${x} ${y - 44}C${x + 3} ${y - 30} ${x + 12} ${y - 22} ${x + 9} ${y}Z`} fill="url(#hs-flame)" />;
        })}
      </g>
      {DANCERS.filter((d) => d.y >= RING.cy).map((d, i) => (
        <use key={i} href={`#hs-d${d.v}`} transform={`translate(${d.x} ${d.y}) scale(${d.s}) rotate(${d.rot})`} />
      ))}

      {/* foreground foliage in the corners */}
      <g fill="#041b16">
        <path d="M1980 1200C2010 1120 2080 1090 2140 1110C2180 1050 2280 1040 2330 1090C2370 1070 2400 1085 2400 1110V1200Z" />
        <path d="M0 1200V1120C40 1100 90 1112 120 1140C150 1108 220 1110 250 1150C280 1140 310 1160 320 1200Z" />
      </g>

      {/* film grain */}
      <rect width={W} height={H} filter="url(#hs-grain)" opacity="0.35" style={{ mixBlendMode: "overlay" }} />
    </svg>
  );
}
