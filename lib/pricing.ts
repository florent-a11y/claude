export type Product = "arrival_card" | "evoa" | "bundle";

export const PRICING = {
  currency: "USD",
  arrivalCard: { first: 2490, additional: 1490, expressSlaHours: 2, standardSlaHours: 12 },
  evoa: {
    first: 3990,
    additional: 2990,
    /** Visa fee charged per traveler: IDR 800,000 converted at ~16,300 IDR/USD. Covers the IDR 500,000
     *  government e-VOA fee plus card and currency handling. Adjust if IDR moves. */
    governmentFee: 4900,
    standardSlaHours: 48,
    expressSlaHours: 12,
  },
  bundleDiscount: 1000, // per traveler when both products are ordered together
  express: 1500,
} as const;

export const PRODUCT_LABELS: Record<Product, string> = {
  arrival_card: "Arrival card assistance",
  evoa: "e-VOA (visa on arrival) assistance",
  bundle: "e-VOA + arrival card bundle",
};

export function quote(travelers: number, express: boolean, product: Product = "arrival_card") {
  const n = Math.max(1, Math.min(travelers, 10));
  const ac = product !== "evoa" ? PRICING.arrivalCard.first + (n - 1) * PRICING.arrivalCard.additional : 0;
  const ev = product !== "arrival_card" ? PRICING.evoa.first + (n - 1) * PRICING.evoa.additional : 0;
  const discount = product === "bundle" ? n * PRICING.bundleDiscount : 0;
  const governmentFee = product !== "arrival_card" ? n * PRICING.evoa.governmentFee : 0;
  const serviceFee = ac + ev - discount;
  const extra = express ? PRICING.express : 0;
  return { product, travelers: n, serviceFee, governmentFee, extra, total: serviceFee + governmentFee + extra, currency: PRICING.currency };
}

export function money(cents: number, currency: string = PRICING.currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
