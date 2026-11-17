import { CalendarCheck, Users } from "lucide-react";
import type { Dictionary } from "@/content";
import { AUDIT_TIERS, formatIdr } from "@/lib/config";
import { Reveal } from "./Reveal";

/** The three audit prices, by company size. */
export function AuditTiers({ dict, locale }: { dict: Dictionary; locale: string }) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {AUDIT_TIERS.map((tier, index) => {
        const labels = dict.pricing.audit.tiers[tier.id];
        return (
          <Reveal key={tier.id} delay={index * 90} className="card glow-card flex flex-col">
            <h3 className="text-lg font-bold text-white">{labels.name}</h3>
            <p className="mt-3 text-3xl font-extrabold tracking-tight sm:text-[2rem]">
              <span className="text-gold">{formatIdr(tier.priceIdr, locale)}</span>
            </p>
            <ul className="mt-6 space-y-2.5 border-t border-white/10 pt-5 text-mist-300">
              <li className="flex items-center gap-2.5">
                <Users size={18} aria-hidden="true" className="shrink-0 text-azure-300" />
                {labels.staff}
              </li>
              <li className="flex items-center gap-2.5">
                <CalendarCheck size={18} aria-hidden="true" className="shrink-0 text-azure-300" />
                {labels.visit}
              </li>
            </ul>
          </Reveal>
        );
      })}
    </div>
  );
}
