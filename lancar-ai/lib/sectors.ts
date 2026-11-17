import type { AppLocale } from "@/i18n/routing";
import type { PersonaId } from "./demo";

export const SECTOR_IDS = ["hospitality", "food", "services", "trading"] as const;
export type SectorId = (typeof SECTOR_IDS)[number];

/** URL slug per language, and the demo business that illustrates each sector. */
export const SECTORS: Record<SectorId, { slug: Record<AppLocale, string>; persona: PersonaId }> = {
  hospitality: { slug: { en: "hospitality-wellness", id: "perhotelan-spa" }, persona: "spa" },
  food: { slug: { en: "restaurants-retail", id: "restoran-retail" }, persona: "restaurant" },
  services: { slug: { en: "clinics-services", id: "klinik-jasa" }, persona: "clinic" },
  trading: { slug: { en: "trading-manufacturing", id: "dagang-manufaktur" }, persona: "supplier" },
};

/** The sector a slug belongs to in the given language, or undefined. */
export function sectorBySlug(slug: string, locale: AppLocale): SectorId | undefined {
  return SECTOR_IDS.find((id) => SECTORS[id].slug[locale] === slug);
}

/** A slug typed in the other language (after switching language on a sector page) still finds its sector. */
export function sectorByAnySlug(slug: string): SectorId | undefined {
  return SECTOR_IDS.find((id) => Object.values(SECTORS[id].slug).includes(slug));
}
