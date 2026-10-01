/**
 * Pure CSV → draft mappers for the migration imports: HubSpot contacts, QuickBooks Online customers and
 * QuickBooks Online invoices. No I/O, no Next.js, no database, so the functions run in tests and could run in
 * the browser. lib/import-services.ts dedupes the drafts against the store and writes rows.
 *
 * Export formats in the wild are messy: HubSpot and QBO rename columns per locale and report, QBO report
 * exports start with a few title lines, dates come as dd/mm/yyyy, mm/dd/yyyy or yyyy-mm-dd, and QBO customer
 * display names carry a currency suffix ("Jane Doe - USD") because QBO needs one customer record per currency.
 * Every mapper is forgiving on input and strict on output.
 */
import { parseCSV } from "./csv";
import type { Contact, Company, EntityType, Invoice } from "./types";

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
}

/** "Memo/Description" → "memo description", "Open Balance (IDR)" → "open balance". */
export function normHeader(h: string): string {
  return h.replace(/^﻿/, "").replace(/\(.*?\)/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const HEADER_HINTS = new Set([
  "date", "transaction date", "num", "no", "number", "customer", "name", "amount", "email", "first name", "last name", "record id", "company",
  "open balance", "balance", "memo description", "memo", "description", "phone", "phone number", "phone numbers", "currency", "due date", "type",
  "full name", "billing address", "lead status", "create date", "status", "total",
]);

/** Parses a CSV and locates the header row (QBO report exports start with a company name, a title and a date range). */
export function tableFromCSV(text: string): ParsedTable {
  const rows = parseCSV(text);
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const hits = rows[i].map(normHeader).filter((h) => HEADER_HINTS.has(h)).length;
    if (hits >= 2) { headerIndex = i; break; }
  }
  const rawHeaders = rows[headerIndex] ?? [];
  const headers = rawHeaders.map(normHeader);
  const out: ParsedTable = { headers, rawHeaders, headerLine: headerIndex + 1, rows: [] };
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some((c) => c.trim() !== "")) continue;
    const cells: Record<string, string> = {};
    headers.forEach((h, j) => { if (h) cells[h] = (r[j] ?? "").trim(); });
    out.rows.push({ line: i + 1, cells });
  }
  return out;
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
 * "Jan 15, 2026" and ISO timestamps. For numeric dates the caller picks the order; "auto" resolves an ambiguous
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
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{2,4})/);
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
export function parseHubspotContacts(text: string, opts: HubspotOptions = {}): ParseResult<ContactDraft> {
  const table = tableFromCSV(text);
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
export function parseQboCustomers(text: string): ParseResult<QboCustomerDraft> {
  const table = tableFromCSV(text);
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

/**
 * Maps a QBO invoice export (Invoice List report, Sales → Invoices export, or a Transaction List by Customer filtered
 * to invoices) to one draft per document number. Several rows with the same number become lines of one invoice.
 */
export function parseQboInvoices(text: string, opts: QboInvoiceOptions = {}): InvoiceParseResult {
  const table = tableFromCSV(text);
  const result: InvoiceParseResult = { drafts: [], errors: [], skipped: [], warnings: [], headers: table.rawHeaders, headerLine: table.headerLine, rowCount: table.rows.length, currencies: [], hasOpenBalanceColumn: hasCol(table.headers, ...INV_OPEN) };
  const fmt = resolveFormat(opts.dateFormat, table.rows.map((r) => col(r.cells, ...INV_DATE)));
  const hasTotalCol = hasCol(table.headers, "total", "total amount", "invoice total");
  const byNumber = new Map<string, InvoiceDraft>();
  if (!result.hasOpenBalanceColumn) result.warnings.push("no Open Balance column: invoices are imported as unpaid unless a Status column says paid");
  if (!hasCol(table.headers, ...INV_NUM)) result.warnings.push("no invoice number column (Num / No.): every row will be rejected");
  if (opts.dateFormat === "auto" || !opts.dateFormat) result.warnings.push(`numeric dates read as ${DATE_FORMAT_LABELS[fmt]}`);
  for (const { line, cells } of table.rows) {
    const type = col(cells, "type", "transaction type");
    const num = col(cells, ...INV_NUM);
    const dateRaw = col(cells, ...INV_DATE);
    const customerRaw = col(cells, ...INV_CUSTOMER);
    const firstCell = Object.values(cells).find((v) => v !== "") ?? "";
    if (/^total\b/i.test(firstCell) && !num) { result.skipped.push({ line, reason: "report total line" }); continue; }
    if (!num && !dateRaw && !customerRaw) continue;
    if (type && !/invoice/i.test(type)) { result.skipped.push({ line, reason: `transaction type "${type}"` }); continue; }
    if (!num) { result.errors.push({ line, message: "missing invoice number" }); continue; }
    const date = parseDate(dateRaw, fmt);
    if (!date) { result.errors.push({ line, message: dateRaw ? `unreadable date "${dateRaw}"` : "missing date" }); continue; }
    if (!customerRaw) { result.errors.push({ line, message: "missing customer" }); continue; }
    const amount = parseAmount(col(cells, "amount", "line amount", "total", "total amount", "invoice total"));
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
    if (d.lines.length > 1 || !hasTotalCol) d.total = d.lines.reduce((s, l) => s + l.amount, 0);
    if (Number.isNaN(d.openBalance)) d.openBalance = d.status === "void" ? 0 : d.total;
    if (d.status === "void") { result.skipped.push({ line: d.line, reason: `invoice ${d.qboDocNumber} is voided` }); continue; }
    if (d.total < 0) { result.skipped.push({ line: d.line, reason: `invoice ${d.qboDocNumber} has a negative total (credit memo?)` }); continue; }
    d.openBalance = Math.max(0, Math.min(d.total, d.openBalance));
    d.amountPaid = Math.max(0, d.total - d.openBalance);
    d.status = d.openBalance <= 0 ? "paid" : d.openBalance >= d.total ? "sent" : "partial";
    if (d.total === 0) d.warnings.push("zero amount");
    currencies.add(d.currency);
    result.drafts.push(d);
  }
  result.drafts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.qboDocNumber.localeCompare(b.qboDocNumber, undefined, { numeric: true })));
  result.currencies = [...currencies].sort();
  return result;
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
