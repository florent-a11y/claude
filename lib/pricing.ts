export const PRICING = {
  currency: "USD",
  firstTraveler: 2490, // cents
  additionalTraveler: 1490,
  express: 1500,
  standardSlaHours: 12,
  expressSlaHours: 2,
} as const;

export function quote(travelers: number, express: boolean) {
  const n = Math.max(1, Math.min(travelers, 10));
  const base = PRICING.firstTraveler + (n - 1) * PRICING.additionalTraveler;
  const extra = express ? PRICING.express : 0;
  return { travelers: n, base, extra, total: base + extra, currency: PRICING.currency };
}

export function money(cents: number, currency: string = PRICING.currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
