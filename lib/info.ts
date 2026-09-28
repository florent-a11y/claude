/** SEO landing articles served under /info/<slug> (same English slugs in every locale).
 *  Content lives in the Landing namespace of messages/<locale>.json. */
export const INFO_SLUGS = ["bali-arrival-card", "jakarta-arrival-card", "arrival-card-for-families", "arrival-card-requirements", "arrival-card-vs-evoa-vs-customs"] as const;
export type InfoSlug = (typeof INFO_SLUGS)[number];

/** Short link label per slug (key in the Footer namespace), shared by the footer and the "related guides" blocks. */
export const INFO_LABEL_KEYS: Record<InfoSlug, string> = {
  "bali-arrival-card": "infoBali",
  "jakarta-arrival-card": "infoJakarta",
  "arrival-card-for-families": "infoFamilies",
  "arrival-card-requirements": "infoRequirements",
  "arrival-card-vs-evoa-vs-customs": "infoCompare",
};

export function isInfoSlug(slug: string): slug is InfoSlug {
  return (INFO_SLUGS as readonly string[]).includes(slug);
}

/** Bali provincial tourist levy (IDR per foreign visitor), collected separately from the arrival card. */
export const BALI_LEVY_IDR = 150_000;
export const BALI_LEVY_URL = "https://lovebali.baliprov.go.id/";
