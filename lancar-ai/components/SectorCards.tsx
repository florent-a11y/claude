import { ArrowRight, Factory, Flower2, Stethoscope, UtensilsCrossed } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { Dictionary } from "@/content";
import { SECTORS, SECTOR_IDS, type SectorId } from "@/lib/sectors";

export const SECTOR_ICONS = { hospitality: Flower2, food: UtensilsCrossed, services: Stethoscope, trading: Factory };

export function SectorCards({ dict, locale, exclude }: { dict: Dictionary; locale: AppLocale; exclude?: SectorId }) {
  const ids = SECTOR_IDS.filter((id) => id !== exclude);
  return (
    <div className={`grid gap-5 sm:grid-cols-2 ${ids.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
      {ids.map((id) => {
        const item = dict.sectors.items[id];
        const Icon = SECTOR_ICONS[id];
        return (
          <Link
            key={id}
            href={{ pathname: "/sectors/[slug]", params: { slug: SECTORS[id].slug[locale] } }}
            className="card group flex flex-col transition hover:-translate-y-0.5 hover:border-sea-400 hover:shadow-lg hover:shadow-ink-950/5"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-marigold-200 text-ink-950">
              <Icon size={24} aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-xl font-bold text-ink-950">{item.name}</h3>
            <p className="mt-2 flex-1 leading-relaxed text-ink-600">{item.short}</p>
            <span className="mt-5 inline-flex items-center gap-1.5 font-bold text-sea-700">
              {dict.common.learnMore}
              <ArrowRight size={18} aria-hidden="true" className="transition group-hover:translate-x-1" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
