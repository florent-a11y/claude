import { useTranslations } from "next-intl";
import { site, OFFICIAL_PORTAL_HOST } from "@/lib/config";

/** Discreet one-line note pointing to the free official portal. Text lives under OfficialNote.text
 *  (the English source is OFFICIAL_NOTE in lib/config.ts, kept for server and email use). */
export function OfficialNote({ className = "text-sm text-ink-500" }: { className?: string }) {
  const t = useTranslations("OfficialNote");
  return (
    <p className={className}>
      {t.rich("text", {
        host: OFFICIAL_PORTAL_HOST,
        link: (chunks) => <a href={site.officialPortal} target="_blank" rel="noopener nofollow" className="underline">{chunks}</a>,
      })}
    </p>
  );
}
