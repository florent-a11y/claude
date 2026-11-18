/** Arched "window" onto rice terraces at sunrise. Pure SVG, so it stays sharp and weighs nothing.
 *  Swap for a photograph (same arch clip) when brand photography exists. */
export function HeroArt({ className = "", label }: { className?: string; label: string }) {
  return (
    <svg viewBox="0 0 480 600" className={className} role="img" aria-label={label}>
      <defs>
        <clipPath id="hero-arch"><path d="M0 600V240a240 240 0 0 1 480 0v360Z" /></clipPath>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3dcc6" />
          <stop offset="0.55" stopColor="#f6e9d8" />
          <stop offset="1" stopColor="#e9efe2" />
        </linearGradient>
        <radialGradient id="hero-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="0.6" stopColor="#fdf1dc" />
          <stop offset="1" stopColor="#f6dfc2" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g clipPath="url(#hero-arch)">
        <rect width="480" height="600" fill="url(#hero-sky)" />
        <circle cx="322" cy="214" r="120" fill="url(#hero-sun)" />
        <circle cx="322" cy="214" r="52" fill="#fffaf1" />
        {/* volcano and far hills */}
        <path d="M-20 372 96 300l40 22 92-104 34 20 30-12 84 96 60-30 84 60v248H-20Z" fill="#b9c8b0" opacity="0.75" />
        <path d="M-20 392c60-34 110-16 170-34s120-22 190-2 100 10 160-14v258H-20Z" fill="#a3b69a" />
        {/* terraces */}
        <path d="M-10 420c90-30 170 20 260-8s160-20 240 8v180H-10Z" fill="#8aa37f" />
        <path d="M-10 458c100-30 180 22 270-6s160-20 230 8v140H-10Z" fill="#6f8c72" />
        <path d="M-10 498c110-28 190 22 280-4s150-18 220 8v98H-10Z" fill="#557a67" />
        <path d="M-10 538c120-26 200 20 290-4s140-16 210 6v60H-10Z" fill="#3f6050" />
        <path d="M-10 574c130-22 210 16 300-4s130-12 200 4v26H-10Z" fill="#2f4a3d" />
        <g fill="none" stroke="#fbf8f2" strokeWidth="1" opacity="0.32">
          <path d="M-10 436c90-30 170 20 260-8s160-20 240 8" />
          <path d="M-10 474c100-30 180 22 270-6s160-20 230 8" />
          <path d="M-10 514c110-28 190 22 280-4s150-18 220 8" />
          <path d="M-10 554c120-26 200 20 290-4s140-16 210 6" />
        </g>
        {/* palm */}
        <g fill="none" stroke="#1c2f27" strokeLinecap="round">
          <path d="M64 600c6-96 22-176 50-252" strokeWidth="6" />
          <g strokeWidth="3.500">
            <path d="M114 348c30-34 72-40 110-22" />
            <path d="M114 348c20-50 58-74 98-74" />
            <path d="M114 348c-2-52 16-92 44-112" />
            <path d="M114 348c-22-44-52-62-88-60" />
            <path d="M114 348c-30-24-66-24-96-2" />
            <path d="M114 348c-18-50-44-80-74-98" />
          </g>
        </g>
      </g>
      <path d="M0.750 600V240a239.250 239.250 0 0 1 478.500 0v360" fill="none" stroke="#c2a56b" strokeWidth="1.500" />
    </svg>
  );
}
