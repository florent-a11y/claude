/** Formatting and arithmetic helpers for money. IDR amounts are whole rupiah; other currencies keep 2 decimals. */

export const CURRENCIES = ["IDR", "USD", "EUR", "HKD", "SGD", "AUD", "GBP", "PHP"] as const;
export type Currency = (typeof CURRENCIES)[number] | string;

export function decimalsFor(currency: string): number {
  return currency === "IDR" ? 0 : 2;
}

/** Rounds to the currency's precision (IDR → integer, others → 2 dp), half away from zero. */
export function roundMoney(amount: number, currency = "IDR"): number {
  const d = decimalsFor(currency);
  const f = 10 ** d;
  return Math.sign(amount) * Math.round(Math.abs(amount) * f + Number.EPSILON) / f;
}

/** Indonesian tax rules round rupiah down to the whole rupiah for tax bases and amounts. */
export function roundTaxDown(amount: number): number {
  return Math.floor(amount + 1e-9);
}

/**
 * Money for screens and documents. IDR follows the Indonesian convention ("Rp 2.500.000", no decimals); other
 * currencies use their symbol with two decimals ("$1,315.00", "€955.00", "HK$8,200.00"). The space after the
 * symbol is non-breaking so an amount never wraps in the middle.
 */
export function fmtMoney(amount: number, currency = "IDR", locale = "en-US"): string {
  const d = decimalsFor(currency);
  const neg = amount < 0;
  const abs = Math.abs(amount);
  if (currency === "IDR") {
    return `${neg ? "\u2212" : ""}Rp\u00a0${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(abs))}`;
  }
  try {
    const s = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(abs).replace(/ /g, "\u00a0");
    return `${neg ? "\u2212" : ""}${s}`;
  } catch {
    return `${neg ? "\u2212" : ""}${currency}\u00a0${fmtNumber(abs, d)}`;
  }
}

/** Plain number with thousands separators, e.g. 2.500.000 style is Indonesian; ops screens keep en-US (2,500,000). */
export function fmtNumber(n: number, decimals = 0, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

/** "Rp 2.500.000" in Indonesian style for client-facing documents. */
export function fmtIDR(n: number): string {
  return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n)}`;
}

/** Converts a foreign amount to IDR with the given rate (IDR per 1 unit). */
export function toIDR(amount: number, currency: string, fxRate: number): number {
  if (currency === "IDR") return roundMoney(amount, "IDR");
  return roundMoney(amount * fxRate, "IDR");
}

export function sum(values: number[]): number {
  return values.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
}

/** Parses "2.500.000", "2,500,000", "1,500", "2500000.50", "2.500.000,50", "Rp 1.000" into a number. */
export function parseMoney(input: string | number | null | undefined): number {
  if (typeof input === "number") return input;
  if (!input) return 0;
  let s = String(input).trim();
  const negative = /^\(.*\)$/.test(s) || s.includes("-");
  s = s.replace(/[^0-9,.]/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  if (commas && dots) {
    // Both present: the last one is the decimal separator ("2,500,000.50" or "2.500.000,50").
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (commas || dots) {
    const sep = commas ? "," : ".";
    const count = commas || dots;
    const tail = s.slice(s.lastIndexOf(sep) + 1);
    // Repeated separators, or a single one followed by exactly three digits, are thousands groups.
    const thousands = count > 1 || tail.length === 3;
    s = thousands ? s.split(sep).join("") : s.replace(sep, ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}
