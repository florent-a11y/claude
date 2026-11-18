/**
 * The product list. SAMPLE DATA: names, contents and prices are placeholders to be replaced with the real menu.
 *
 * Structure and prices live here; the wording (name, tagline, description, contents, unit) lives in
 * messages/<locale>.json under "Catalog.items.<slug>", in English first. A missing translation falls back to English.
 *
 *  - `rx: true`      a doctor reviews the health questionnaire before the customer can pay. Nothing ships before approval.
 *  - `session: true` given by a nurse (IV drip, injection): needs a place and a time slot instead of a parcel.
 */
export type Kind = "iv" | "shot" | "peptide" | "supplement" | "membership";
export type Goal = "hydration" | "recovery" | "energy" | "immunity" | "longevity" | "skin" | "metabolic" | "sleep";
export type Tone = "sage" | "sand" | "clay" | "moss" | "sea";

export interface Product {
  slug: string;
  kind: Kind;
  rx: boolean;
  session: boolean;
  priceIdr: number;
  goals: Goal[];
  /** Minutes in the chair (sessions only). */
  durationMin?: number;
  /** Delivered chilled in an insulated pouch. */
  coldChain?: boolean;
  featured?: boolean;
  tone: Tone;
}

const iv = (slug: string, priceIdr: number, durationMin: number, goals: Goal[], tone: Tone, extra: Partial<Product> = {}): Product =>
  ({ slug, kind: "iv", rx: false, session: true, priceIdr, durationMin, goals, tone, ...extra });
const shot = (slug: string, priceIdr: number, durationMin: number, goals: Goal[], tone: Tone): Product =>
  ({ slug, kind: "shot", rx: false, session: true, priceIdr, durationMin, goals, tone });
const peptide = (slug: string, priceIdr: number, goals: Goal[], tone: Tone, extra: Partial<Product> = {}): Product =>
  ({ slug, kind: "peptide", rx: true, session: false, priceIdr, goals, tone, coldChain: true, ...extra });
const supplement = (slug: string, priceIdr: number, goals: Goal[], tone: Tone): Product =>
  ({ slug, kind: "supplement", rx: false, session: false, priceIdr, goals, tone });
const membership = (slug: string, priceIdr: number, tone: Tone, extra: Partial<Product> = {}): Product =>
  ({ slug, kind: "membership", rx: false, session: false, priceIdr, goals: [], tone, ...extra });

export const PRODUCTS: Product[] = [
  // IV drips
  iv("iv-hydration", 850_000, 45, ["hydration", "energy"], "sea", { featured: true }),
  iv("iv-bali-belly", 1_250_000, 60, ["hydration", "recovery"], "sage"),
  iv("iv-morning-after", 1_100_000, 45, ["hydration", "recovery"], "sand"),
  iv("iv-immune", 1_300_000, 45, ["immunity"], "clay"),
  iv("iv-myers", 1_450_000, 45, ["energy", "immunity"], "moss", { featured: true }),
  iv("iv-athlete", 1_650_000, 60, ["recovery", "energy"], "sage"),
  iv("iv-glow", 1_750_000, 45, ["skin"], "sand"),
  iv("iv-nad-250", 4_200_000, 150, ["longevity", "energy"], "moss", { rx: true, featured: true }),
  // Quick injections
  shot("shot-b12", 250_000, 10, ["energy"], "clay"),
  shot("shot-vitamin-d", 350_000, 10, ["immunity"], "sand"),
  shot("shot-glutathione", 550_000, 15, ["skin"], "sea"),
  // Peptides and prescription injectables (doctor review)
  peptide("bpc-157", 1_200_000, ["recovery"], "sage", { featured: true }),
  peptide("tb-500", 1_500_000, ["recovery"], "moss"),
  peptide("recovery-stack", 2_500_000, ["recovery"], "clay", { featured: true }),
  peptide("cjc-ipamorelin", 1_900_000, ["recovery", "sleep", "longevity"], "sea"),
  peptide("ghk-cu", 1_300_000, ["skin"], "sand"),
  peptide("epitalon", 1_600_000, ["longevity", "sleep"], "moss"),
  peptide("thymosin-alpha-1", 1_800_000, ["immunity"], "sage"),
  peptide("nad-injection", 1_400_000, ["energy", "longevity"], "clay"),
  peptide("glp1-programme", 3_900_000, ["metabolic"], "sea"),
  // Supplements (no review)
  supplement("electrolytes", 280_000, ["hydration"], "sea"),
  supplement("magnesium-glycinate", 320_000, ["sleep", "recovery"], "moss"),
  supplement("collagen-peptides", 450_000, ["skin", "recovery"], "sand"),
  supplement("creatine", 350_000, ["energy", "recovery"], "clay"),
  supplement("omega-3", 390_000, ["longevity"], "sage"),
  // Memberships (monthly, renewed by hand at launch)
  membership("member-essentials", 2_400_000, "sand"),
  membership("member-performance", 4_900_000, "sage", { featured: true }),
  membership("member-longevity", 9_500_000, "moss"),
];

const BY_SLUG = new Map(PRODUCTS.map((p) => [p.slug, p]));
export function getProduct(slug: string): Product | undefined {
  return BY_SLUG.get(slug);
}
export function productsOf(...kinds: Kind[]): Product[] {
  return PRODUCTS.filter((p) => kinds.includes(p.kind));
}

/** Listing page each kind belongs to. */
export const KIND_PATH: Record<Kind, "/iv-drips" | "/peptides" | "/supplements" | "/memberships"> = {
  iv: "/iv-drips",
  shot: "/iv-drips",
  peptide: "/peptides",
  supplement: "/supplements",
  membership: "/memberships",
};
