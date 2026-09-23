import { site, OFFICIAL_NOTE, OFFICIAL_PORTAL_HOST } from "@/lib/config";

/** Discreet one-line note pointing to the free official portal. Server component, styled only through className. */
export function OfficialNote({ className = "text-sm text-ink-500" }: { className?: string }) {
  const [before, after] = OFFICIAL_NOTE.split(OFFICIAL_PORTAL_HOST);
  return (
    <p className={className}>
      {before}
      <a href={site.officialPortal} target="_blank" rel="noopener nofollow" className="underline">{OFFICIAL_PORTAL_HOST}</a>
      {after}
    </p>
  );
}
