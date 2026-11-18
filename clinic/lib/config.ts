/**
 * Everything that names the business lives here (or in the env vars it reads).
 * Rename the brand, move the clinic or change a fee in this one file.
 */
const env = (key: string, fallback = "") => (process.env[key] ?? "").trim() || fallback;

export const site = {
  /** Working name: change it here or with NEXT_PUBLIC_BRAND_NAME. */
  name: env("NEXT_PUBLIC_BRAND_NAME", "Pulih"),
  url: env("NEXT_PUBLIC_SITE_URL", "http://localhost:3200"),
  /** Legal entity that takes the orders (shown in the footer and legal pages once set). */
  company: env("NEXT_PUBLIC_COMPANY_NAME"),
  companyReg: env("NEXT_PUBLIC_COMPANY_REG"),
  /** Licensed facility that dispenses prescription items, and its licence number (shown once set). */
  dispenser: env("NEXT_PUBLIC_DISPENSER_NAME"),
  dispenserLicence: env("NEXT_PUBLIC_DISPENSER_LICENCE"),
  email: env("NEXT_PUBLIC_SUPPORT_EMAIL", "hello@example.com"),
  /** WhatsApp number in international format, digits only (62812…). Empty hides every WhatsApp button. */
  whatsapp: env("NEXT_PUBLIC_WHATSAPP").replace(/\D/g, ""),
  instagram: env("NEXT_PUBLIC_INSTAGRAM"),
  /** Clinic / lounge address and a Google Maps link. Empty shows "address sent with your confirmation". */
  address: env("NEXT_PUBLIC_CLINIC_ADDRESS"),
  mapsUrl: env("NEXT_PUBLIC_CLINIC_MAPS_URL"),
  /** Daily opening hours, Bali time (WITA, UTC+8). */
  opens: "08:00",
  closes: "20:00",
  orderPrefix: "PB",
};

/** wa.me link with a prefilled message, or null when no number is configured. */
export function waLink(text?: string, number = site.whatsapp): string | null {
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Bali is UTC+8 all year (WITA, no daylight saving). */
export const BALI_OFFSET_MIN = 8 * 60;
export function baliToday(now = new Date()): string {
  return new Date(now.getTime() + BALI_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** Two-hour arrival windows offered for nurse visits and deliveries. Staff confirm the exact time on WhatsApp. */
export const SLOTS = ["08:00-10:00", "10:00-12:00", "12:00-14:00", "14:00-16:00", "16:00-18:00", "18:00-20:00"] as const;
export type Slot = (typeof SLOTS)[number];
/** How many days ahead a visit or delivery can be requested. */
export const BOOKING_DAYS_AHEAD = 30;

/**
 * Service areas. SAMPLE FEES: replace with your real zones and prices.
 * `deliveryIdr` is the courier fee for products; `calloutIdr` is the nurse call-out fee for a villa or hotel visit.
 */
export interface Zone { id: string; areas: string[]; deliveryIdr: number; calloutIdr: number; etaMin: number }
export const ZONES: Zone[] = [
  { id: "z1", areas: ["Canggu", "Berawa", "Pererenan", "Umalas", "Kerobokan", "Seminyak"], deliveryIdr: 30_000, calloutIdr: 150_000, etaMin: 60 },
  { id: "z2", areas: ["Legian", "Kuta", "Denpasar", "Sanur", "Jimbaran", "Seseh", "Cemagi"], deliveryIdr: 50_000, calloutIdr: 200_000, etaMin: 90 },
  { id: "z3", areas: ["Uluwatu", "Bingin", "Ungasan", "Nusa Dua", "Ubud", "Kedungu", "Tanah Lot"], deliveryIdr: 80_000, calloutIdr: 300_000, etaMin: 120 },
];
export const AREAS: string[] = ZONES.flatMap((z) => z.areas);
export function zoneFor(area: string | undefined): Zone | undefined {
  return ZONES.find((z) => z.areas.includes(area ?? ""));
}
/** Product deliveries are free from this basket value. */
export const FREE_DELIVERY_FROM_IDR = 2_500_000;
