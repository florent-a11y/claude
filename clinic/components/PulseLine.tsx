/** The brand motif: a heartbeat line ("nadi" is the pulse) that draws itself, pauses and repeats. Decorative. */
export function PulseLine({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 60" preserveAspectRatio="none" className={`pulse-line ${className}`} aria-hidden="true">
      <path pathLength={1} d="M0 30h190l14-18 16 34 18-44 20 52 14-24h70l10-12 12 22 12-10h224" fill="none" stroke="currentColor" strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
