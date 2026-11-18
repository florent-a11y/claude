const TAGS: Record<string, string> = { en: "en-US", ru: "ru-RU", fr: "fr-FR" };

/** "Rp 1,250,000" (en), "Rp 1 250 000" (ru, fr). Rupiah has no cents in practice. */
export function idr(amount: number, locale = "en"): string {
  return `Rp ${new Intl.NumberFormat(TAGS[locale] ?? "en-US", { maximumFractionDigits: 0 }).format(Math.round(amount))}`;
}

/** Short form for cards and tables: "Rp 1.25M", "Rp 850K". */
export function idrShort(amount: number): string {
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : amount % 100_000 === 0 ? 1 : 2)}M`;
  return `Rp ${Math.round(amount / 1000)}K`;
}
