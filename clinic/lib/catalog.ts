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
import type { PhotoKey } from "./photos";

export type Goal = "hydration" | "recovery" | "energy" | "immunity" | "longevity" | "skin" | "metabolic" | "sleep";

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
  /** Photograph shown for the product: a key of PHOTOS in lib/photos.ts. */
  photo: PhotoKey;
}

const iv = (slug: string, priceIdr: number, durationMin: number, goals: Goal[], photo: PhotoKey, extra: Partial<Product> = {}): Product =>
  ({ slug, kind: "iv", rx: false, session: true, priceIdr, durationMin, goals, photo, ...extra });
const shot = (slug: string, priceIdr: number, durationMin: number, goals: Goal[], photo: PhotoKey): Product =>
  ({ slug, kind: "shot", rx: false, session: true, priceIdr, durationMin, goals, photo });
const peptide = (slug: string, priceIdr: number, goals: Goal[], photo: PhotoKey, extra: Partial<Product> = {}): Product =>
  ({ slug, kind: "peptide", rx: true, session: false, priceIdr, goals, photo, coldChain: true, ...extra });
const supplement = (slug: string, priceIdr: number, goals: Goal[], photo: PhotoKey): Product =>
  ({ slug, kind: "supplement", rx: false, session: false, priceIdr, goals, photo });
const membership = (slug: string, priceIdr: number, photo: PhotoKey, extra: Partial<Product> = {}): Product =>
  ({ slug, kind: "membership", rx: false, session: false, priceIdr, goals: [], photo, ...extra });

export const PRODUCTS: Product[] = [
  // IV drips
  iv("iv-hydration", 850_000, 45, ["hydration", "energy"], "water-lemon-sun", { featured: true }),
  iv("iv-bali-belly", 1_250_000, 60, ["hydration", "recovery"], "bed-pool-view"),
  iv("iv-morning-after", 1_100_000, 45, ["hydration", "recovery"], "balcony-morning"),
  iv("iv-immune", 1_300_000, 45, ["immunity"], "orange-slices"),
  iv("iv-myers", 1_450_000, 45, ["energy", "immunity"], "iv-bag", { featured: true }),
  iv("iv-athlete", 1_650_000, 60, ["recovery", "energy"], "surfer-sunset"),
  iv("iv-glow", 1_750_000, 45, ["skin"], "oil-bottle-flowers"),
  iv("iv-nad-250", 4_200_000, 150, ["longevity", "energy"], "iv-drip-chamber", { rx: true, featured: true }),
  // Quick injections
  shot("shot-b12", 250_000, 10, ["energy"], "syringe-red"),
  shot("shot-vitamin-d", 350_000, 10, ["immunity"], "syringe-hand"),
  shot("shot-glutathione", 550_000, 15, ["skin"], "vials-cyan"),
  // Peptides and prescription injectables (doctor review)
  peptide("bpc-157", 1_200_000, ["recovery"], "vials-syringe-light", { featured: true }),
  peptide("tb-500", 1_500_000, ["recovery"], "vials-syringe-lilac"),
  peptide("recovery-stack", 2_500_000, ["recovery"], "vials-violet", { featured: true }),
  peptide("cjc-ipamorelin", 1_900_000, ["recovery", "sleep", "longevity"], "vial-moss"),
  peptide("ghk-cu", 1_300_000, ["skin"], "oil-bottle-shadow"),
  peptide("epitalon", 1_600_000, ["longevity", "sleep"], "vial-in-hand"),
  peptide("thymosin-alpha-1", 1_800_000, ["immunity"], "vials-row"),
  peptide("nad-injection", 1_400_000, ["energy", "longevity"], "vials-cyan"),
  peptide("glp1-programme", 3_900_000, ["metabolic"], "stethoscope-tablet"),
  // Supplements (no review)
  supplement("electrolytes", 280_000, ["hydration"], "water-citrus-glass"),
  supplement("magnesium-glycinate", 320_000, ["sleep", "recovery"], "capsules-green"),
  supplement("collagen-peptides", 450_000, ["skin", "recovery"], "powder-tub"),
  supplement("creatine", 350_000, ["energy", "recovery"], "powder-scoop"),
  supplement("omega-3", 390_000, ["longevity"], "softgels-bottle"),
  // Memberships (monthly, renewed by hand at launch)
  membership("member-essentials", 2_400_000, "meditation-silhouette"),
  membership("member-performance", 4_900_000, "athlete-back", { featured: true }),
  membership("member-longevity", 9_500_000, "infinity-pool"),
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
