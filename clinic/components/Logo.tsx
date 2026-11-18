import { site } from "@/lib/config";

/** Droplet mark in a rounded tile, with the brand name beside it. The name comes from lib/config.ts. */
export function LogoMark({ className = "h-8 w-8 sm:h-9 sm:w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="#06201f" />
      <path d="M20 8.500c4.700 5.500 7.200 9.500 7.200 13.200a7.200 7.200 0 0 1-14.400 0c0-3.700 2.500-7.700 7.200-13.200Z" fill="#d2f44d" />
      <path d="M20 26.500v-8.500M20 23c1.900-.300 3.100-1.500 3.700-3.300" fill="none" stroke="#06201f" strokeWidth="1.600" strokeLinecap="round" />
    </svg>
  );
}

/** The name split around the letters to pick out ("Vita" + "nad" + "i"); the whole name when there is nothing to pick out. */
function nameParts(): [string, string, string] {
  const i = site.nameAccent ? site.name.toLowerCase().indexOf(site.nameAccent.toLowerCase()) : -1;
  if (i < 0) return [site.name, "", ""];
  return [site.name.slice(0, i), site.name.slice(i, i + site.nameAccent.length), site.name.slice(i + site.nameAccent.length)];
}

/** `onDark` switches the picked-out letters to the lime accent for dark backgrounds. */
export function Logo({ className = "", onDark = false }: { className?: string; onDark?: boolean }) {
  const [before, accent, after] = nameParts();
  return (
    <span className={`inline-flex items-center gap-2 sm:gap-2.5 ${className}`}>
      <LogoMark />
      <span className="text-[1.3rem] font-bold leading-none sm:text-[1.45rem]" style={{ letterSpacing: "-0.04em" }}>
        {before}{accent && <span className={onDark ? "text-lime-400" : "text-tide-600"}>{accent}</span>}{after}
      </span>
    </span>
  );
}
