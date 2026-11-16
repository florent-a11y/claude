/**
 * Pure table → draft mappers for the migration imports: HubSpot contacts, QuickBooks Online customers and invoices
 * (CRM + ILA's own books) and, per client entity, the QuickBooks account list, trial balance, journal, bills and
 * vendors. No I/O, no Next.js, no database, so the functions run in tests and could run in the browser.
 * lib/import-services.ts dedupes the drafts against the store and writes rows; lib/qbo-migration-services.ts chains
 * them for the "migrate a company" wizard.
 *
 * Every mapper takes a CSV text or a table already read with `tableFromGrid` (Excel exports go through
 * lib/statement-file.ts first). Export formats in the wild are messy: HubSpot and QBO rename columns per locale and
 * report, QBO report exports start with title rows (company, report, period) and end with a "… Accrual Basis" footer,
 * some reports are grouped under a customer or vendor heading, dates come as dd/mm/yyyy, mm/dd/yyyy or yyyy-mm-dd,
 * and QBO customer display names carry a currency suffix ("Jane Doe - USD") because QBO needs one customer record
 * per currency. Every mapper is forgiving on input and strict on output.
 */
import { parseCSV } from "./csv";
import { roundMoney } from "./money";
import type { Account, AccountSubtype, AccountType, Bill, Contact, Company, EntityType, Invoice, JournalLine } from "./types";

export type DateFormat = "auto" | "dmy" | "mdy" | "ymd";
export const DATE_FORMAT_LABELS: Record<DateFormat, string> = { auto: "Detect from the file", dmy: "dd/mm/yyyy", mdy: "mm/dd/yyyy (US)", ymd: "yyyy-mm-dd" };

// ---------- Table reading ----------

export interface ParsedTable {
  /** Normalised header names (lower-case, punctuation collapsed, parenthesised suffixes dropped). */
  headers: string[];
  /** Original header names, for display. */
  rawHeaders: string[];
  /** 1-based line number of the header row in the file. */
  headerLine: number;
  rows: Array<{ line: number; cells: Record<string, string> }>;
  /** Lines printed above the header row, cells joined (QuickBooks: company name, report title, period). */
  titleLines?: string[];
  /** The title line that names a QuickBooks report ("Journal", "Trial Balance"…). */
  reportTitle?: string;
  /** The company name printed above the header (the title line that is neither the report nor the period). */
  companyName?: string;
  /** The period line as printed ("As of October 31, 2026", "January - March 2026", "All Dates"). */
  periodLine?: string;
}

/** What every mapper accepts: the CSV text, or a table already read from a grid (Excel sheet). */
export type TableInput = string | ParsedTable;

/** "Memo/Description" → "memo description", "Open Balance (IDR)" → "open balance", "Account #" → "account number". */
export function normHeader(h: string): string {
  return h.replace(/^﻿/, "").replace(/\(.*?\)/g, " ").replace(/#/g, " number ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const HEADER_HINTS = new Set([
  "date", "transaction date", "num", "no", "number", "customer", "name", "amount", "email", "first name", "last name", "record id", "company",
  "open balance", "balance", "memo description", "memo", "description", "phone", "phone number", "phone numbers", "currency", "due date", "type",
  "full name", "billing address", "lead status", "create date", "status", "total",
  "account", "account type", "detail type", "account number", "debit", "credit", "transaction type", "vendor", "supplier", "payee", "bill no",
  "split", "address", "terms", "past due", "posting", "total balance", "display name", "customer full name", "supplier full name", "vendor full name",
]);

/** Title lines QuickBooks prints above a report's header row, by the report they announce. */
const REPORT_TITLE = /^(journal|trial balance|general ledger|account list(ing)?|chart of accounts|invoice list( by date)?|open invoices|invoices and received payments|unpaid bills|bill list|bills and applied payments|customer contact list|customer list|(vendor|supplier) contact list|(vendor|supplier) list|transaction (list|detail) by .*|a\W?[rp] age?ing.*|profit and loss.*|balance sheet.*|statement of .*)$/i;
/** Last row of a QuickBooks export: "Monday, Nov 16, 2026 02:13:22 AM GMT+8 - Accrual Basis". */
const FOOTER_LINE = /\b(accrual|cash)\s+basis\b|^(mon|tues|wednes|thurs|fri|satur|sun)day,?\s.*\d{1,2}:\d{2}/i;

/**
 * Reads a grid of text cells (a CSV, or an Excel sheet from lib/statement-file.ts) as a table. QuickBooks report
 * exports start with title rows (company name, report title, period): the header row is the first of the top 20
 * rows with two known column names, and what stands above it comes back as `titleLines`, with the report title and
 * the company name told apart (QuickBooks prints either one first). The "… Accrual Basis" footer row is dropped.
 * A column whose header is blank (QBO reports leave the account column unnamed) is readable as "column N" (1-based).
 */
export function tableFromGrid(grid: string[][]): ParsedTable {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const hits = grid[i].map((c) => normHeader(String(c ?? ""))).filter((h) => HEADER_HINTS.has(h)).length;
    if (hits >= 2) { headerIndex = i; break; }
  }
  const rawHeaders = (grid[headerIndex] ?? []).map((c) => String(c ?? ""));
  const headers = rawHeaders.map(normHeader);
  const titleLines = grid.slice(0, headerIndex).map((r) => r.map((c) => String(c ?? "").trim()).filter(Boolean).join(", ")).filter(Boolean);
  const periodLine = titleLines.find((l) => !REPORT_TITLE.test(l) && (/^(all dates|since)\b/i.test(l) || parseReportPeriod(l).to !== undefined));
  const others = titleLines.filter((l) => l !== periodLine);
  const reportTitle = others.find((l) => REPORT_TITLE.test(l)) ?? others[1];
  const out: ParsedTable = { headers, rawHeaders, headerLine: headerIndex + 1, rows: [], titleLines, reportTitle, companyName: others.find((l) => l !== reportTitle), periodLine };
  for (let i = headerIndex + 1; i < grid.length; i++) {
    const r = grid[i].map((c) => String(c ?? "").trim());
    const filled = r.filter((c) => c !== "");
    if (filled.length === 0) continue;
    if (filled.length === 1 && FOOTER_LINE.test(filled[0])) continue;
    const cells: Record<string, string> = {};
    headers.forEach((h, j) => { cells[h || `column ${j + 1}`] = r[j] ?? ""; });
    out.rows.push({ line: i + 1, cells });
  }
  return out;
}

/** Parses a CSV and reads it with `tableFromGrid` (title rows skipped, header located). */
export function tableFromCSV(text: string): ParsedTable {
  return tableFromGrid(parseCSV(text));
}

/** The table behind a mapper's input: CSV text is parsed, a table passes through. */
export function toTable(input: TableInput): ParsedTable {
  return typeof input === "string" ? tableFromCSV(input) : input;
}

/** A grid back to CSV text (every cell quoted), so an Excel sheet can travel wherever a CSV text is expected. */
export function gridToCSV(grid: string[][]): string {
  return grid.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

const MONTH_NAMES = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/**
 * The period a QuickBooks report covers, from its period line: "As of October 31, 2026" → to; "January - March 2026",
 * "January 1 - October 31, 2026", "01/01/2026 - 31/10/2026" → from and to; "October 2026" → that month; "All Dates"
 * or anything unreadable → {}.
 */
export function parseReportPeriod(line: string | undefined): { from?: string; to?: string } {
  const s = (line ?? "").replace(/\s+/g, " ").trim();
  if (!s || /^all dates/i.test(s)) return {};
  const asOf = s.match(/\bas of\s+(.+)$/i);
  if (asOf) return { to: parseDate(asOf[1]) };
  const monthYear = (t: string): { y: number; m: number } | undefined => {
    const m = t.match(new RegExp(`^(${MONTH_NAMES})\\.?,?\\s+(\\d{4})$`, "i"));
    return m ? { y: Number(m[2]), m: MONTHS[m[1].slice(0, 3).toLowerCase()] } : undefined;
  };
  const endOf = (t: string): string | undefined => { const my = monthYear(t); return my ? validDate(my.y, my.m, new Date(Date.UTC(my.y, my.m, 0)).getUTCDate()) : parseDate(t); };
  const parts = s.split(/\s+(?:[-–—]|to|through)\s+/i);
  if (parts.length === 2) {
    const to = endOf(parts[1]);
    if (!to) return {};
    const year = to.slice(0, 4);
    const a = parts[0].trim();
    const my = monthYear(a) ?? monthYear(`${a} ${year}`);
    const from = my ? validDate(my.y, my.m, 1) : parseDate(a) ?? parseDate(`${a}, ${year}`) ?? parseDate(`${a} ${year}`);
    return { from, to };
  }
  const single = monthYear(s);
  if (single) return { from: validDate(single.y, single.m, 1), to: endOf(s) };
  return {};
}

/** First non-empty value among the given column aliases (aliases are normalised the same way as headers). */
export function col(cells: Record<string, string>, ...aliases: string[]): string {
  for (const a of aliases) {
    const v = cells[normHeader(a)];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

function hasCol(headers: string[], ...aliases: string[]): boolean {
  return aliases.some((a) => headers.includes(normHeader(a)));
}

// ---------- Amounts ----------

/**
 * Parses an exported amount: "1,000,000", "1,000,000.00", "1.000.000,50", "1000000", "(1,200.00)" (negative),
 * "USD 1,315.00", "-250". When both separators appear the last one is the decimal point; a lone separator followed
 * by exactly three digits is a thousands separator (QBO never exports three decimals).
 */
export function parseAmount(input: string | number | null | undefined): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  if (!input) return 0;
  let s = String(input).trim();
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  s = s.replace(/[^0-9,.]/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const tail = s.length - lastComma - 1;
    const commas = (s.match(/,/g) ?? []).length;
    s = commas > 1 || tail === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    const tail = s.length - lastDot - 1;
    const dots = (s.match(/\./g) ?? []).length;
    if (dots > 1 || tail === 3) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

// ---------- Dates ----------

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function validDate(y: number, m: number, d: number): string | undefined {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return undefined;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function year4(y: string): number {
  const n = Number(y);
  return y.length <= 2 ? 2000 + n : n;
}

/**
 * Parses one date cell to ISO `YYYY-MM-DD`. Accepts ISO, numeric d/m/y or m/d/y with `/`, `-` or `.`, "15 Jan 2026",
 * "15-Jan-26", "Jan 15, 2026" and ISO timestamps. For numeric dates the caller picks the order; "auto" resolves an ambiguous
 * cell (both parts ≤ 12) as day-first, which is how QBO Indonesia and Google Sheets in Bali show dates.
 */
export function parseDate(input: string | undefined | null, format: DateFormat = "auto"): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (!s) return undefined;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = year4(m[3]);
    let order: "dmy" | "mdy";
    if (format === "dmy" || format === "mdy") order = format;
    else if (format === "ymd") order = "dmy";
    else order = a > 12 ? "dmy" : b > 12 ? "mdy" : "dmy";
    return order === "dmy" ? validDate(y, b, a) : validDate(y, a, b);
  }
  m = s.match(/^(\d{1,2})[\s\-/.]+([A-Za-z]{3,})\.?,?[\s\-/.]+(\d{2,4})/); // "15 Jan 2026", and Excel's "15-Jan-26"
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; return mo ? validDate(year4(m[3]), mo, Number(m[1])) : undefined; }
  m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; return mo ? validDate(Number(m[3]), mo, Number(m[2])) : undefined; }
  return undefined;
}

/** Looks at a whole column and decides whether numeric dates are day-first or month-first. */
export function inferDateFormat(values: string[]): "dmy" | "mdy" | "ymd" {
  let dmy = 0, mdy = 0, ymd = 0;
  for (const v of values) {
    const s = (v ?? "").trim();
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) { ymd++; continue; }
    const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy++;
    else if (Number(m[2]) > 12) mdy++;
  }
  if (ymd && !dmy && !mdy) return "ymd";
  if (mdy > dmy) return "mdy";
  return "dmy";
}

