/**
 * Formatting and arithmetic helpers for money. Every currency, rupiah included, is kept to two decimals in the
 * ledger (bank statements carry cents in IDR too, and reconciliation needs the exact amount). Whole rupiah are used
 * only where the rules ask for them: tax amounts (`roundTax`, `roundTaxDown`) and the figures printed on financial
 * statements (`roundRupiah` at presentation time). Screens show IDR cents only when there are some.
 */

export const CURRENCIES = ["IDR", "USD", "EUR", "HKD", "SGD", "AUD", "GBP", "PHP"] as const;
export type Currency = (typeof CURRENCIES)[number] | string;
export const CURRENCY_NAMES: Record<(typeof CURRENCIES)[number], string> = {
  IDR: "Indonesian rupiah", USD: "US dollar", EUR: "Euro", HKD: "Hong Kong dollar", SGD: "Singapore dollar", AUD: "Australian dollar", GBP: "British pound", PHP: "Philippine peso",
};
/** Options for a currency dropdown: "IDR · Indonesian rupiah". */
export const currencyOptions = (codes: readonly string[] = CURRENCIES) => codes.map((c) => ({ value: c, label: c in CURRENCY_NAMES ? `${c} · ${CURRENCY_NAMES[c as keyof typeof CURRENCY_NAMES]}` : c }));

/** Ledger precision: two decimals for every currency. */
export const MONEY_DECIMALS = 2;
export function decimalsFor(_currency?: string): number {
  return MONEY_DECIMALS;
}

/** Half away from zero at `decimals`; the relative epsilon absorbs binary noise (1.005 → 1.01), and -0 becomes 0. */
function roundAt(amount: number, decimals: number): number {
  if (!Number.isFinite(amount)) return 0;
  const f = 10 ** decimals;
  const v = (Math.sign(amount) * Math.round(Math.abs(amount) * f * (1 + 2 * Number.EPSILON))) / f;
  return v === 0 ? 0 : v;
}

/** Rounds to the ledger precision (two decimals, every currency), half away from zero. */
export function roundMoney(amount: number, _currency = "IDR"): number {
  return roundAt(amount, MONEY_DECIMALS);
}

/** Whole rupiah, half away from zero: the figures of financial statements and whole-rupiah schedules. */
export function roundRupiah(amount: number): number {
  return roundAt(amount, 0);
}

/** Tax amounts on documents (PPN, withholding): whole rupiah in IDR, two decimals in other currencies. */
export function roundTax(amount: number, currency = "IDR"): number {
  return currency === "IDR" ? roundRupiah(amount) : roundMoney(amount, currency);
}

/** Decimals to print for one amount: IDR shows cents only when there are some; other currencies always two. */
export function displayDecimals(amount: number, currency = "IDR"): number {
  if (currency !== "IDR") return MONEY_DECIMALS;
  return Number.isInteger(roundMoney(amount)) ? 0 : MONEY_DECIMALS;
}

/**
 * Decimals of a report: two for every figure when "Show cents" is ticked (whole amounts print ",00"), otherwise
 * two only when one of its IDR figures has cents, so the columns line up either way.
 */
export function reportDecimals(showCents: boolean, values: Array<number | undefined | null>, currency = "IDR"): number {
  return showCents ? MONEY_DECIMALS : columnDecimals(currency, values);
}

/** Decimals for a column or a form footer: two as soon as one IDR value has cents, so the column lines up. */
export function columnDecimals(currency: string, values: Array<number | undefined | null>): number {
  if (currency !== "IDR") return MONEY_DECIMALS;
  return values.some((v) => typeof v === "number" && Number.isFinite(v) && !Number.isInteger(roundMoney(v))) ? MONEY_DECIMALS : 0;
}

/** Indonesian tax rules round rupiah down to the whole rupiah for tax bases and amounts. */
export function roundTaxDown(amount: number): number {
  return Math.floor(amount + 1e-9);
}

/**
 * Money for screens and documents. IDR follows the Indonesian convention ("Rp 2.500.000", and "Rp 2.500.000,50" when
 * the amount has cents); other currencies use their symbol with two decimals ("$1,315.00", "€955.00",
 * "HK$8,200.00"). The space after the symbol is non-breaking so an amount never wraps in the middle.
 */
export function fmtMoney(amount: number, currency = "IDR", locale = "en-US"): string {
  return fmtMoneyAt(amount, displayDecimals(amount, currency), currency, locale);
}

/**
 * Money with a fixed number of decimals, for a statement or a column whose figures must all print the same way:
 * with 2, a whole rupiah amount prints "Rp 2.500.000,00" (this is what "Show cents" asks for); with 0 it prints
 * "Rp 2.500.000". Other currencies always print their two decimals, as in fmtMoney.
 */
export function fmtMoneyAt(amount: number, decimals: number, currency = "IDR", locale = "en-US"): string {
  const d = decimalsFor(currency);
  const rounded = roundMoney(amount, currency);
  const neg = rounded < 0;
  const abs = Math.abs(rounded);
  if (currency === "IDR") {
    const dd = Math.min(Math.max(Math.trunc(decimals) || 0, 0), MONEY_DECIMALS);
    return `${neg ? "\u2212" : ""}Rp\u00a0${new Intl.NumberFormat("id-ID", { minimumFractionDigits: dd, maximumFractionDigits: dd }).format(abs)}`;
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

/** "Rp 2.500.000" in Indonesian style for client-facing documents ("Rp 2.500.000,50" when there are cents). */
export function fmtIDR(n: number): string {
  const d = displayDecimals(n, "IDR");
  return `Rp ${new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }).format(roundMoney(n))}`;
}

/** Amount without symbol for forms and tables (en-US grouping): IDR cents only when present, others two decimals. */
export function fmtAmount(n: number, currency = "IDR"): string {
  return fmtNumber(roundMoney(n, currency), displayDecimals(n, currency));
}

/** Converts a foreign amount to IDR with the given rate (IDR per 1 unit), to the cent. */
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
