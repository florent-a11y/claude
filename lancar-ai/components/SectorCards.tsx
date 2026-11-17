import { ArrowUpRight, Factory, Flower2, Stethoscope, UtensilsCrossed } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { Dictionary } from "@/content";
import { SECTORS, SECTOR_IDS, type SectorId } from "@/lib/sectors";
import { delay } from "./Reveal";

export const SECTOR_ICONS = { hospitality: Flower2, food: UtensilsCrossed, services: Stethoscope, trading: Factory };

export function SectorCards({ dict, locale, exclude }: { dict: Dictionary; locale: AppLocale; exclude?: SectorId }) {
  const ids = SECTOR_IDS.filter((id) => id !== exclude);
  return (
    <div className={`grid gap-5 sm:grid-cols-2 ${ids.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
      {ids.map((id, index) => {
        const item = dict.sectors.items[id];
        const Icon = SECTOR_ICONS[id];
        return (
          <Link
            key={id}
            href={{ pathname: "/sectors/[slug]", params: { slug: SECTORS[id].slug[locale] } }}
            className="card glow-card reveal group flex flex-col"
            style={delay(index * 90)}
          >
            <div className="flex items-start justify-between">
              <span className="icon-chip-gold">
                <Icon size={24} aria-hidden="true" />
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-cloud-200 text-ink-600 transition duration-300 group-hover:border-gold-400 group-hover:bg-gold-400 group-hover:text-night-950">
                <ArrowUpRight size={18} aria-hidden="true" />
              </span>
            </div>
            <h3 className="mt-6 text-xl font-bold text-ink-900">{item.name}</h3>
            <p className="mt-2 flex-1 leading-relaxed text-ink-600">{item.short}</p>
            <span className="mt-5 font-bold text-azure-600 transition group-hover:text-azure-700">{dict.common.learnMore}</span>
          </Link>
        );
      })}
    </div>
  );
}
