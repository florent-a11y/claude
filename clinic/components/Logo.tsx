import { site } from "@/lib/config";

/** Droplet mark in a rounded tile, with the brand name beside it. The name comes from lib/config.ts. */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="#06201f" />
      <path d="M20 8.500c4.700 5.500 7.200 9.500 7.200 13.200a7.200 7.200 0 0 1-14.400 0c0-3.700 2.500-7.700 7.200-13.200Z" fill="#d2f44d" />
      <path d="M20 26.500v-8.500M20 23c1.900-.300 3.100-1.500 3.700-3.300" fill="none" stroke="#06201f" strokeWidth="1.600" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="text-[1.45rem] font-bold leading-none" style={{ letterSpacing: "-0.04em" }}>{site.name}</span>
    </span>
  );
}
