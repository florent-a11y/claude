/**
 * Exchange rates, pure part (shared by the server module lib/fx.ts and the FX rate field in the browser):
 * parsing what people type into a rate box, formatting a rate, and reading Bank Indonesia's "Kurs Transaksi BI"
 * page (www.bi.go.id › Statistik › Informasi Kurs › Kurs Transaksi BI), the reference rate ILA's accountants
 * use for IDR books. No I/O here; the fetching and caching live in lib/fx.ts.
 */

/** Rates are kept to four decimals (BI publishes two; the accountants sometimes enter more). */
export const RATE_DECIMALS = 4;

/**
 * Parses a rate typed by a person: "16500", "16,500.25", "16.500,25", "16500,25", "Rp 16.500" → 16500.25 / 16500.
 * A single dot or comma followed by exactly three digits is a thousands separator ("16.500" is sixteen thousand five
 * hundred, the Indonesian way), anything else a decimal mark. Returns 0 when nothing usable was typed.
 */
export function parseRate(input: string | number | null | undefined): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  if (!input) return 0;
  let s = String(input).trim().replace(/[^0-9,.]/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  const commas = (s.match(/,/g) ?? []).length, dots = (s.match(/\./g) ?? []).length;
  if (commas && dots) s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (commas || dots) {
    const sep = commas ? "," : ".";
    const tail = s.slice(s.lastIndexOf(sep) + 1);
    const thousands = (commas || dots) > 1 || tail.length === 3;
    s = thousands ? s.split(sep).join("") : s.replace(sep, ".");
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10 ** RATE_DECIMALS) / 10 ** RATE_DECIMALS : 0;
}

/** "16245.5" → "16,245.50"; trailing zeros beyond two decimals are dropped ("16,245.1234" stays). */
export function fmtRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "";
  const d = Math.min(RATE_DECIMALS, Math.max(2, (String(rate).split(".")[1] ?? "").length));
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: d }).format(rate);
}

/** The value a rate box submits: a plain decimal string ("16245.5"), or "" when empty. */
export function rateToSubmit(rate: number): string {
  return rate > 0 ? String(Math.round(rate * 10 ** RATE_DECIMALS) / 10 ** RATE_DECIMALS) : "";
}

// ---------- Bank Indonesia page ----------

export interface BiRateRow { currency: string; /** Quotation unit (100 for JPY). */ units: number; /** IDR per `units`. */ sell: number; buy: number }
export interface BiRatesPage { /** The "Last Update" date on the page, ISO, or null when it could not be read. */ asOf: string | null; rows: BiRateRow[] }

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  januari: 1, februari: 2, maret: 3, mei: 5, juni: 6, juli: 7, agustus: 8, oktober: 10, nopember: 11, desember: 12,
};

/** "4 November 2026", "04/11/2026" or "2026-11-04" → "2026-11-04" (English and Indonesian month names). */
export function parseBiDate(text: string): string | null {
  const t = text.replace(/&nbsp;|\s+/g, " ").trim();
  let m = t.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) { const mo = MONTHS[m[2].toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}

/** Strips tags and entities from an HTML fragment. */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

/** BI prints numbers the English way on /en ("16,245.00") and the Indonesian way on /id ("16.245,00"); both are read. */
function biNumber(s: string): number | null {
  const t = s.trim();
  if (!/^[0-9][0-9.,]*$/.test(t)) return null;
  const n = parseRate(t);
  return n > 0 ? n : null;
}

/**
 * Reads the rate table of the Kurs Transaksi BI page. The table is rendered server-side as rows of
 * currency code · unit ("Nilai") · selling rate ("Kurs Jual") · buying rate ("Kurs Beli"); the reader looks for any
 * row-like group of cells (<td> or the page's grid cells) whose first text is a 3-letter code followed by three
 * numbers, so a change of CSS does not break it. Returns the "Last Update" date and the rows found (empty when the
 * page changed shape; callers treat that as "BI unavailable").
 */
export function parseBiRatesPage(html: string): BiRatesPage {
  const flat = html.replace(/\r?\n/g, " ");
  const asOfMatch = flat.match(/(?:Last\s+Update|Update\s+Terakhir)\s*(?:&nbsp;|\s)*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i);
  const asOf = asOfMatch ? parseBiDate(asOfMatch[1]) : null;
  const rows: BiRateRow[] = [];
  const seen = new Set<string>();
  // Table rows first.
  for (const tr of flat.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map(textOf);
    const row = rowFromCells(cells);
    if (row && !seen.has(row.currency)) { seen.add(row.currency); rows.push(row); }
  }
  if (rows.length === 0) {
    // Grid / div layouts: take every text node and scan for code, number, number, number.
    const texts = flat.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").split(/<[^>]+>/).map((t) => textOf(t)).filter(Boolean);
    for (let i = 0; i + 3 < texts.length; i++) {
      const row = rowFromCells(texts.slice(i, i + 4));
      if (row && !seen.has(row.currency)) { seen.add(row.currency); rows.push(row); i += 3; }
    }
  }
  return { asOf, rows };
}

/** code · units · sell · buy (BI's column order; the two rates are swapped when they come the other way round). */
function rowFromCells(cells: string[]): BiRateRow | null {
  if (cells.length < 4) return null;
  const code = cells[0].trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  const nums = cells.slice(1, 4).map(biNumber);
  if (nums.some((n) => n === null)) return null;
  const [units, a, b] = nums as number[];
  if (![1, 10, 100, 1000].includes(units)) return null;
  return { currency: code, units, sell: Math.max(a, b), buy: Math.min(a, b) };
}

/** Per-unit quote from a BI row: buy/sell/mid divided by the quotation unit, four decimals. */
export function perUnit(row: BiRateRow): { buy: number; sell: number; mid: number } {
  const r = (n: number) => Math.round((n / row.units) * 10 ** RATE_DECIMALS) / 10 ** RATE_DECIMALS;
  const buy = r(row.buy), sell = r(row.sell);
  return { buy, sell, mid: Math.round(((buy + sell) / 2) * 100) / 100 };
}