function resolveFormat(format: DateFormat | undefined, samples: string[]): DateFormat {
  return !format || format === "auto" ? inferDateFormat(samples) : format;
}

/** HubSpot timestamps: "2024-03-12 09:14", "2024-03-12T09:14:33.000Z", "3/12/2024 9:14 AM". Returns ISO 8601. */
export function parseTimestamp(input: string | undefined | null, format: DateFormat = "auto"): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return Number.isNaN(d.getTime()) ? undefined : d.toISOString(); }
  const [datePart, ...rest] = s.split(/\s+/);
  const iso = parseDate(datePart, format);
  if (!iso) return undefined;
  const time = rest.join(" ").match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  let h = 0, mi = 0, sec = 0;
  if (time) {
    h = Number(time[1]); mi = Number(time[2]); sec = Number(time[3] ?? 0);
    const ap = time[4]?.toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
  }
  return `${iso}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(sec).padStart(2, "0")}.000Z`;
}

// ---------- Names, currencies, countries ----------

export const CURRENCY_CODES = ["IDR", "USD", "EUR", "HKD", "SGD", "AUD", "GBP", "PHP", "JPY", "CHF", "CAD", "NZD", "CNY", "RUB", "THB", "MYR", "VND", "AED"] as const;
const CURRENCY_NAMES: Record<string, string> = {
  "indonesian rupiah": "IDR", rupiah: "IDR", "us dollar": "USD", "united states dollar": "USD", dollar: "USD", euro: "EUR", "hong kong dollar": "HKD",
  "singapore dollar": "SGD", "australian dollar": "AUD", "british pound": "GBP", "pound sterling": "GBP", "philippine peso": "PHP", "swiss franc": "CHF",
};

/** "USD", "US Dollar", "usd " → "USD"; unknown → undefined. */
export function normCurrency(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  const code = t.toUpperCase();
  if ((CURRENCY_CODES as readonly string[]).includes(code)) return code;
  return CURRENCY_NAMES[t.toLowerCase()];
}

