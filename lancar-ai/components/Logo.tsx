/** Wordmark: three flowing lines (lancar = smooth, flowing) next to the name. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <rect x="0.5" y="0.5" width="33" height="33" rx="10" fill="#152552" stroke="#dcb64a" strokeOpacity="0.55" />
        <path d="M7 12c3.3-3 6.7-3 10 0s6.7 3 10 0" fill="none" stroke="#ecd27f" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M7 17.5c3.3-3 6.7-3 10 0s6.7 3 10 0" fill="none" stroke="#5f8fff" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M7 23c3.3-3 6.7-3 10 0s6.7 3 10 0" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="text-xl font-extrabold tracking-tight text-white">
        Lancar <span className="text-gold">AI</span>
      </span>
    </span>
  );
}
