/** Search helpers for the clients directory (token search over names, emails, phones). */
export function normaliseText(s: string | undefined | null): string {
  return (s ?? "").toString().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Every whitespace-separated token of `q` must appear in at least one of the fields (case/diacritic-insensitive). */
export function matchesSearch(fields: Array<string | undefined | null>, q: string | undefined): boolean {
  const tokens = normaliseText(q).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = fields.map(normaliseText).join(" \u0001 ");
  return tokens.every((t) => hay.includes(t));
}

/** Phone numbers compared on digits only so "+62 822" finds "0822". */
export function phoneDigits(s: string | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}
