import { CalendarCheck, Users } from "lucide-react";
import type { Dictionary } from "@/content";
import { AUDIT_TIERS, formatIdr } from "@/lib/config";

/** The three audit prices, by company size. */
export function AuditTiers({ dict, locale }: { dict: Dictionary; locale: string }) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {AUDIT_TIERS.map((tier) => {
        const labels = dict.pricing.audit.tiers[tier.id];
        return (
          <div key={tier.id} className="card flex flex-col">
            <h3 className="text-lg font-bold text-ink-950">{labels.name}</h3>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink-950">{formatIdr(tier.priceIdr, locale)}</p>
            <ul className="mt-5 space-y-2.5 text-ink-700">
              <li className="flex items-center gap-2.5">
                <Users size={18} aria-hidden="true" className="shrink-0 text-sea-600" />
                {labels.staff}
              </li>
              <li className="flex items-center gap-2.5">
                <CalendarCheck size={18} aria-hidden="true" className="shrink-0 text-sea-600" />
                {labels.visit}
              </li>
            </ul>
          </div>
        );
      })}
    </div>
  );
}
