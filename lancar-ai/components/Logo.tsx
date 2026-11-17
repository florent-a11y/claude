/** Wordmark: three flowing lines (lancar = smooth, flowing) next to the name. */
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="10" className={light ? "fill-white/10" : "fill-ink-950"} />
        <path d="M7 12c3.3-3 6.7-3 10 0s6.7 3 10 0" fill="none" stroke="#f9bd3b" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M7 17.5c3.3-3 6.7-3 10 0s6.7 3 10 0" fill="none" stroke="#2bb3a6" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M7 23c3.3-3 6.7-3 10 0s6.7 3 10 0" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className={`text-xl font-extrabold tracking-tight ${light ? "text-white" : "text-ink-950"}`}>
        Lancar <span className={light ? "text-marigold-300" : "text-sea-600"}>AI</span>
      </span>
    </span>
  );
}
