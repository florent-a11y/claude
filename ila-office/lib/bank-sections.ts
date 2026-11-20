/**
 * A statement that lists several currencies (one OCBC PDF carries the IDR, USD and EUR accounts) is imported in one
 * go: each currency section goes to the bank account kept in that currency, and a currency the entity has no bank
 * account for yet gets one created on the spot. Pure rules, shared by the import screen, its API and the tests.
 */

export interface SectionBank { id: string; name: string; currency: string; active?: boolean }
export interface GlOption { id: string; code: string; name: string }

/** Destination values of a section besides a bank account id. */
export const NEW_BANK = "__new__";
export const SKIP_SECTION = "__skip__";
/** GL choice of a new bank account: create a GL account for it. */
export const NEW_GL = "__new__";

export interface SectionPlan {
  currency: string;
  lines: number;
  /** Active bank accounts of the entity kept in that currency. */
  candidates: SectionBank[];
  /** Default destination: a bank account id; NEW_BANK when the entity has none in that currency; "" when several fit and the user must choose. */
  target: string;
}

const ccy = (s: string) => s.trim().toUpperCase();

/**
 * Where each currency section goes by default. The account the import was opened from takes its own currency; any
 * other currency goes to the only active account kept in it, to a new account when there is none, and is left for
 * the user to choose when there are several. Sections come back with the opened account's currency first, then by
 * number of lines.
 */
export function planSections(currencies: Record<string, number>, banks: SectionBank[], opened: SectionBank): SectionPlan[] {
  const own = ccy(opened.currency);
  return Object.entries(currencies)
    .filter(([, lines]) => lines > 0)
    .map(([code, lines]): SectionPlan => {
      const currency = ccy(code);
      const candidates = banks.filter((b) => b.active !== false && ccy(b.currency) === currency);
      const target = currency === own ? opened.id : candidates.length === 1 ? candidates[0].id : candidates.length === 0 ? NEW_BANK : "";
      return { currency, lines, candidates: currency === own && !candidates.some((b) => b.id === opened.id) ? [opened, ...candidates] : candidates, target };
    })
    .sort((a, b) => (a.currency === own ? -1 : b.currency === own ? 1 : b.lines - a.lines || a.currency.localeCompare(b.currency)));
}

/** "OCBC IDR operating" → "OCBC USD operating"; a name that does not carry the currency code gets the new one appended. */
export function suggestBankName(openedName: string, fromCurrency: string, toCurrency: string): string {
  const from = ccy(fromCurrency), to = ccy(toCurrency);
  const name = openedName.trim();
  const re = new RegExp(`\\b${from.replace(/[^A-Z]/g, "")}\\b`, "i");
  if (from && re.test(name)) return name.replace(re, to);
  return `${name} ${to}`.trim();
}

/** The unused bank GL account that names the currency ("Bank USD", "OCBC USD"), else NEW_GL: one is created with the bank account. */
export function suggestGlAccount(options: GlOption[], currency: string): string {
  const re = new RegExp(`\\b${ccy(currency).replace(/[^A-Z]/g, "")}\\b`, "i");
  return options.find((o) => o.id !== NEW_GL && re.test(o.name))?.id ?? NEW_GL;
}

/**
 * Code of the GL account created with a new bank account: ten after the highest bank account of the chart
 * (1-1100, 1-1110 → 1-1120), moved up one by one while that code is taken. "1-1100" for a chart without bank accounts.
 */
export function nextBankGlCode(accounts: Array<{ code: string; subtype: string }>): string {
  const used = new Set(accounts.map((a) => a.code));
  const banks = accounts.filter((a) => a.subtype === "bank").map((a) => /^(\d)-(\d{4})$/.exec(a.code)).filter((m): m is RegExpExecArray => m !== null);
  if (banks.length === 0) return bump("1", 1100, used);
  // Bank accounts sit in the asset class: the lowest class digit in use, then its highest number.
  const prefix = banks.map((m) => m[1]).sort()[0];
  const top = Math.max(...banks.filter((m) => m[1] === prefix).map((m) => Number(m[2])));
  return bump(prefix, top + 10, used);
}

function bump(prefix: string, from: number, used: Set<string>): string {
  for (let n = from; n <= 9999; n++) { const code = `${prefix}-${String(n).padStart(4, "0")}`; if (!used.has(code)) return code; }
  throw new Error("No free account code left for a new bank account.");
}