/** "Jane Doe - USD", "PT Example (EUR)", "Acme USD" → name without the suffix and the currency it carried. */
export function stripCurrencySuffix(name: string): { name: string; currency?: string } {
  const codes = CURRENCY_CODES.join("|");
  const m = name.trim().match(new RegExp(`^(.*?)(?:\\s+[-–—:]\\s*|\\s*\\(\\s*|\\s+)(${codes})\\s*\\)?\\s*$`));
  if (m && m[1].trim()) return { name: m[1].replace(/[\s\-–—:(]+$/, "").trim(), currency: m[2] };
  return { name: name.trim() };
}

/** QBO marks inactive customers "Name (deleted)". */
export function stripInactiveSuffix(name: string): { name: string; inactive: boolean } {
  const m = name.match(/^(.*?)\s*\((deleted|inactive)\)\s*$/i);
  return m ? { name: m[1].trim(), inactive: true } : { name: name.trim(), inactive: false };
}

const COMPANY_TOKENS = new Set([
  "pt", "cv", "ud", "ltd", "limited", "llc", "pty", "gmbh", "oü", "ou", "inc", "group", "holdings", "holding", "co", "corp", "corporation",
  "company", "sarl", "sas", "sa", "bv", "nv", "ag", "plc", "llp", "lp", "opc", "tbk", "pma", "pmdn", "yayasan", "foundation", "koperasi", "firma",
  "villa", "villas", "resort", "resorts", "hotel", "studio", "enterprises", "ventures", "partners", "international", "investama", "trading", "consulting",
]);

/** Heuristic: company-ish tokens anywhere in the name, or an ampersand. */
export function looksLikeCompany(name: string): boolean {
  const tokens = name.replace(/[.,()/'"]/g, " ").toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.some((t) => COMPANY_TOKENS.has(t))) return true;
  return /&/.test(name);
}

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "mme", "mlle", "m", "sir", "madam", "bapak", "ibu", "pak", "bu"]);

/** "Doe, Jane" → Jane Doe; "Jane Marie Doe" → first "Jane", last "Marie Doe"; honorifics dropped. */
export function splitPersonName(raw: string): { firstName: string; lastName: string } {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return { firstName: "", lastName: "" };
  if (s.includes(",")) {
    const [last, ...rest] = s.split(",").map((x) => x.trim());
    return { firstName: rest.join(" ").trim(), lastName: last };
  }
  const parts = s.split(" ").filter((p) => !HONORIFICS.has(p.toLowerCase().replace(/\.$/, "")));
  if (parts.length === 0) return { firstName: s, lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

const COUNTRIES: Record<string, string> = {
  indonesia: "ID", france: "FR", australia: "AU", "united states": "US", usa: "US", "united states of america": "US", "united kingdom": "GB", uk: "GB",
  england: "GB", germany: "DE", netherlands: "NL", "the netherlands": "NL", russia: "RU", "russian federation": "RU", ukraine: "UA", spain: "ES", italy: "IT",
  switzerland: "CH", belgium: "BE", canada: "CA", india: "IN", china: "CN", singapore: "SG", "hong kong": "HK", "hong kong sar": "HK", japan: "JP",
  "south korea": "KR", korea: "KR", philippines: "PH", brazil: "BR", argentina: "AR", "new zealand": "NZ", sweden: "SE", norway: "NO", denmark: "DK",
  finland: "FI", poland: "PL", "czech republic": "CZ", czechia: "CZ", austria: "AT", portugal: "PT", ireland: "IE", israel: "IL", turkey: "TR", türkiye: "TR",
  "united arab emirates": "AE", uae: "AE", "south africa": "ZA", malaysia: "MY", thailand: "TH", vietnam: "VN", estonia: "EE", latvia: "LV", lithuania: "LT",
  romania: "RO", hungary: "HU", greece: "GR", mexico: "MX", chile: "CL", colombia: "CO", taiwan: "TW", kazakhstan: "KZ", belarus: "BY", serbia: "RS", croatia: "HR",
};

/** Country name or ISO-2 → ISO-2; unknown → undefined. */
export function countryCode(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return COUNTRIES[t.toLowerCase()];
}

const LANGUAGES: Record<string, string> = { english: "en", french: "fr", français: "fr", spanish: "es", español: "es", russian: "ru", german: "de", deutsch: "de", italian: "it", dutch: "nl", indonesian: "id", "bahasa indonesia": "id", portuguese: "pt", chinese: "zh", japanese: "ja", ukrainian: "uk" };

export function languageCode(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim().toLowerCase();
  if (!t) return undefined;
  if (/^[a-z]{2}([-_][a-z]{2})?$/.test(t)) return t.slice(0, 2);
  return LANGUAGES[t];
}

export function normEmail(e: string | undefined | null): string | undefined {
  const t = (e ?? "").trim().toLowerCase();
  return t && t.includes("@") ? t : undefined;
}

/** Case- and punctuation-insensitive key for matching names ("PT. Example Bali" ≡ "pt example bali"). */
export function normName(s: string | undefined | null): string {
  return (s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanPhone(s: string): string | undefined {
  const t = s.replace(/\s+/g, " ").trim();
  return t || undefined;
}

// ---------- HubSpot contacts ----------

export interface ContactDraft {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  nationality?: string;
  language?: string;
  source?: string;
  tags: string[];
  notes?: string;
  hubspotId?: string;
  qboCustomerId?: string;
  companyIds: string[];
  /** Company name as exported; resolved to a Company (created when missing) at import time. */
  companyName?: string;
  /** Contact owner as exported (name or email); resolved to a user at import time when it matches. */
  ownerName?: string;
  createdAt?: string;
  /** 1-based line in the source file, for messages. */
  line: number;
  warnings: string[];
}

export interface ParseResult<T> {
  drafts: T[];
  errors: Array<{ line: number; message: string }>;
  skipped: Array<{ line: number; reason: string }>;
  /** File-level remarks (missing columns, assumptions made). */
  warnings: string[];
  headers: string[];
  headerLine: number;
  /** Data rows read from the file (excluding the header and blank lines). */
  rowCount: number;
}

export interface HubspotOptions { dateFormat?: DateFormat }

/** Maps a HubSpot "Export contacts" CSV to contact drafts. Lead status and lifecycle stage become tags. */
export function parseHubspotContacts(input: TableInput, opts: HubspotOptions = {}): ParseResult<ContactDraft> {
  const table = toTable(input);
  const result: ParseResult<ContactDraft> = { drafts: [], errors: [], skipped: [], warnings: [], headers: table.rawHeaders, headerLine: table.headerLine, rowCount: table.rows.length };
  if (!hasCol(table.headers, "email", "email address")) result.warnings.push("no Email column: contacts are deduplicated by Record ID only");
  const fmt = resolveFormat(opts.dateFormat, table.rows.map((r) => col(r.cells, "create date", "created date", "createdate").split(/\s+/)[0]));
  for (const { line, cells } of table.rows) {
    const warnings: string[] = [];
    let firstName = col(cells, "first name", "firstname");
    let lastName = col(cells, "last name", "lastname");
    const email = normEmail(col(cells, "email", "email address"));
    const rawEmail = col(cells, "email", "email address");
    if (rawEmail && !email) warnings.push(`invalid email "${rawEmail}" dropped`);
    if (!firstName && !lastName) {
      const full = col(cells, "name", "full name", "contact name");
      if (full) ({ firstName, lastName } = splitPersonName(full));
      else if (email) { firstName = email.split("@")[0]; warnings.push("no name: used the email local part"); }
      else { result.errors.push({ line, message: "no name and no email" }); continue; }
    }
    const tags = ["hubspot"];
    const leadStatus = col(cells, "lead status", "hs lead status");
    if (leadStatus) tags.push(`lead-status:${normName(leadStatus).replace(/ /g, "-")}`);
    const lifecycle = col(cells, "lifecycle stage", "lifecyclestage");
    if (lifecycle) tags.push(`lifecycle:${normName(lifecycle).replace(/ /g, "-")}`);
    const notes: string[] = [];
    const jobTitle = col(cells, "job title", "jobtitle");
    if (jobTitle) notes.push(`Job title: ${jobTitle}`);
    const message = col(cells, "message", "notes", "note");
    if (message) notes.push(message);
    const countryRaw = col(cells, "country region", "country", "nationality");
    const nationality = countryCode(countryRaw);
    if (countryRaw && !nationality) notes.push(`Country: ${countryRaw}`);
    const draft: ContactDraft = {
      firstName: firstName.trim(), lastName: lastName.trim(), email,
      phone: cleanPhone(col(cells, "phone number", "phone", "mobile phone number", "mobile")),
      whatsapp: cleanPhone(col(cells, "whatsapp", "whatsapp number", "whatsapp phone")),
      nationality, language: languageCode(col(cells, "preferred language", "language", "hs language")),
      source: col(cells, "original source", "lead source", "source") || "hubspot",
      tags, notes: notes.length ? notes.join("\n") : undefined,
      hubspotId: col(cells, "record id", "contact id", "hs object id", "id") || undefined,
      companyIds: [],
      companyName: col(cells, "associated company", "primary associated company", "company name", "company") || undefined,
      ownerName: col(cells, "contact owner", "owner", "hubspot owner") || undefined,
      createdAt: parseTimestamp(col(cells, "create date", "created date", "createdate"), fmt),
      line, warnings,
    };
    if (!draft.hubspotId) warnings.push("no Record ID: deduplicated by email only");
    result.drafts.push(draft);
  }
  return result;
}

// ---------- QuickBooks customers ----------

export interface QboCustomerDraft {
  kind: "company" | "contact";
  /** Display name exactly as QBO exports it (with currency suffix); invoices reference customers by this. */
  displayName: string;
  /** Explicit id column when the export has one, else the display name. */
  qboCustomerId: string;
  /** Currency the QBO record is billed in (from a suffix or the Currency column). */
  currency?: string;
  /** Company name (kind company) or person's full name (kind contact), suffix stripped. */
  name: string;
  firstName?: string;
  lastName?: string;
  /** For contacts: the company they belong to (QBO "Company" column or parent customer). */
  companyName?: string;
  entityType?: EntityType | "prospect";
  country?: string;
  email?: string;
  phone?: string;
  address?: string;
  npwp?: string;
  openBalance?: number;
  inactive: boolean;
  notes?: string;
  line: number;
  warnings: string[];
}

/** Guesses the legal form from the name: PT → PT PMA (ILA's usual client), CV, Hong Kong Ltd, Philippines OPC. */
export function guessEntityType(name: string, hint = ""): { type: EntityType | "prospect"; country: string } {
  const n = ` ${name.toLowerCase().replace(/[.,()]/g, " ")} `;
  const h = `${name} ${hint}`.toLowerCase();
  if (/ pt /.test(n)) return { type: /pmdn|lokal|local/.test(h) ? "pt_pmdn" : "pt_pma", country: "ID" };
  if (/ cv /.test(n)) return { type: "cv", country: "ID" };
  if (/ (ltd|limited) /.test(n) && /hong kong|hk\b/.test(h)) return { type: "hk_ltd", country: "HK" };
  if (/ opc /.test(n) || (/ (inc|corp|corporation) /.test(n) && /philippines|manila/.test(h))) return { type: "ph_opc", country: "PH" };
  const country = countryCode(hint.split(/[\n,]/).map((x) => x.trim()).reverse().find((x) => countryCode(x))) ?? "ID";
  return { type: "other", country };
}

/** Maps a QBO customer export (Sales → Customers → Export, or the Customer Contact List report) to drafts. */
export function parseQboCustomers(input: TableInput): ParseResult<QboCustomerDraft> {
  const table = toTable(input);
  const result: ParseResult<QboCustomerDraft> = { drafts: [], errors: [], skipped: [], warnings: [], headers: table.rawHeaders, headerLine: table.headerLine, rowCount: table.rows.length };
  if (!hasCol(table.headers, "customer", "customer name", "display name", "customer full name", "name", "client")) result.warnings.push("no Customer column found: check that this is a QuickBooks customer export");
  for (const { line, cells } of table.rows) {
    const warnings: string[] = [];
    const displayRaw = col(cells, "customer", "customer name", "display name", "customer full name", "name", "client");
    if (!displayRaw) { result.skipped.push({ line, reason: "no customer name" }); continue; }
    if (/^total\b/i.test(displayRaw)) { result.skipped.push({ line, reason: "report total line" }); continue; }
    const { name: noInactive, inactive } = stripInactiveSuffix(displayRaw);
    // Sub-customers: "Parent:Child" → the child is the customer, the parent a company hint.
    const segments = noInactive.split(":").map((s) => s.trim()).filter(Boolean);
    const leaf = segments[segments.length - 1] ?? noInactive;
    const parent = segments.length > 1 ? segments[0] : undefined;
    const stripped = stripCurrencySuffix(leaf);
    const currency = normCurrency(col(cells, "currency", "currency code")) ?? stripped.currency;
    const companyCol = stripCurrencySuffix(col(cells, "company", "company name")).name;
    const fullName = col(cells, "full name", "contact", "contact name");
    const first = col(cells, "first name", "given name");
    const last = col(cells, "last name", "family name");
    const address = col(cells, "billing address", "bill address", "address", "billing street") || undefined;
    const countryCol = col(cells, "billing country", "country", "country region");
    const email = normEmail(col(cells, "email", "email address", "customer email"));
    const rawEmail = col(cells, "email", "email address", "customer email");
    if (rawEmail && !email) warnings.push(`invalid email "${rawEmail}" dropped`);
    const phone = cleanPhone(col(cells, "phone", "phone numbers", "phone number", "mobile", "telephone"));
    const npwp = col(cells, "tax id", "npwp", "tax resale no", "tax registration number", "vat number") || undefined;
    const balanceRaw = col(cells, "open balance", "balance", "amount due", "balance due");
    const openBalance = balanceRaw ? parseAmount(balanceRaw) : undefined;
    const notesParts: string[] = [];
    const customerType = col(cells, "customer type", "type");
    if (customerType) notesParts.push(`QBO customer type: ${customerType}`);
    const noteCol = col(cells, "notes", "note", "memo");
    if (noteCol) notesParts.push(noteCol);
    if (parent) notesParts.push(`QBO sub-customer of: ${parent}`);
    const base = {
      displayName: displayRaw.trim(), qboCustomerId: col(cells, "customer id", "id", "customer no") || displayRaw.trim(), currency, email, phone, address, npwp,
      openBalance, inactive, notes: notesParts.length ? notesParts.join("\n") : undefined, line, warnings,
    };
    const isCompany = looksLikeCompany(stripped.name) || (companyCol !== "" && normName(companyCol) === normName(stripped.name));
    if (isCompany) {
      const guess = guessEntityType(stripped.name, [address, countryCol, customerType].filter(Boolean).join("\n"));
      const contactName = fullName || [first, last].filter(Boolean).join(" ");
      const contact = contactName && normName(contactName) !== normName(stripped.name) ? splitPersonName(contactName) : undefined;
      result.drafts.push({
        ...base, kind: "company", name: stripped.name, entityType: guess.type, country: countryCode(countryCol) ?? guess.country,
        firstName: contact?.firstName, lastName: contact?.lastName,
      });
    } else {
      const person = first || last ? { firstName: first, lastName: last } : splitPersonName(fullName || stripped.name);
      if (!person.firstName && !person.lastName) { result.errors.push({ line, message: `cannot read a name from "${displayRaw}"` }); continue; }
      const companyName = companyCol && normName(companyCol) !== normName(stripped.name) ? companyCol : parent && looksLikeCompany(parent) ? stripCurrencySuffix(parent).name : undefined;
      result.drafts.push({ ...base, kind: "contact", name: stripped.name, firstName: person.firstName, lastName: person.lastName, companyName, country: countryCode(countryCol) });
    }
  }
  return result;
}

// ---------- QuickBooks invoices ----------

export interface InvoiceDraftLine { description: string; qty: number; unitPrice: number; amount: number }

export interface InvoiceDraft {
  qboDocNumber: string;
  date: string;
  dueDate: string;
  /** Customer display name as exported (currency suffix kept, so it matches QboCustomerDraft.displayName). */
  customerName: string;
  email?: string;
  currency: string;
  /** IDR per unit from an "Exchange rate" column, when the export has one and the invoice is not in IDR. */
  fxRate?: number;
  lines: InvoiceDraftLine[];
  total: number;
  openBalance: number;
  amountPaid: number;
  status: "sent" | "partial" | "paid" | "void";
  memo?: string;
  line: number;
  warnings: string[];
}

export interface QboInvoiceOptions { dateFormat?: DateFormat }

export interface InvoiceParseResult extends ParseResult<InvoiceDraft> {
  /** Currencies seen, so the UI can ask for an IDR rate per currency. */
  currencies: string[];
  hasOpenBalanceColumn: boolean;
}

const INV_DATE = ["date", "transaction date", "txn date", "invoice date"];
const INV_NUM = ["num", "no", "number", "invoice no", "invoice number", "invoice", "doc number", "doc no", "ref no", "reference"];
const INV_CUSTOMER = ["customer", "customer name", "customer full name", "name", "client"];
const INV_OPEN = ["open balance", "balance", "amount due", "balance due", "open amount"];
const INV_AMOUNT = ["amount", "line amount", "total", "total amount", "invoice total"];

/**
 * Grouped reports (Open Invoices, Unpaid Bills, Transaction List by Customer / Vendor) print the customer or vendor
 * alone on a heading row, in the unnamed first column, above its lines. Returns that name for such a row.
 */
function groupHeading(cells: Record<string, string>): string | undefined {
  const filled = Object.entries(cells).filter(([, v]) => v !== "");
  if (filled.length !== 1) return undefined;
  const [key, value] = filled[0];
  return /^column \d+$/.test(key) && !/^total\b/i.test(value) ? value : undefined;
}

/**
 * Maps a QBO invoice export (Invoice List or Open Invoices report, Sales → Invoices export, or a Transaction List by
 * Customer filtered to invoices) to one draft per document number. Several rows with the same number become lines of
 * one invoice. In a report grouped by customer the heading row names the customer; a report with an Open Balance
 * column only (Open Invoices) takes the open balance as the invoice total.
 */
export function parseQboInvoices(input: TableInput, opts: QboInvoiceOptions = {}): InvoiceParseResult {
  const table = toTable(input);
  const result: InvoiceParseResult = { drafts: [], errors: [], skipped: [], warnings: [], headers: table.rawHeaders, headerLine: table.headerLine, rowCount: table.rows.length, currencies: [], hasOpenBalanceColumn: hasCol(table.headers, ...INV_OPEN) };
  const fmt = resolveFormat(opts.dateFormat, table.rows.map((r) => col(r.cells, ...INV_DATE)));
  const hasTotalCol = hasCol(table.headers, "total", "total amount", "invoice total");
  const byNumber = new Map<string, InvoiceDraft>();
  if (!result.hasOpenBalanceColumn) result.warnings.push("no Open Balance column: invoices are imported as unpaid unless a Status column says paid");
  if (!hasCol(table.headers, ...INV_NUM)) result.warnings.push("no invoice number column (Num / No.): every row will be rejected");
  if (opts.dateFormat === "auto" || !opts.dateFormat) result.warnings.push(`numeric dates read as ${DATE_FORMAT_LABELS[fmt]}`);
  const amountFromOpen = !hasCol(table.headers, ...INV_AMOUNT) && result.hasOpenBalanceColumn;
  if (amountFromOpen) result.warnings.push("no Amount column: the open balance is taken as the invoice total");
  let group = "";
  for (const { line, cells } of table.rows) {
    const heading = groupHeading(cells);
    if (heading) { group = heading; continue; }
    const type = col(cells, "type", "transaction type");
    const num = col(cells, ...INV_NUM);
    const dateRaw = col(cells, ...INV_DATE);
    const ownCustomer = col(cells, ...INV_CUSTOMER);
    const firstCell = Object.values(cells).find((v) => v !== "") ?? "";
    if (/^total\b/i.test(firstCell) && !num) { result.skipped.push({ line, reason: "report total line" }); continue; }
    if (!num && !dateRaw && !ownCustomer) continue;
    if (type && !/invoice/i.test(type)) { result.skipped.push({ line, reason: `transaction type "${type}"` }); continue; }
    if (!num) { result.errors.push({ line, message: "missing invoice number" }); continue; }
    const date = parseDate(dateRaw, fmt);
    if (!date) { result.errors.push({ line, message: dateRaw ? `unreadable date "${dateRaw}"` : "missing date" }); continue; }
    const customerRaw = ownCustomer || group;
    if (!customerRaw) { result.errors.push({ line, message: "missing customer" }); continue; }
    const amount = parseAmount(col(cells, ...(amountFromOpen ? INV_OPEN : INV_AMOUNT)));
    const qtyRaw = col(cells, "qty", "quantity");
    const qty = qtyRaw ? parseAmount(qtyRaw) || 1 : 1;
    const item = col(cells, "product service", "product/service", "item", "service");
    const memo = col(cells, "memo description", "memo", "description", "line description", "line memo");
    const description = memo || item || "Services";
    const key = num.trim();
    const existing = byNumber.get(key);
    if (existing) {
      existing.lines.push({ description, qty, unitPrice: qty ? amount / qty : amount, amount });
      continue;
    }
    const warnings: string[] = [];
    const stripped = stripCurrencySuffix(customerRaw);
    const currency = normCurrency(col(cells, "currency", "currency code")) ?? stripped.currency ?? "IDR";
    const fxRaw = col(cells, "exchange rate", "fx rate", "rate of exchange");
    const fx = fxRaw ? parseAmount(fxRaw) : 0;
    const dueDate = parseDate(col(cells, "due date", "due"), fmt) ?? date;
    const statusCol = col(cells, "status", "a r paid", "paid status", "payment status").toLowerCase();
    const openRaw = col(cells, ...INV_OPEN);
    const draft: InvoiceDraft = {
      qboDocNumber: key, date, dueDate, customerName: customerRaw.trim(), email: normEmail(col(cells, "email", "customer email")),
      currency, fxRate: currency !== "IDR" && fx > 1 ? fx : undefined,
      lines: [{ description, qty, unitPrice: qty ? amount / qty : amount, amount }],
      total: hasTotalCol ? parseAmount(col(cells, "total", "total amount", "invoice total")) || amount : amount,
      openBalance: openRaw ? parseAmount(openRaw) : Number.NaN, amountPaid: 0,
      status: /void|delet/.test(statusCol) ? "void" : "sent", memo: memo && memo !== description ? memo : undefined, line, warnings,
    };
    if (!openRaw) {
      if (/paid/.test(statusCol) && !/partial|unpaid|not paid/.test(statusCol)) draft.openBalance = 0;
      else if (/partial/.test(statusCol)) { draft.openBalance = Number.NaN; warnings.push("partially paid but no open balance column: imported as unpaid"); }
    }
    byNumber.set(key, draft);
  }
  const currencies = new Set<string>();
  for (const d of byNumber.values()) {
    if (d.lines.length > 1 || !hasTotalCol) d.total = roundMoney(d.lines.reduce((s, l) => s + l.amount, 0));
    if (Number.isNaN(d.openBalance)) d.openBalance = d.status === "void" ? 0 : d.total;
    if (d.status === "void") { result.skipped.push({ line: d.line, reason: `invoice ${d.qboDocNumber} is voided` }); continue; }
    if (d.total < 0) { result.skipped.push({ line: d.line, reason: `invoice ${d.qboDocNumber} has a negative total (credit memo?)` }); continue; }
    d.openBalance = Math.max(0, Math.min(d.total, d.openBalance));
    d.amountPaid = roundMoney(Math.max(0, d.total - d.openBalance));
    d.status = d.openBalance <= 0 ? "paid" : d.openBalance >= d.total ? "sent" : "partial";
    if (d.total === 0) d.warnings.push("zero amount");
    currencies.add(d.currency);
    result.drafts.push(d);
  }
  result.drafts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.qboDocNumber.localeCompare(b.qboDocNumber, undefined, { numeric: true })));
  result.currencies = [...currencies].sort();
  return result;
}

// ---------- QuickBooks account list (per entity) ----------

export interface AccountDraft {
  /** Account exactly as QBO exports it ("Parent:Child"); stored on the matched/created account as `qboName`. */
  qboName: string;
  /** Leaf name ("Child"). */
  name: string;
  parentQboName?: string;
  qboType: string;
  detailType?: string;
  /** Account number column, when the QBO file has numbers turned on. */
  number?: string;
  balance?: number;
  type: AccountType;
  subtype: AccountSubtype;
  line: number;
  warnings: string[];
}

/**
 * QBO account type (+ detail type, + name as a last hint) → our type/subtype. Detail types refine the broad QBO
 * groups: "Accumulated depreciation" under Fixed Assets, tax payables under Other Current Liabilities, Retained
 * Earnings under Equity, FX gains/losses, payroll and depreciation under Expenses. Unknown types → undefined.
 */
export function mapQboAccount(qboType: string, detailType = "", name = ""): { type: AccountType; subtype: AccountSubtype } | undefined {
  const t = ` ${normName(qboType)} `;
  const d = normName(`${detailType} ${name}`);
  const pick = (type: AccountType, subtype: AccountSubtype) => ({ type, subtype });
  if (/ bank | cash and cash equivalents /.test(t)) return pick("asset", /\bcash\b|\bpetty\b|\bkas\b/.test(d) ? "cash" : "bank");
  if (/ accounts receivable | a r | receivable /.test(t) && !/other current/.test(t)) return pick("asset", "ar");
  if (/ other current asset/.test(t)) {
    if (/prepaid|dibayar di muka/.test(d) && !/tax|pajak|vat|ppn|pph/.test(d)) return pick("asset", "prepaid");
    if (/inventory|persediaan|stock/.test(d)) return pick("asset", "inventory");
    if (/tax|pajak|vat|ppn|pph|gst/.test(d)) return pick("asset", "prepaid_tax");
    if (/deposit|jaminan/.test(d)) return pick("asset", "prepaid");
    return pick("asset", "other_receivable");
  }
  if (/ fixed asset| property plant | tangible /.test(t)) return pick("asset", /accumulated|akumulasi/.test(d) ? "accum_depr" : "fixed_asset");
  if (/ other asset/.test(t)) return pick("asset", /accumulated|akumulasi/.test(d) ? "accum_depr" : /deposit|jaminan/.test(d) ? "prepaid" : "other_asset");
  if (/ accounts payable | a p /.test(t) || (/ payable /.test(t) && !/other current/.test(t))) return pick("liability", "ap");
  if (/ credit card /.test(t)) return pick("liability", "other_liability");
  if (/ other current liabilit/.test(t)) {
    if (/tax|pajak|vat|ppn|pph|gst|bpjs/.test(d)) return pick("liability", "tax_payable");
    if (/accru|masih harus/.test(d)) return pick("liability", "accrued");
    if (/deposit|unearned|deferred|uang muka/.test(d)) return pick("liability", "customer_deposit");
    if (/loan|line of credit|pinjaman/.test(d)) return pick("liability", "loan");
    return pick("liability", "other_liability");
  }
  if (/ long term liabilit| long-term /.test(t) || / liabilit/.test(t)) return pick("liability", "loan");
  if (/ equity | modal /.test(t)) {
    if (/retained|laba ditahan|current year|net income|laba tahun/.test(d)) return pick("equity", "retained_earnings");
    if (/dividend|distribution|draw|prive/.test(d)) return pick("equity", "dividend");
    return pick("equity", "share_capital");
  }
  if (/ other income | other revenue /.test(t)) return pick("revenue", /exchange|currency|kurs|fx/.test(d) ? "fx_gain" : "other_income");
  if (/ income | revenue | sales | pendapatan /.test(t)) return pick("revenue", "sales");
  if (/ cost of goods | cost of sales | cogs | harga pokok /.test(t)) return pick("expense", "cogs");
  if (/ other expense/.test(t)) {
    if (/exchange|currency|kurs|fx/.test(d)) return pick("expense", "fx_loss");
    if (/depreciation|amorti|penyusutan/.test(d)) return pick("expense", "depreciation");
    if (/income tax|corporate tax|pph badan|profits tax/.test(d)) return pick("expense", "tax_expense");
    return pick("expense", "other_expense");
  }
  if (/ expense| beban /.test(t)) {
    if (/payroll|salar|wage|gaji|upah/.test(d)) return pick("expense", "payroll");
    if (/depreciation|amorti|penyusutan/.test(d)) return pick("expense", "depreciation");
    if (/exchange|currency|kurs|fx/.test(d)) return pick("expense", "fx_loss");
    if (/income tax|corporate tax|pph badan|profits tax/.test(d)) return pick("expense", "tax_expense");
    return pick("expense", "opex");
  }
  return undefined;
}

/** Leading digit of our codes by type (revenue 4/7, expense 5/6/8/9 by subtype, matching lib/coa.ts). */
export function accountGroupDigit(type: AccountType, subtype: AccountSubtype): string {
  if (type === "revenue") return subtype === "other_income" || subtype === "fx_gain" ? "7" : "4";
  if (type === "expense") return subtype === "cogs" ? "5" : subtype === "other_expense" || subtype === "fx_loss" ? "8" : subtype === "tax_expense" ? "9" : "6";
  return type === "asset" ? "1" : type === "liability" ? "2" : "3";
}

/** First code tried per subtype (then +10 until free), chosen to sit next to the template accounts of lib/coa.ts. */
const CODE_START: Record<AccountSubtype, number> = {
  cash: 1010, bank: 1120, ar: 1230, other_receivable: 1230, inventory: 1510, prepaid: 1320, prepaid_tax: 1440, fixed_asset: 2600, accum_depr: 2610, other_asset: 2700,
  ap: 1010, tax_payable: 1370, accrued: 1110, customer_deposit: 1210, loan: 2110, other_liability: 2300,
  share_capital: 1200, retained_earnings: 2010, current_earnings: 2110, dividend: 3100,
  sales: 1400, other_income: 1300, fx_gain: 1120,
  cogs: 1400, opex: 3000, payroll: 1050, depreciation: 2120, tax_expense: 1300, fx_loss: 1120, other_expense: 1300,
};

/** Next free "D-NNNN" code for the type/subtype, skipping codes in `taken` (existing accounts and earlier allocations). */
export function allocateAccountCode(type: AccountType, subtype: AccountSubtype, taken: Set<string>): string {
  const digit = accountGroupDigit(type, subtype);
  for (let n = CODE_START[subtype]; n <= 9999; n += 10) { const code = `${digit}-${n}`; if (!taken.has(code)) return code; }
  for (let n = 1000; n <= 9999; n++) { const code = `${digit}-${n}`; if (!taken.has(code)) return code; }
  throw new Error(`No free account code left in group ${digit}.`);
}

/** QBO account number → our "D-NNNN" code: "1-1100" kept, "1100" prefixed with the group digit, "11100" split; anything else → undefined. */
export function qboNumberToCode(number: string | undefined, type: AccountType, subtype: AccountSubtype): string | undefined {
  const s = (number ?? "").trim();
  if (/^\d-\d{4}$/.test(s)) return s;
  if (/^\d{4}$/.test(s)) return `${accountGroupDigit(type, subtype)}-${s}`;
  if (/^\d{5}$/.test(s)) return `${s[0]}-${s.slice(1)}`;
  return undefined;
}

const ACC_NAME = ["account", "account name", "full name", "account full name", "name", "column 1"];

/** Maps a QBO Reports → Account List export (Account, Type, Detail type, Account number, Balance) to drafts. */
export function parseQboAccounts(input: TableInput): ParseResult<AccountDraft> {
  const table = toTable(input);
  const result: ParseResult<AccountDraft> = { drafts: [], errors: [], skipped: [], warnings: [], headers: table.rawHeaders, headerLine: table.headerLine, rowCount: table.rows.length };
  if (!hasCol(table.headers, "type", "account type")) result.warnings.push("no Type column: every row will be rejected (export Reports → Account List with the Type column)");
  if (!hasCol(table.headers, "account number", "number", "account no", "acct no")) result.warnings.push("no Account number column: new accounts get the next free code in their group");
  for (const { line, cells } of table.rows) {
    const qboName = col(cells, ...ACC_NAME).replace(/\s+/g, " ").trim();
    if (!qboName) { result.skipped.push({ line, reason: "no account name" }); continue; }
    if (/^total\b/i.test(qboName)) { result.skipped.push({ line, reason: "report total line" }); continue; }
    const qboType = col(cells, "account type", "type");
    const detailType = col(cells, "detail type", "detail") || undefined;
    const segments = qboName.split(":").map((s) => s.trim()).filter(Boolean);
    const name = segments[segments.length - 1] ?? qboName;
    const parentQboName = segments.length > 1 ? segments.slice(0, -1).join(":") : undefined;
    const mapped = qboType ? mapQboAccount(qboType, detailType, name) : undefined;
    if (!mapped) { result.errors.push({ line, message: qboType ? `unknown QuickBooks account type "${qboType}" for ${qboName}` : `${qboName}: no account type` }); continue; }
    const number = col(cells, "account number", "number", "account no", "acct no") || undefined;
    const balanceRaw = col(cells, "balance", "current balance", "total balance", "quickbooks balance");
    result.drafts.push({ qboName, name, parentQboName, qboType, detailType, number, balance: balanceRaw ? parseAmount(balanceRaw) : undefined, ...mapped, line, warnings: [] });
  }
  return result;
}

// ---------- QuickBooks trial balance (opening balances) ----------

export interface TrialBalanceRow { account: string; debit: number; credit: number; line: number }

export interface TrialBalanceParseResult extends ParseResult<TrialBalanceRow> {
  /** "As of" date read from the report title lines, when present (the last day when the report covers a range). */
  asOf?: string;
  /** First day of the range, when the title gives one ("January - October, 2026"): income and expenses start there. */
  from?: string;
  totalDebit: number;
  totalCredit: number;
}

const DEBIT_COLS = ["debit", "debit amount", "dr", "debet"];
const CREDIT_COLS = ["credit", "credit amount", "cr", "kredit"];

/** Maps a QBO Reports → Trial Balance export (Account, Debit, Credit; totals dropped) to one row per account. */
export function parseQboTrialBalance(input: TableInput): TrialBalanceParseResult {
  const table = toTable(input);
  const result: TrialBalanceParseResult = { drafts: [], errors: [], skipped: [], warnings: [], headers: table.rawHeaders, headerLine: table.headerLine, rowCount: table.rows.length, totalDebit: 0, totalCredit: 0 };
  const period = parseReportPeriod(table.periodLine);
  result.asOf = period.to;
  result.from = period.from;
  if (!hasCol(table.headers, ...DEBIT_COLS) || !hasCol(table.headers, ...CREDIT_COLS)) result.warnings.push("no Debit / Credit columns found: check that this is the Trial Balance report");
  for (const { line, cells } of table.rows) {
    const account = col(cells, ...ACC_NAME).replace(/\s+/g, " ").trim();
    const debitRaw = col(cells, ...DEBIT_COLS);
    const creditRaw = col(cells, ...CREDIT_COLS);
    if (/^total\b/i.test(account)) { result.skipped.push({ line, reason: "report total line" }); continue; }
    if (!account) { if (debitRaw || creditRaw) result.skipped.push({ line, reason: "amounts without an account (report total)" }); continue; }
    let debit = parseAmount(debitRaw), credit = parseAmount(creditRaw);
    if (debit < 0) { credit += -debit; debit = 0; }
    if (credit < 0) { debit += -credit; credit = 0; }
    if (debit === 0 && credit === 0) { result.skipped.push({ line, reason: `${account}: zero balance` }); continue; }
    result.drafts.push({ account, debit, credit, line });
    result.totalDebit += debit; result.totalCredit += credit;
  }
  result.totalDebit = roundMoney(result.totalDebit); result.totalCredit = roundMoney(result.totalCredit);
  if (result.drafts.length && result.totalDebit !== result.totalCredit) result.warnings.push(`debits (${result.totalDebit}) and credits (${result.totalCredit}) do not balance in the file`);
  return result;
}

export interface OpeningLinesResult { lines: JournalLine[]; unmatched: TrialBalanceRow[]; /** debits − credits before balancing (IDR, to the cent). */ difference: number }

/**
 * Trial balance rows → opening journal lines in IDR (one line per resolved account, rows on the same account
 * netted). Rows whose account cannot be resolved come back in `unmatched`. A residual rounding difference is
 * booked to `balanceTo` when given, else left in `difference` for the caller to refuse.
 */
export function openingLinesFromTrialBalance(rows: TrialBalanceRow[], resolve: (qboName: string) => Account | undefined, opts: { balanceTo?: Account; description?: string } = {}): OpeningLinesResult {
  const net = new Map<string, { account: Account; net: number }>();
  const unmatched: TrialBalanceRow[] = [];
  for (const r of rows) {
    const account = resolve(r.account);
    if (!account) { unmatched.push(r); continue; }
    const cur = net.get(account.id) ?? { account, net: 0 };
    cur.net += roundMoney(r.debit) - roundMoney(r.credit);
    net.set(account.id, cur);
  }
  const lines: JournalLine[] = [];
  let difference = 0;
  for (const { account, net: raw } of net.values()) {
    const n = roundMoney(raw);
    if (n === 0) continue;
    lines.push({ accountId: account.id, accountCode: account.code, description: opts.description, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 });
    difference = roundMoney(difference + n);
  }
  if (difference !== 0 && opts.balanceTo) {
    const b = opts.balanceTo;
    lines.push({ accountId: b.id, accountCode: b.code, description: "Rounding difference on opening balances", debit: difference < 0 ? -difference : 0, credit: difference > 0 ? difference : 0 });
    difference = 0;
  }
  return { lines, unmatched, difference };
}

// ---------- QuickBooks journal (full history) ----------

export interface JournalDraftLine { account: string; debit: number; credit: number; description?: string; name?: string; line: number }

export interface JournalDraft {
  date: string;
  type: string;
  num: string;
  name: string;
  /** First memo of the transaction, for display. */
  memo?: string;
  lines: JournalDraftLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  line: number;
  warnings: string[];
}

export interface QboJournalOptions { dateFormat?: DateFormat }

/** "Invoice 1041 PT Example", skipping empty parts. */
export function journalLabel(d: Pick<JournalDraft, "type" | "num" | "name">): string {
  return [d.type, d.num, d.name].filter(Boolean).join(" ");
}

const JRN_TYPE = ["transaction type", "type", "txn type"];
const JRN_NAME = ["name", "customer", "vendor", "supplier", "payee", "customer vendor"];
const JRN_ACCOUNT = ["account", "account name", "account full name", "split"];
const JRN_MEMO = ["memo description", "memo", "description", "line description"];

/**
 * Maps a QBO Reports → Journal export to one draft per transaction. The report shows Date / Type / Num / Name on
 * the first line of a transaction only and repeats its header per group; a group ends on its subtotal line (amounts
 * without an account). Consecutive dated rows with the same (date, type, num, name) are the same transaction, so
 * flat exports that repeat the date on every line work too. Debits in parentheses or negative are credits.
 */
export function parseQboJournal(input: TableInput, opts: QboJournalOptions = {}): ParseResult<JournalDraft> {
  const table = toTable(input);
  const result: ParseResult<JournalDraft> = { drafts: [], errors: [], skipped: [], warnings: [], headers: table.rawHeaders, headerLine: table.headerLine, rowCount: table.rows.length };
  const fmt = resolveFormat(opts.dateFormat, table.rows.map((r) => col(r.cells, ...INV_DATE)));
  if (!hasCol(table.headers, ...JRN_ACCOUNT)) result.warnings.push("no Account column: every row will be rejected (export Reports → Journal)");
  if (opts.dateFormat === "auto" || !opts.dateFormat) result.warnings.push(`numeric dates read as ${DATE_FORMAT_LABELS[fmt]}`);
  let current: JournalDraft | null = null;
  let currentKey = "";
  for (const { line, cells } of table.rows) {
    const dateRaw = col(cells, ...INV_DATE);
    const account = col(cells, ...JRN_ACCOUNT).replace(/\s+/g, " ").trim();
    const debitRaw = col(cells, ...DEBIT_COLS), creditRaw = col(cells, ...CREDIT_COLS), amountRaw = col(cells, "amount");
    const firstCell = Object.values(cells).find((v) => v !== "") ?? "";
    if (/^total\b/i.test(firstCell) || /^total\b/i.test(dateRaw)) { result.skipped.push({ line, reason: "report total line" }); current = null; continue; }
    // QBO repeats the header row before each transaction group.
    if (normHeader(dateRaw) === "date" && normHeader(account) === "account") { result.skipped.push({ line, reason: "repeated header" }); continue; }
    if (!account) {
      if (!dateRaw) { if (debitRaw || creditRaw) current = null; continue; } // group subtotal (amounts only) or spacer line
      result.errors.push({ line, message: "line without an account" }); continue;
    }
    if (dateRaw) {
      const date = parseDate(dateRaw, fmt);
      if (!date) { result.errors.push({ line, message: `unreadable date "${dateRaw}"` }); current = null; continue; }
      const type = col(cells, ...JRN_TYPE).trim(), num = col(cells, "num", "no", "number", "ref no", "reference").trim(), name = col(cells, ...JRN_NAME).trim();
      const key = `${date}|${normName(type)}|${num}|${normName(name)}`;
      if (!current || key !== currentKey) {
        current = { date, type, num, name, lines: [], totalDebit: 0, totalCredit: 0, balanced: false, line, warnings: [] };
        currentKey = key;
        result.drafts.push(current);
      }
    } else if (!current) { result.errors.push({ line, message: "line without a date and no transaction above it" }); continue; }
    let debit = parseAmount(debitRaw), credit = parseAmount(creditRaw);
    if (!debitRaw && !creditRaw && amountRaw) { const a = parseAmount(amountRaw); if (a >= 0) debit = a; else credit = -a; }
    if (debit < 0) { credit += -debit; debit = 0; }
    if (credit < 0) { debit += -credit; credit = 0; }
    const memo = col(cells, ...JRN_MEMO).trim();
    const lineName = col(cells, ...JRN_NAME).trim();
    current.lines.push({ account, debit, credit, description: memo || undefined, name: lineName || undefined, line });
    if (!current.memo && memo) current.memo = memo;
  }
  const drafts: JournalDraft[] = [];
  for (const d of result.drafts) {
    d.lines = d.lines.filter((l) => l.debit !== 0 || l.credit !== 0);
    if (d.lines.length === 0) { result.skipped.push({ line: d.line, reason: `${d.type} ${d.num}: no amounts` }); continue; }
    d.totalDebit = roundMoney(d.lines.reduce((s, l) => s + l.debit, 0));
    d.totalCredit = roundMoney(d.lines.reduce((s, l) => s + l.credit, 0));
    d.balanced = d.totalDebit === d.totalCredit;
    if (!d.balanced) result.errors.push({ line: d.line, message: `${journalLabel(d)}: debits ${d.totalDebit} ≠ credits ${d.totalCredit}` });
    else drafts.push(d);
  }
  result.drafts = drafts;
  return result;
}

/** FNV-1a over a string, in base 36: a short, stable discriminator (no crypto: this module also runs in the browser). */
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/**
 * `sourceId` of each journal draft, the key that makes a re-run skip what is already posted: "qbo:<type>:<num or
 * name>:<date>" (`base`, also what older imports stored). QuickBooks leaves many transactions unnumbered (deposits,
 * transfers, expenses), so several of one day can share that key: those get a hash of their lines appended, and a
 * running number when even the lines are equal, so every transaction of the file is posted exactly once.
 */
export function journalSourceIds(drafts: Array<Pick<JournalDraft, "type" | "num" | "name" | "date" | "lines">>): Array<{ base: string; sourceId: string }> {
  const bases = drafts.map((d) => `qbo:${d.type.trim() || "txn"}:${d.num || normName(d.name).replace(/ /g, "-") || "-"}:${d.date}`);
  const count = new Map<string, number>();
  for (const b of bases) count.set(b, (count.get(b) ?? 0) + 1);
  const seen = new Map<string, number>();
  return drafts.map((d, i) => {
    const base = bases[i];
    if (count.get(base) === 1) return { base, sourceId: base };
    const id = `${base}:${shortHash(d.lines.map((l) => `${normName(l.account)}|${roundMoney(l.debit)}|${roundMoney(l.credit)}`).sort().join(";"))}`;
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    return { base, sourceId: n === 1 ? id : `${id}:${n}` };
  });
}

// ---------- QuickBooks bills ----------

export interface BillDraftLine { description: string; amount: number }

export interface BillDraft {
  qboDocNumber: string;
  date: string;
  dueDate: string;
  vendorName: string;
  currency: string;
  fxRate?: number;
  lines: BillDraftLine[];
  total: number;
  openBalance: number;
  amountPaid: number;
  status: "sent" | "partial" | "paid" | "void";
  memo?: string;
  line: number;
  warnings: string[];
}

export interface QboBillOptions { dateFormat?: DateFormat }

export interface BillParseResult extends ParseResult<BillDraft> { currencies: string[]; hasOpenBalanceColumn: boolean }

const BILL_NUM = ["num", "no", "number", "bill no", "bill number", "ref no", "reference", "doc number", "vendor invoice no", "supplier invoice no"];
const BILL_VENDOR = ["vendor", "supplier", "vendor name", "supplier name", "payee", "name"];
const BILL_AMOUNT = ["amount", "line amount", "total", "total amount", "bill total"];

/**
 * Maps a QBO bill export (Expenses → Bills export, Reports → Unpaid Bills or Bill List) to one draft per bill
 * number; several rows with the same number become lines. Bills without a number are keyed by date, vendor and
 * amount so re-running the file still skips them. Bill payments and other transaction types are skipped. Unpaid
 * Bills is grouped by vendor (the heading row names it) and may carry the open balance only, taken as the total.
 */
export function parseQboBills(input: TableInput, opts: QboBillOptions = {}): BillParseResult {
  const table = toTable(input);
  const result: BillParseResult = { drafts: [], errors: [], skipped: [], warnings: [], headers: table.rawHeaders, headerLine: table.headerLine, rowCount: table.rows.length, currencies: [], hasOpenBalanceColumn: hasCol(table.headers, ...INV_OPEN) };
  const fmt = resolveFormat(opts.dateFormat, table.rows.map((r) => col(r.cells, ...INV_DATE, "bill date")));
  const hasTotalCol = hasCol(table.headers, "total", "total amount", "bill total");
  if (!result.hasOpenBalanceColumn) result.warnings.push("no Open Balance column: bills are imported as unpaid unless a Status column says paid");
  if (opts.dateFormat === "auto" || !opts.dateFormat) result.warnings.push(`numeric dates read as ${DATE_FORMAT_LABELS[fmt]}`);
  const amountFromOpen = !hasCol(table.headers, ...BILL_AMOUNT) && result.hasOpenBalanceColumn;
  if (amountFromOpen) result.warnings.push("no Amount column: the open balance is taken as the bill total");
  const byNumber = new Map<string, BillDraft>();
  let group = "", grouped = false;
  for (const { line, cells } of table.rows) {
    const heading = groupHeading(cells);
    if (heading) { group = stripInactiveSuffix(heading).name; grouped = true; continue; }
    const type = col(cells, ...JRN_TYPE);
    const numRaw = col(cells, ...BILL_NUM).trim();
    const dateRaw = col(cells, ...INV_DATE, "bill date");
    const ownVendor = col(cells, ...BILL_VENDOR).trim();
    const firstCell = Object.values(cells).find((v) => v !== "") ?? "";
    if (/^total\b/i.test(firstCell) && !numRaw) { result.skipped.push({ line, reason: "report total line" }); continue; }
    if (!numRaw && !dateRaw && !ownVendor) continue;
    if (type && (!/^bill\b/i.test(type) || /payment/i.test(type))) { result.skipped.push({ line, reason: `transaction type "${type}"` }); continue; }
    const date = parseDate(dateRaw, fmt);
    if (!date) { result.errors.push({ line, message: dateRaw ? `unreadable date "${dateRaw}"` : "missing date" }); continue; }
    const vendorRaw = ownVendor || group;
    if (!vendorRaw) { result.errors.push({ line, message: "missing vendor" }); continue; }
    const amount = parseAmount(col(cells, ...(amountFromOpen ? INV_OPEN : BILL_AMOUNT)));
    const memo = col(cells, ...JRN_MEMO).trim();
    const description = memo || "Purchases";
    const key = numRaw || `${date}/${normName(vendorRaw)}/${amount}`;
    const existing = byNumber.get(key);
    if (existing) { existing.lines.push({ description, amount }); continue; }
    const warnings: string[] = [];
    if (!numRaw) warnings.push("no bill number: keyed by date, vendor and amount");
    const currency = normCurrency(col(cells, "currency", "currency code")) ?? stripCurrencySuffix(vendorRaw).currency ?? "IDR";
    const fx = parseAmount(col(cells, "exchange rate", "fx rate", "rate of exchange"));
    const statusCol = col(cells, "status", "a p paid", "paid status", "payment status").toLowerCase();
    const openRaw = col(cells, ...INV_OPEN);
    const draft: BillDraft = {
      qboDocNumber: key, date, dueDate: parseDate(col(cells, "due date", "due"), fmt) ?? date, vendorName: stripCurrencySuffix(vendorRaw).name, currency, fxRate: currency !== "IDR" && fx > 1 ? fx : undefined,
      lines: [{ description, amount }], total: hasTotalCol ? parseAmount(col(cells, "total", "total amount", "bill total")) || amount : amount,
      openBalance: openRaw ? parseAmount(openRaw) : Number.NaN, amountPaid: 0, status: /void|delet/.test(statusCol) ? "void" : "sent", memo: memo && memo !== description ? memo : undefined, line, warnings,
    };
    if (!openRaw) {
      if (/paid/.test(statusCol) && !/partial|unpaid|not paid/.test(statusCol)) draft.openBalance = 0;
      else if (/partial/.test(statusCol)) warnings.push("partially paid but no open balance column: imported as unpaid");
    }
    byNumber.set(key, draft);
  }
  if (!hasCol(table.headers, ...BILL_VENDOR) && !grouped) result.warnings.push("no Vendor / Supplier column found: check that this is a bill export");
  const currencies = new Set<string>();
  for (const d of byNumber.values()) {
    if (d.lines.length > 1 || !hasTotalCol) d.total = roundMoney(d.lines.reduce((s, l) => s + l.amount, 0));
    if (Number.isNaN(d.openBalance)) d.openBalance = d.status === "void" ? 0 : d.total;
    if (d.status === "void") { result.skipped.push({ line: d.line, reason: `bill ${d.qboDocNumber} is voided` }); continue; }
    if (d.total < 0) { result.skipped.push({ line: d.line, reason: `bill ${d.qboDocNumber} has a negative total (vendor credit?)` }); continue; }
    d.openBalance = Math.max(0, Math.min(d.total, d.openBalance));
    d.amountPaid = roundMoney(Math.max(0, d.total - d.openBalance));
    d.status = d.openBalance <= 0 ? "paid" : d.openBalance >= d.total ? "sent" : "partial";
    if (d.total === 0) d.warnings.push("zero amount");
    currencies.add(d.currency);
    result.drafts.push(d);
  }
  result.drafts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.qboDocNumber.localeCompare(b.qboDocNumber, undefined, { numeric: true })));
  result.currencies = [...currencies].sort();
  return result;
}

// ---------- QuickBooks vendors ----------

export interface VendorDraft { name: string; email?: string; phone?: string; npwp?: string; notes?: string; inactive: boolean; line: number; warnings: string[] }

/** Maps a QBO Reports → Vendor (Supplier) Contact List export, or Expenses → Vendors → Export, to vendor drafts. */
export function parseQboVendors(input: TableInput): ParseResult<VendorDraft> {
  const table = toTable(input);
  const result: ParseResult<VendorDraft> = { drafts: [], errors: [], skipped: [], warnings: [], headers: table.rawHeaders, headerLine: table.headerLine, rowCount: table.rows.length };
  const NAME = ["vendor", "supplier", "vendor name", "supplier name", "display name", "vendor full name", "supplier full name", "name", "company", "company name"];
  if (!hasCol(table.headers, ...NAME)) result.warnings.push("no Vendor / Supplier column found: check that this is the Vendor Contact List");
  for (const { line, cells } of table.rows) {
    const raw = col(cells, ...NAME);
    if (!raw) { result.skipped.push({ line, reason: "no vendor name" }); continue; }
    if (/^total\b/i.test(raw)) { result.skipped.push({ line, reason: "report total line" }); continue; }
    const { name: noInactive, inactive } = stripInactiveSuffix(raw);
    const stripped = stripCurrencySuffix(noInactive);
    const warnings: string[] = [];
    const rawEmail = col(cells, "email", "email address");
    const email = normEmail(rawEmail.split(/[,;]/)[0]);
    if (rawEmail && !email) warnings.push(`invalid email "${rawEmail}" dropped`);
    const notes: string[] = [];
    const contact = col(cells, "full name", "contact", "contact name");
    if (contact && normName(contact) !== normName(stripped.name)) notes.push(`Contact: ${contact}`);
    const address = col(cells, "address", "billing address", "bill address");
    if (address) notes.push(`Address: ${address}`);
    const accountNo = col(cells, "account number", "account no");
    if (accountNo) notes.push(`Account no. at the vendor: ${accountNo}`);
    if (stripped.currency && stripped.currency !== "IDR") notes.push(`Billed in ${stripped.currency}`);
    result.drafts.push({
      name: stripped.name, email, phone: cleanPhone(col(cells, "phone", "phone numbers", "phone number", "mobile", "telephone")),
      npwp: col(cells, "tax id", "npwp", "tax registration number", "vat number", "business id no") || undefined, notes: notes.length ? notes.join("\n") : undefined, inactive, line, warnings,
    });
  }
  return result;
}

// ---------- QuickBooks report detection (migration wizard) ----------

/** What an uploaded QuickBooks export is. `general_ledger` and `unknown` are recognised but never imported. */
export type QboReportKind = "accounts" | "journal" | "trial_balance" | "general_ledger" | "invoices" | "bills" | "customers" | "vendors" | "unknown";

/**
 * Tells which QuickBooks report a table is, from the report title printed above the header (when the export kept it)
 * and otherwise from the column set: Debit + Credit with a Date is the Journal, without one the Trial Balance; Split +
 * Balance is the General Ledger; Type + Detail type the Account List; a customer or vendor column with dates a
 * document list, without dates a contact list.
 */
export function detectQboReport(table: ParsedTable): { kind: QboReportKind; reason: string } {
  const title = normName(table.reportTitle);
  const byTitle: Array<[RegExp, QboReportKind]> = [
    [/^general ledger|^transaction detail by account/, "general_ledger"], [/^journal/, "journal"], [/^trial balance/, "trial_balance"], [/^account list|^chart of accounts/, "accounts"],
    [/^invoice list|^open invoices|^invoices and received payments/, "invoices"], [/^unpaid bills|^bill list|^bills and applied payments/, "bills"],
    [/^customer contact list|^customer list/, "customers"], [/^(vendor|supplier) contact list|^(vendor|supplier) list/, "vendors"],
  ];
  const titled = title ? byTitle.find(([re]) => re.test(title)) : undefined;
  if (titled) return { kind: titled[1], reason: `report title "${table.reportTitle}"` };
  const has = (...aliases: string[]) => hasCol(table.headers, ...aliases);
  const date = has(...INV_DATE, "bill date");
  const debitCredit = has(...DEBIT_COLS) && has(...CREDIT_COLS);
  if (debitCredit && date) return { kind: "journal", reason: "Date, Account, Debit and Credit columns" };
  if (debitCredit) return { kind: "trial_balance", reason: "Debit and Credit columns without dates" };
  if (date && has("split") && !has("account", "account name")) return { kind: "general_ledger", reason: "Split column with running balances" };
  if (!date && has("type", "account type") && (has("detail type") || has("account", "account name", "full name", "account full name"))) return { kind: "accounts", reason: "Type and Detail type columns" };
  if (date && has("vendor", "supplier", "vendor name", "supplier name", "payee")) return { kind: "bills", reason: "Vendor column with dates" };
  if (date && has(...INV_NUM) && (has("customer", "customer name", "customer full name", "client") || has("open balance", "due date"))) return { kind: "invoices", reason: "Customer / Num columns with dates" };
  if (!date && has("vendor", "supplier", "vendor name", "supplier name")) return { kind: "vendors", reason: "Vendor column without dates" };
  if (!date && has("customer", "customer name", "customer full name", "display name")) return { kind: "customers", reason: "Customer column without dates" };
  return { kind: "unknown", reason: table.reportTitle ? `report "${table.reportTitle}" is not one the migration reads` : "no known column set" };
}

/** Legal-form words dropped before two company names are compared ("PT Demo Villa" ≡ "Demo Villa, PT"). */
const LEGAL_FORM = new Set(["pt", "cv", "tbk", "pma", "pmdn", "ltd", "limited", "llc", "inc", "pty", "co", "corp", "company", "gmbh", "sarl", "sas", "bv", "opc"]);

/** True when the company printed in a file and the company chosen in the app are plausibly the same one. */
export function sameCompanyName(a: string | undefined, b: string | undefined): boolean {
  const key = (s: string | undefined) => normName(s).split(" ").filter((t) => t && !LEGAL_FORM.has(t)).join(" ");
  const x = key(a), y = key(b);
  if (!x || !y) return true; // nothing to compare
  return x === y || x.includes(y) || y.includes(x);
}

// ---------- Account names (matching and guessing) ----------

/** "1100 Bank Demo" → "Bank Demo", "6000 Expenses:6100 Rent" → "Expenses:Rent", "Old bank (deleted)" → "Old bank". */
export function cleanAccountName(qboName: string): string {
  return qboName.split(":").map((s) => s.trim().replace(/\s*\((deleted|inactive)\)\s*$/i, "").replace(/^\d[\d.\-]*\s+(?=\D)/, "").trim()).filter(Boolean).join(":");
}

/**
 * Account lookups for one entity: by code, by stored QBO name, by full name and by leaf name ("Parent:Child" →
 * "Child"), then the same again without account numbers and "(deleted)" marks, which QuickBooks adds on reports
 * ("1100 Bank Demo", "Old bank (deleted)") but not on the Account List.
 */
export function accountResolver(accounts: Account[]): (qboName: string, number?: string) => Account | undefined {
  const byCode = new Map(accounts.map((a) => [a.code, a] as const));
  const byQbo = new Map<string, Account>();
  const byName = new Map<string, Account>();
  for (const a of [...accounts].reverse()) {
    byName.set(normName(a.name), a);
    if (a.nameId) byName.set(normName(a.nameId), a);
    if (a.qboName) { byQbo.set(normName(a.qboName), a); byQbo.set(normName(cleanAccountName(a.qboName)), a); }
  }
  const find = (name: string): Account | undefined => {
    const key = normName(name);
    const leaf = normName(name.split(":").pop() ?? name);
    return byQbo.get(key) ?? byQbo.get(leaf) ?? byName.get(key) ?? byName.get(leaf);
  };
  return (qboName, number) => {
    const code = number && /^\d-\d{4}$/.test(number.trim()) ? byCode.get(number.trim()) : undefined;
    if (code) return code;
    const cleaned = cleanAccountName(qboName);
    return find(qboName) ?? (cleaned && cleaned !== qboName ? find(cleaned) : undefined);
  };
}

/**
 * Type of an account known by its name only (it is used in the journal or the trial balance but missing from the
 * Account List, typically an account deleted in QuickBooks). Keywords in the name pick the QuickBooks type that
 * `mapQboAccount` then refines; a name that says nothing becomes a neutral "other asset". Always to be checked.
 */
export function guessAccountFromName(qboName: string): { type: AccountType; subtype: AccountSubtype } {
  const name = cleanAccountName(qboName).split(":").pop() ?? qboName;
  const n = ` ${normName(name)} `;
  const qboType =
    / (accumulated|akumulasi) /.test(n) ? "Fixed Assets"
    : / (receivable|receivables|piutang) /.test(n) ? (/ (other|lain) /.test(n) ? "Other Current Assets" : "Accounts receivable")
    : / (payable|payables|hutang|utang) /.test(n) ? (/ (tax|pajak|vat|ppn|pph|bpjs|salar|gaji|dividend|other|lain) /.test(n) ? "Other Current Liabilities" : "Accounts payable")
    : / (expense|expenses|cost|costs|fee|fees|charge|charges|beban|biaya|salary|salaries|wages|gaji|rent|sewa|depreciation|amortisation|amortization|penyusutan|utilities|insurance|travel|meals|supplies|subscriptions|repairs|maintenance|advertising|marketing) /.test(n) ? "Expenses"
    : / (income|revenue|revenues|sales|pendapatan|penjualan) /.test(n) ? (/ (interest|other|lain|bunga|gain) /.test(n) ? "Other Income" : "Income")
    : / (equity|capital|modal|retained|dividend|dividends|laba ditahan|drawings) /.test(n) ? "Equity"
    : / (loan|loans|pinjaman|accrued|unearned|deferred) /.test(n) ? "Other Current Liabilities"
    : / (bank|cash|kas|petty) /.test(n) ? "Bank"
    : / (prepaid|deposit|deposits|inventory|persediaan|advance|advances|uang muka) /.test(n) ? "Other Current Assets"
    : "";
  return mapQboAccount(qboType, name, name) ?? { type: "asset", subtype: "other_asset" };
}

// ---------- Dedupe ----------

export type KeyFn<T> = (item: T) => Array<[label: string, value: string | undefined]>;

export interface DedupeResult<T> {
  fresh: T[];
  duplicates: Array<{ draft: T; reason: string }>;
}

function composite(label: string, value: string | undefined): string | undefined {
  const v = (value ?? "").trim();
  return v ? `${label}:${v}` : undefined;
}

/** Keys of rows already in the store, in the same `label:value` form the dedupe uses. */
export function existingKeys<T>(rows: T[], keysOf: KeyFn<T>): Set<string> {
  const out = new Set<string>();
  for (const r of rows) for (const [label, value] of keysOf(r)) { const k = composite(label, value); if (k) out.add(k); }
  return out;
}

/**
 * Splits drafts into fresh rows and duplicates. A draft is a duplicate when any of its keys matches an existing
 * row or an earlier draft in the same file (so a contact exported twice is inserted once).
 */
export function dedupeBy<T>(drafts: T[], keysOf: KeyFn<T>, existing: Set<string>): DedupeResult<T> {
  const seen = new Set(existing);
  const out: DedupeResult<T> = { fresh: [], duplicates: [] };
  for (const d of drafts) {
    const keys = keysOf(d).map(([label, value]) => [label, composite(label, value)] as const).filter((k): k is readonly [string, string] => Boolean(k[1]));
    const hit = keys.find(([, k]) => existing.has(k));
    const inFile = hit ? undefined : keys.find(([, k]) => seen.has(k));
    if (hit) out.duplicates.push({ draft: d, reason: `already exists (${hit[0]} ${hit[1].slice(hit[0].length + 1)})` });
    else if (inFile) out.duplicates.push({ draft: d, reason: `repeated in the file (${inFile[0]} ${inFile[1].slice(inFile[0].length + 1)})` });
    else { out.fresh.push(d); for (const [, k] of keys) seen.add(k); }
  }
  return out;
}

export const contactKeys: KeyFn<Pick<Contact, "email" | "hubspotId" | "qboCustomerId">> = (c) => [
  ["email", normEmail(c.email)], ["hubspot", c.hubspotId], ["qbo", c.qboCustomerId],
];

export const companyKeys: KeyFn<Pick<Company, "name" | "hubspotId" | "qboCustomerId">> = (c) => [
  ["qbo", c.qboCustomerId], ["hubspot", c.hubspotId], ["name", normName(c.name)],
];

export const invoiceKeys: KeyFn<Pick<Invoice, "qboDocNumber">> = (i) => [["qbo-doc", (i.qboDocNumber ?? "").trim().toLowerCase()]];

export const billKeys: KeyFn<Pick<Bill, "qboDocNumber">> = (b) => [["qbo-doc", (b.qboDocNumber ?? "").trim().toLowerCase()]];

/** Journals imported from QBO are keyed by their `sourceId` ("qbo:<type>:<num>:<date>", or "qbo:tb:<date>" for opening balances). */
export const journalKeys: KeyFn<{ sourceId?: string }> = (j) => [["source", j.sourceId]];

/** Convenience wrappers used by the import service and the tests. */
export function dedupeContacts<T extends Pick<Contact, "email" | "hubspotId" | "qboCustomerId">>(drafts: T[], existing: Array<Pick<Contact, "email" | "hubspotId" | "qboCustomerId">>): DedupeResult<T> {
  return dedupeBy(drafts, contactKeys, existingKeys(existing, contactKeys));
}

export function dedupeCompanies<T extends Pick<Company, "name" | "hubspotId" | "qboCustomerId">>(drafts: T[], existing: Array<Pick<Company, "name" | "hubspotId" | "qboCustomerId">>): DedupeResult<T> {
  return dedupeBy(drafts, companyKeys, existingKeys(existing, companyKeys));
}

export function dedupeInvoices<T extends Pick<Invoice, "qboDocNumber">>(drafts: T[], existing: Array<Pick<Invoice, "qboDocNumber">>): DedupeResult<T> {
  return dedupeBy(drafts, invoiceKeys, existingKeys(existing, invoiceKeys));
}
