import { site } from "@/lib/config";

/** Droplet-and-leaf mark with the brand name set in the display face. The name comes from lib/config.ts. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <path d="M20 7c5.2 6.1 8 10.5 8 14.6A8 8 0 0 1 12 21.6C12 17.5 14.8 13.1 20 7Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M20 30V17.5M20 24.5c2.4-.4 4-1.900 4.800-4.200M20 21.500c-2-.3-3.300-1.500-4-3.500" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="font-display text-[1.7rem] font-semibold leading-none tracking-[0.08em]">{site.name}</span>
    </span>
  );
}
