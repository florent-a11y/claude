import type { ParsedBankRow } from "./ledger";
import { parseAnyDate } from "./bank-formats";

/**
 * Bank statement PDFs (e-statements with a text layer) → statement rows.
 * Works on positioned text: tokens → lines → transaction blocks anchored on a date, cells assigned by x position
 * against the column headers. Presets for BCA, BNI, BRI, CIMB Niaga, Mandiri (Kopra) and OCBC NISP plus a generic
 * fallback. Amounts and balances keep their cents exactly as printed. Every currency section is checked against its
 * own running balance and reported in `coverage`, so the screen can say what was read and where a line may be missing.
 * Pure (no pdf.js here): the extraction lives in lib/pdf-text.ts so this module is unit-testable with fixtures.
 */

export interface PdfToken { x: number; y: number; w: number; h: number; s: string }
export interface PdfLine { y: number; tokens: PdfToken[]; text: string }
export interface PdfPage { number: number; width: number; height: number; lines: PdfLine[] }

export type PdfPresetId = "pdf-bca" | "pdf-bni" | "pdf-bri" | "pdf-cimb" | "pdf-mandiri" | "pdf-ocbc" | "pdf-generic";

/** What was read from one currency section (the whole statement when it has a single one), for the line under the bank-format selector. */
export interface PdfCoverage {
  currency?: string; rows: number; opening?: number; closing?: number; movements: number;
  /** Opening + movements = closing (or, without an opening, last balance = closing); undefined when the statement gives nothing to compare. */
  balanced?: boolean;
  /** Places where the running balance moves by an amount no line read explains. */
  gaps: number; ok: boolean; text: string;
}

export interface PdfParseResult {
  preset: PdfPresetId; label: string; rows: ParsedBankRow[];
  /** Lines that could not be read (no amount found, no year for the date). */
  errors: string[];
  /** Balance checks: gaps in the running balance, totals that do not reach the closing balance. */
  warnings: string[];
  coverage: PdfCoverage[]; note: string; pages: number; scanned: boolean;
  opening?: number; closing?: number; periodFrom?: string; periodTo?: string; accountNumber?: string;
}

// ---------- Small helpers ----------

export const N = (s: string) => s.toUpperCase().replace(/\s+/g, "");
const right = (t: PdfToken) => t.x + t.w;
const center = (t: PdfToken) => t.x + t.w / 2;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Balances are compared to the cent. */
const TOL = 0.005;
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(round2(n)) ? 0 : 2, maximumFractionDigits: 2 });

/** "1,234.56", "0.00", "(1,000.00)", "-5.00", "4770000.00" → number; anything else → null. */
export function toNumber(s: string): number | null {
  const t = s.trim();
  if (!/^\(?-?\d[\d,]*(\.\d+)?\)?$/.test(t) || !/\d/.test(t)) return null;
  const neg = t.startsWith("(") || t.startsWith("-");
  const v = Number(t.replace(/[(),-]/g, ""));
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}

const MARKER = /^(D|K|DB|CR|DR|C)$/i;
const DEBIT_MARK = /^(D|DB|DR)$/i;
/** A money figure as statements print it: grouped thousands and exactly two decimals. */
const MONEY = /^\(?-?(\d{1,3}(,\d{3})*|\d+)\.\d{2}\)?$/;

/**
 * An amount with the sign marks banks print: "1,234.56", "1.234.567,89", "(1,000.00)", "-5.00", "5.00-",
 * "250,000.00 DB", "1,000.00CR". `v` is the absolute value; `sign` is set when the text itself says debit (-1) or credit (1).
 */
export function toAmount(s: string): { v: number; sign?: 1 | -1 } | null {
  const m = s.trim().match(/^(\()?(-)?(\d[\d.,]*)(-)?(\))?\s*(DB|CR|DR|D|K|C)?$/i);
  if (!m || !!m[1] !== !!m[5]) return null;
  const body = m[3];
  let v: number | null = null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(body) || /^\d+,\d{1,2}$/.test(body)) v = Number(body.replace(/\./g, "").replace(",", "."));
  else if (/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(body)) v = Number(body.replace(/,/g, ""));
  if (v === null || !Number.isFinite(v)) return null;
  const mark = m[6]?.toUpperCase();
  return { v, sign: mark ? (DEBIT_MARK.test(mark) ? -1 : 1) : m[1] || m[2] || m[4] ? -1 : undefined };
}
/** Decimals or grouped thousands: a figure, not a branch code or a teller id. */
const moneyLike = (s: string) => /[.,]\d{2}\)?-?\s*[A-Za-z]{0,2}$/.test(s.trim()) || /\d[.,]\d{3}/.test(s);

function ymd(y: number, m: number, d: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  if (m < 1 || m > 12 || d < 1 || d > 31 || year < 2000 || year > 2100) return null;
  const dt = new Date(Date.UTC(year, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

const MONTHS: Record<string, number> = {
  JAN: 1, JANUARI: 1, JANUARY: 1, FEB: 2, FEBRUARI: 2, FEBRUARY: 2, MAR: 3, MARET: 3, MARCH: 3, APR: 4, APRIL: 4, MEI: 5, MAY: 5, JUN: 6, JUNI: 6, JUNE: 6,
  JUL: 7, JULI: 7, JULY: 7, AGU: 8, AGT: 8, AGS: 8, AGUSTUS: 8, AUG: 8, AUGUST: 8, SEP: 9, SEPT: 9, SEPTEMBER: 9, OKT: 10, OKTOBER: 10, OCT: 10, OCTOBER: 10,
  NOV: 11, NOVEMBER: 11, NOPEMBER: 11, DES: 12, DESEMBER: 12, DEC: 12, DECEMBER: 12,
};

interface Box { x: number; right: number; center: number }
/** Position of a header label inside a line, tolerant to labels split into several tokens or letters. */
export function findLabel(line: PdfLine, label: string): Box | undefined {
  const target = N(label);
  let acc = "";
  const owner: number[] = [];
  line.tokens.forEach((t, i) => { const s = N(t.s); acc += s; for (let k = 0; k < s.length; k++) owner.push(i); });
  const idx = acc.indexOf(target);
  if (idx < 0) return undefined;
  const a = line.tokens[owner[idx]], b = line.tokens[owner[idx + target.length - 1]];
  return { x: a.x, right: right(b), center: (a.x + right(b)) / 2 };
}

/** Like findLabel, but a label that is only part of a longer text run ("DEBET / DEBIT KREDIT / CREDIT") is placed by its share of the run's characters. */
export function findWord(line: PdfLine, label: string): Box | undefined {
  const target = N(label);
  let acc = "";
  const owner: Array<{ t: PdfToken; at: number; len: number }> = [];
  for (const t of line.tokens) { const s = N(t.s); for (let k = 0; k < s.length; k++) owner.push({ t, at: k, len: s.length }); acc += s; }
  const idx = acc.indexOf(target);
  if (idx < 0) return undefined;
  const a = owner[idx], b = owner[idx + target.length - 1];
  const x = a.t.x + (a.t.w * a.at) / a.len, r = b.t.x + (b.t.w * (b.at + 1)) / b.len;
  return { x, right: r, center: (x + r) / 2 };
}

const DATE_WORD = /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.](\d{4}|\d{2})|\d{4}-\d{2}-\d{2})$/;
const MONEY_WORD = /^\(?-?(\d{1,3}([.,]\d{3})*|\d+)[.,]\d{2}\)?-?(DB|CR|DR|D|K|C)?$/i;
/**
 * pdf.js hands cells that sit close together over as one text run ("… LOAN REPAYMENT 1,200,300,400.50"), and text reports print
 * a whole line as one run. Dates at the start and amounts (with their DB/CR mark) at the end of a run become tokens of
 * their own, placed by their share of the run's characters. With `loose` off, figures are only cut from the words
 * before them when at least two spaces separate them (a column gap), so a description that ends with a figure stays whole.
 */
export function explode(line: PdfLine, loose = true): PdfLine {
  if (!line.tokens.some((t) => /\S\s+\S/.test(t.s))) return line;
  const tokens: PdfToken[] = [];
  for (const t of line.tokens) {
    const words = [...t.s.matchAll(/\S+/g)].map((m) => ({ s: m[0], at: m.index ?? 0 }));
    let a = 0, b = words.length;
    while (a < b && DATE_WORD.test(words[a].s)) a++;
    while (b > a && (MONEY_WORD.test(words[b - 1].s) || (MARKER.test(words[b - 1].s) && b - 2 >= a && MONEY_WORD.test(words[b - 2].s)))) b--;
    if (!loose && b > a && b < words.length && words[b].at - (words[b - 1].at + words[b - 1].s.length) < 2) b = words.length;
    if (words.length < 2 || (a === 0 && b === words.length)) { tokens.push(t); continue; }
    const piece = (from: number, to: number) => tokens.push({ ...t, s: t.s.slice(from, to), x: t.x + (t.w * from) / t.s.length, w: (t.w * (to - from)) / t.s.length });
    for (let k = 0; k < a; k++) piece(words[k].at, words[k].at + words[k].s.length);
    if (b > a) piece(words[a].at, words[b - 1].at + words[b - 1].s.length);
    for (let k = b; k < words.length; k++) piece(words[k].at, words[k].at + words[k].s.length);
  }
  return { ...line, tokens };
}
const exploded = (pages: PdfPage[], loose = true): PdfPage[] => pages.map((p) => ({ ...p, lines: p.lines.map((l) => explode(l, loose)) }));

// ---------- Column model ----------

type NumKey = "debit" | "credit" | "amount" | "balance";
interface Range { min: number; max: number }
interface Cols {
  desc: Range;
  ref?: Range;
  marker?: Range;
  /** Numbers left of this x are text (dates, branch codes, teller ids), never amounts. */
  numMinX: number;
  /** Amount columns, left to right. */
  nums: Array<{ key: NumKey; center: number }>;
  /** Figures always carry two decimals: anything else in the amount columns is not one, and a figure wrapped over two lines is put back together. */
  money?: boolean;
  /** Every row prints all the amount columns: a block showing as many figure positions as columns reads them left to right, whatever the alignment of the header labels. */
  ordered?: boolean;
}
interface Ctx { year?: number; from?: string; to?: string }
interface RowOut { row?: ParsedBankRow; opening?: number; error?: string }
interface Meta { opening?: number; closing?: number; closings?: Record<string, number>; accountNumber?: string }

interface Preset {
  id: PdfPresetId;
  label: string;
  detect: (text: string) => number;
  headerRe: RegExp;
  /** Lines right above or below the header row that only hold wrapped header words: read with it, never as transactions. */
  bandRe?: RegExp;
  columns: (header: PdfLine, page: PdfPage, band: PdfLine[]) => Cols | null;
  /** ISO date when the line starts a transaction. */
  anchor: (line: PdfLine, cols: Cols, ctx: Ctx) => string | null;
  layout: { kind: "below"; maxGap: number } | { kind: "around"; span: number };
  skipRe?: RegExp;
  stopRe?: RegExp;
  /** A line that cannot belong to a transaction (page furniture in the date columns): ends the block. */
  guard?: (line: PdfLine, cols: Cols) => boolean;
  /** A line inside the table that opens a currency section ("Currency Code : USD Beginning Balance 1,234.00"). */
  section?: (line: PdfLine, next?: PdfLine) => { currency: string; opening?: number } | undefined;
  /** Split text runs that hold several cells before reading (see `explode`). */
  explode?: boolean;
  /** The last transaction of a page may continue above the first one of the next page. */
  carry?: boolean;
  tidy?: (row: ParsedBankRow) => ParsedBankRow;
  /** Default sign when a single amount column has no D/K marker. */
  unmarked?: "credit" | "debit";
  context?: (pages: PdfPage[]) => Ctx;
  meta?: (pages: PdfPage[]) => Meta;
}

const inRange = (t: PdfToken, r: Range | undefined) => !!r && center(t) >= r.min && center(t) < r.max;

// ---------- Multi-currency statements ----------

const CCY_CODES = ["IDR", "USD", "EUR", "SGD", "AUD", "GBP", "JPY", "HKD", "CNY", "CNH", "CHF", "MYR", "THB", "NZD", "CAD", "AED", "SAR", "KRW", "INR", "PHP", "VND", "TWD"];
const SECTION_CCY = new RegExp(`\\b(${CCY_CODES.join("|")})\\b`);
const LABELLED_CCY = new RegExp(`^(CURRENCYCODE|KODEMATAUANG|MATAUANG/CURRENCY|MATAUANG|CURRENCY):?(${CCY_CODES.join("|")})`);

/**
 * A statement that lists several accounts in one PDF (OCBC prints the IDR, USD and EUR accounts one after the other)
 * announces each section with a header such as "Account No 1234567 USD", "Currency: USD" or "USD Current Account".
 * Returns that currency for a header-like line (account / currency words, no money amounts), else undefined. A line
 * that starts with the currency label itself ("Currency Code : USD Beginning Balance 1,234.00") counts even with a figure.
 */
export function sectionCurrency(line: PdfLine): string | undefined {
  const t = N(line.text);
  const labelled = t.match(LABELLED_CCY)?.[2];
  if (labelled) return labelled;
  if (!/(CURRENCY|MATAUANG|ACCOUNT|REKENING|STATEMENT|SALDO|BALANCE|CURRENT|SAVINGS|GIRO|TABUNGAN|VALAS)/.test(t)) return undefined;
  if (line.tokens.some((tk) => /^-?[0-9.,]+$/.test(tk.s) && /[.,]\d{2}$/.test(tk.s))) return undefined;
  // The code must stand as its own word in the original text ("IDR Current Account", "Currency: USD").
  return line.text.toUpperCase().match(SECTION_CCY)?.[1];
}

/**
 * The currency section each line belongs to, following the headers in reading order across pages. A header repeated
 * word for word on every page (the page header naming the account's base currency) is not a section when the statement
 * announces others.
 */
export function lineCurrencies(pages: PdfPage[]): Map<PdfLine, string | undefined> {
  const marks: Array<{ line: PdfLine; ccy: string; key: string; page: number }> = [];
  pages.forEach((p, page) => { for (const l of p.lines) { const ccy = sectionCurrency(l); if (ccy) marks.push({ line: l, ccy, key: N(l.text), page }); } });
  const furniture = (key: string) => pages.length > 1 && pages.every((_, page) => marks.some((m) => m.page === page && m.key === key));
  const real = marks.filter((m) => !furniture(m.key));
  const use = new Map((real.length ? real : marks).map((m) => [m.line, m.ccy]));
  const out = new Map<PdfLine, string | undefined>();
  let current: string | undefined;
  for (const p of pages) for (const l of p.lines) { current = use.get(l) ?? current; out.set(l, current); }
  return out;
}

/** Keeps the section currencies only when the statement really mixes several; a single tag is more likely a stray mention. */
export function keepSectionCurrencies(rows: ParsedBankRow[]): ParsedBankRow[] {
  const found = new Set(rows.map((r) => r.currency).filter(Boolean));
  return found.size >= 2 ? rows : rows.map((r) => (r.currency ? { ...r, currency: undefined } : r));
}

/** An amount cell too narrow for its figure wraps it ("1,200,300,400.5" above "0"): the first piece maps to the whole figure, the second to null. */
function rejoin(block: PdfLine[], cols: Cols): Map<PdfToken, number | null> {
  const out = new Map<PdfToken, number | null>();
  const frag = block.flatMap((l) => l.tokens.filter((t) => center(t) >= cols.numMinX && /^[\d.,]+$/.test(t.s)));
  frag.forEach((a, i) => {
    if (out.has(a) || MONEY.test(a.s)) return;
    const b = frag.slice(i + 1).find((t) => !out.has(t) && t.y > a.y + 1 && (Math.abs(right(t) - right(a)) <= 4 || (t.x < right(a) && right(t) > a.x)));
    if (b && MONEY.test(a.s + b.s)) { out.set(a, toNumber(a.s + b.s)); out.set(b, null); }
  });
  return out;
}

/** The figures of a block grouped by column (right edges within 40% of the column pitch); null unless there is exactly one group per column. */
function byColumn(found: Array<{ v: number; r: number }>, cols: Cols): number[][] | null {
  if (cols.nums.length < 2) return null;
  const pitch = Math.min(...cols.nums.slice(1).map((n, i) => n.center - cols.nums[i].center));
  const groups: Array<{ r: number; vals: number[] }> = [];
  for (const f of [...found].sort((a, b) => a.r - b.r)) {
    const g = groups[groups.length - 1];
    if (g && f.r - g.r <= pitch * 0.4) g.vals.push(f.v); else groups.push({ r: f.r, vals: [f.v] });
  }
  return groups.length === cols.nums.length ? groups.map((g) => g.vals) : null;
}

/** Builds one statement row from the lines of a transaction block. */
function buildRow(block: PdfLine[], cols: Cols, date: string, preset: Preset): RowOut {
  const desc: string[] = [], refs: string[] = [];
  const found: Array<{ v: number; c: number; r: number }> = [];
  const wrapped = cols.money ? rejoin(block, cols) : undefined;
  let marker: string | undefined;
  for (const line of block) {
    const parts: string[] = [];
    for (const t of line.tokens) {
      const c = center(t);
      if (c >= cols.numMinX) {
        const whole = wrapped?.get(t);
        if (whole === null) continue;
        const v = whole ?? (cols.money && !MONEY.test(t.s) ? null : toNumber(t.s));
        if (v !== null) { found.push({ v, c, r: right(t) }); continue; }
        if (MARKER.test(t.s) && (!cols.marker || inRange(t, cols.marker))) { marker = t.s.toUpperCase(); continue; }
        if (cols.marker && inRange(t, cols.marker)) continue;
      }
      if (inRange(t, cols.ref)) { refs.push(t.s); continue; }
      if (inRange(t, cols.desc)) parts.push(t.s);
    }
    if (parts.length) desc.push(parts.join(" "));
  }
  const nums: Partial<Record<NumKey, number[]>> = {};
  const ordered = cols.ordered ? byColumn(found, cols) : null;
  if (ordered) ordered.forEach((vals, i) => { nums[cols.nums[i].key] = vals; });
  else for (const f of found) {
    let best = cols.nums[0];
    for (const n of cols.nums) if (Math.abs(f.c - n.center) < Math.abs(f.c - best.center)) best = n;
    (nums[best.key] ??= []).push(f.v);
  }
  const description = desc.join(" ").replace(/\s+/g, " ").trim();
  const pick = (k: NumKey) => { const list = nums[k]; if (!list?.length) return undefined; return list.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)); };
  const balance = pick("balance");
  if (/^(SALDOAWAL|OPENINGBALANCE|SALDOAWALOPENING)/.test(N(description))) return { opening: balance ?? pick("amount") ?? pick("credit") };
  let amount: number | undefined;
  if (cols.nums.some((n) => n.key === "debit") || cols.nums.some((n) => n.key === "credit")) {
    const d = Math.abs(pick("debit") ?? 0), c = Math.abs(pick("credit") ?? 0);
    if (d === 0 && c === 0) return { error: `${date}: no amount found (${description.slice(0, 40)})` };
    amount = c - d;
  } else {
    const v = pick("amount");
    if (v === undefined || v === 0) return { error: `${date}: no amount found (${description.slice(0, 40)})` };
    const debit = marker ? DEBIT_MARK.test(marker) : preset.unmarked === "debit";
    amount = debit ? -Math.abs(v) : Math.abs(v);
  }
  const reference = refs.join(" ").replace(/\s+/g, " ").trim().replace(/^-$/, "");
  return { row: { date, description: description || "(no description)", amount: round2(amount), balance: balance === undefined ? undefined : round2(balance), reference: reference || undefined } };
}
// ---------- Presets ----------

function periodDdMm(ctx: Ctx, d: number, m: number): string | null {
  const y = ctx.from ? Number(ctx.from.slice(0, 4)) : ctx.year;
  if (!y) return null;
  let iso = ymd(y, m, d);
  if (iso && ctx.from && ctx.to && iso < ctx.from && ctx.to.slice(0, 4) > ctx.from.slice(0, 4)) iso = ymd(y + 1, m, d);
  return iso;
}
const pageText = (pages: PdfPage[], n = 2) => N(pages.slice(0, n).flatMap((p) => p.lines.map((l) => l.text)).join("|"));
function firstNumberAfter(pages: PdfPage[], labelRe: RegExp, sameLine = false): number | undefined {
  for (const p of pages) {
    for (let i = 0; i < p.lines.length; i++) {
      if (!labelRe.test(N(p.lines[i].text))) continue;
      const candidates = sameLine ? [p.lines[i]] : [p.lines[i], p.lines[i + 1]].filter(Boolean);
      for (const l of candidates) for (const t of l.tokens) { const v = toNumber(t.s); if (v !== null && Math.abs(v) >= 1) return v; }
    }
  }
  return undefined;
}

/** Mandiri Kopra "Account Statement": Posting Date · Remark · Reference No. · Debit · Credit · Balance; each row spans three text lines. */
const MANDIRI: Preset = {
  id: "pdf-mandiri", label: "Mandiri Kopra (PDF)",
  detect: (t) => (t.includes("KOPRA") ? 2 : 0) + (t.includes("POSTINGDATE") && t.includes("REMARK") && t.includes("REFERENCENO") ? 2 : 0),
  headerRe: /POSTINGDATE.*REMARK.*REFERENCE.*DEBIT.*CREDIT.*BALANCE/,
  columns: (h) => {
    const remark = findLabel(h, "Remark"), ref = findLabel(h, "Reference"), debit = findLabel(h, "Debit"), credit = findLabel(h, "Credit"), balance = findLabel(h, "Balance");
    if (!remark || !ref || !debit || !credit || !balance) return null;
    return { desc: { min: remark.x - 8, max: ref.x - 8 }, ref: { min: ref.x - 8, max: debit.x - 40 }, numMinX: debit.x - 40, nums: [{ key: "debit", center: debit.center }, { key: "credit", center: credit.center }, { key: "balance", center: balance.center }] };
  },
  anchor: (line) => (/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/.test(line.text) ? parseAnyDate(line.text) : null),
  layout: { kind: "below", maxGap: 16 },
  stopRe: /^FORFURTHERQUESTIONS|^PAGE\d+OF|KOPRABYMANDIRI\.COM/,
  meta: (pages) => ({ opening: firstNumberAfter(pages, /^OPENINGBALANCE/), closing: firstNumberAfter(pages, /^CLOSINGBALANCE/) }),
};

/** BNI "Account Statement": Posting Date · Effective Date · Branch · Journal · Transaction Description · Amount · DB/CR · Balance; the description wraps around the date line. */
const BNI: Preset = {
  id: "pdf-bni", label: "BNI (PDF)",
  detect: (t) => (t.includes("DB/CR") && t.includes("POSTINGDATE") && t.includes("JOURNAL") ? 3 : 0) + (t.includes("LEDGERBALANCE") ? 1 : 0),
  headerRe: /POSTINGDATE.*EFFECTIVEDATE.*BRANCH.*JOURNAL.*TRANSACTIONDESCRIPTION.*AMOUNT.*DB\/CR.*BALANCE/,
  columns: (h) => {
    const branch = findLabel(h, "Branch"), journal = findLabel(h, "Journal"), desc = findLabel(h, "Transaction"), amount = findLabel(h, "Amount"), dbcr = findLabel(h, "DB/CR"), balance = findLabel(h, "Balance");
    if (!branch || !journal || !desc || !amount || !dbcr || !balance) return null;
    return { desc: { min: desc.x - 25, max: amount.x - 25 }, ref: { min: journal.x - 6, max: desc.x - 25 }, marker: { min: dbcr.x - 10, max: balance.x - 10 }, numMinX: amount.x - 25, nums: [{ key: "amount", center: amount.center }, { key: "balance", center: balance.center }] };
  },
  anchor: (line) => { const t = line.tokens[0]; return t && /^\d{2}\/\d{2}\/\d{4}(\s|$)/.test(t.s) ? parseAnyDate(t.s.split(/\s+/)[0]) : null; },
  layout: { kind: "around", span: 32 },
  skipRe: /^LEDGERBALANCE/,
  stopRe: /^ENDINGBALANCE|^TOTALDEBET|^TOTALCREDIT/,
  unmarked: "credit",
  meta: (pages) => ({ opening: firstNumberAfter(pages, /^LEDGERBALANCE/, true), closing: firstNumberAfter(pages, /^ENDINGBALANCE/, true) }),
};

/** BRI "Laporan Transaksi Finansial": Tanggal Transaksi · Uraian Transaksi · Teller · Debet · Kredit · Saldo; wrapped descriptions continue below. */
const BRI: Preset = {
  id: "pdf-bri", label: "BRI (PDF)",
  detect: (t) => (t.includes("LAPORANTRANSAKSIFINANSIAL") ? 3 : 0) + (t.includes("URAIANTRANSAKSI") && t.includes("TELLER") ? 1 : 0) + (t.includes("IBBIZ") || t.includes("BANKBRI") ? 1 : 0),
  headerRe: /TANGGALTRANSAKSI.*URAIANTRANSAKSI.*TELLER.*DEBET.*KREDIT.*SALDO/,
  columns: (h) => {
    const uraian = findLabel(h, "Uraian"), teller = findLabel(h, "Teller"), debet = findLabel(h, "Debet"), kredit = findLabel(h, "Kredit"), saldo = findLabel(h, "Saldo");
    if (!uraian || !teller || !debet || !kredit || !saldo) return null;
    return { desc: { min: uraian.x - 70, max: teller.x - 10 }, ref: { min: teller.x - 10, max: debet.x - 30 }, numMinX: debet.x - 30, nums: [{ key: "debit", center: debet.center }, { key: "credit", center: kredit.center }, { key: "balance", center: saldo.center }] };
  },
  anchor: (line) => { const t = line.tokens[0]; return t && /^\d{2}\/\d{2}\/\d{2,4}(\s|$)/.test(t.s) ? parseAnyDate(t.s.split(/\s+/)[0]) : null; },
  layout: { kind: "below", maxGap: 16 },
  stopRe: /^SALDOAWAL|^TOTALTRANSAKSI|^TERBILANG|^CREATEDBY|^BIAYAMATERAI|^-APABILA|^-IN|^-SALINAN|^-THE|^-SHOULD/,
  meta: (pages) => {
    for (const p of pages) for (let i = 0; i < p.lines.length; i++) {
      if (!/^SALDOAWAL/.test(N(p.lines[i].text))) continue;
      for (let j = i + 1; j < Math.min(i + 3, p.lines.length); j++) {
        const vals = p.lines[j].tokens.map((t) => toNumber(t.s)).filter((v): v is number => v !== null);
        if (vals.length >= 4) return { opening: vals[0], closing: vals[vals.length - 1] };
      }
    }
    return {};
  },
};

/** CIMB Niaga "Laporan Transaksi": Tgl. Txn · Tgl. Valuta · Uraian Transaksi · No. Cek/BG · Debet · Kredit · Saldo; dd/mm dates, year from the period. */
const CIMB: Preset = {
  id: "pdf-cimb", label: "CIMB Niaga (PDF)",
  detect: (t) => (t.includes("CIMBNIAGA") ? 3 : 0) + (t.includes("TGL.TXN") && t.includes("CEK/BG") ? 2 : 0),
  headerRe: /TGL\.?TXN.*TGL\.?VALUTA.*URAIANTRANSAKSI.*CEK\/BG.*DEBET.*KREDIT.*SALDO/,
  columns: (h) => {
    const uraian = findLabel(h, "Uraian"), cek = findLabel(h, "No."), debet = findLabel(h, "Debet"), kredit = findLabel(h, "Kredit"), saldo = findLabel(h, "Saldo");
    if (!uraian || !cek || !debet || !kredit || !saldo) return null;
    return { desc: { min: uraian.x - 6, max: cek.x - 6 }, ref: { min: cek.x - 6, max: debet.x - 30 }, numMinX: debet.x - 30, nums: [{ key: "debit", center: debet.center }, { key: "credit", center: kredit.center }, { key: "balance", center: saldo.center }] };
  },
  anchor: (line, _cols, ctx) => {
    const [a, b] = line.tokens;
    const m = a && b && /^\d{2}\/\d{2}(\s|$)/.test(a.s) && /^\d{2}\/\d{2}(\s|$)/.test(b.s) ? a.s.match(/^(\d{2})\/(\d{2})/) : null;
    return m ? periodDdMm(ctx, Number(m[1]), Number(m[2])) : null;
  },
  layout: { kind: "around", span: 26 },
  skipRe: /^SALDOAWAL|^SALDOAKHIR|^TOTAL/,
  stopRe: /^TERIMAKASIH|^HALAMAN\/PAGE|^KEPADA\/TO|^DISCLAIMER|^EFEKTIF|^•/,
  context: (pages) => {
    const m = pageText(pages, 1).match(/PERIODE:?(\d{2})([A-Z]{3})(\d{4})-(\d{2})([A-Z]{3})(\d{4})/);
    if (!m) return {};
    return { from: ymd(Number(m[3]), MONTHS[m[2]] ?? 0, Number(m[1])) ?? undefined, to: ymd(Number(m[6]), MONTHS[m[5]] ?? 0, Number(m[4])) ?? undefined, year: Number(m[3]) };
  },
  meta: (pages) => ({ opening: firstNumberAfter(pages, /^SALDOAWAL/, true), closing: firstNumberAfter(pages, /^SALDOAKHIR/, true) }),
};

/** BCA "Rekening Giro / Tahapan" e-statement: Tanggal · Keterangan · CBG · Mutasi (DB marker for debits) · Saldo (only on the last line of a day). */
const BCA: Preset = {
  id: "pdf-bca", label: "BCA (PDF)",
  detect: (t) => (/REKENING(GIRO|TAHAPAN|TAPRES|GIROVALAS)/.test(t) ? 3 : 0) + (t.includes("KETERANGAN") && t.includes("MUTASI") && t.includes("CBG") ? 2 : 0) + (t.includes("BCABERHAK") ? 1 : 0),
  headerRe: /^TANGGAL.*KETERANGAN.*CBG.*MUTASI.*SALDO/,
  columns: (h) => {
    const ket = findLabel(h, "Keterangan"), cbg = findLabel(h, "CBG"), mutasi = findLabel(h, "Mutasi"), saldo = findLabel(h, "Saldo");
    if (!ket || !cbg || !mutasi || !saldo) return null;
    return { desc: { min: ket.x - 85, max: cbg.x - 6 }, marker: { min: mutasi.right, max: saldo.x - 20 }, numMinX: mutasi.x - 30, nums: [{ key: "amount", center: mutasi.center }, { key: "balance", center: saldo.center }] };
  },
  anchor: (line, cols, ctx) => {
    const t = line.tokens[0];
    const m = t && t.x < cols.desc.min ? t.s.match(/^(\d{2})\/(\d{2})(?:\s|$)/) : null;
    return m ? periodDdMm(ctx, Number(m[1]), Number(m[2])) : null;
  },
  layout: { kind: "below", maxGap: 16 },
  stopRe: /^BERSAMBUNG|^SALDOAWAL:|^MUTASICR|^MUTASIDB|^SALDOAKHIR/,
  unmarked: "credit",
  context: (pages) => {
    const m = pageText(pages, 1).match(/PERIODE:?([A-Z]+)(\d{4})/);
    if (!m || !MONTHS[m[1]]) return {};
    const y = Number(m[2]), mo = MONTHS[m[1]];
    return { year: y, from: ymd(y, mo, 1) ?? undefined, to: ymd(y, mo, new Date(Date.UTC(y, mo, 0)).getUTCDate()) ?? undefined };
  },
  meta: (pages) => ({ opening: firstNumberAfter(pages, /^SALDOAWAL:?/, true), closing: firstNumberAfter(pages, /^SALDOAKHIR:?/, true) }),
};


/**
 * OCBC NISP "Rekening Koran Giro / Current Account Statement" (bilingual; one PDF carries every currency of a
 * multi-currency account): Tgl Trans · Tgl Valuta · Uraian · Debet · Kredit · Saldo, the three figures printed on every
 * row (0.00 on the unused side). A row starts with its two dd/mm/yyyy dates; the transaction type wraps under them and
 * the remark follows on its own lines, sometimes at the top of the next page; the figures sit on the first text line or
 * lower, and one too wide for its cell wraps. Each currency opens inside the table with "Currency Code : USD Beginning
 * Balance 1,234.00" (the page header names the account's base currency on every page, whatever the section), and a
 * closing table lists the balance per currency next to its exchange rate. The header labels may wrap over two lines.
 */
const OCBC_DATE = /^\d{2}\/\d{2}\/\d{4}/;
const OCBC: Preset = {
  id: "pdf-ocbc", label: "OCBC (PDF e-statement)",
  detect: (t) => (t.includes("OCBC") ? 1 : 0) + (t.includes("TGLTRANS") && t.includes("TGLVALUTA") ? 2 : 0) + (t.includes("REKENINGKORAN") ? 1 : 0) + (t.includes("CURRENCYCODE:") ? 1 : 0),
  headerRe: /^(?!\d\d\/).*DEB[EI]T.*(KREDIT|CREDIT).*(SALDO|BALANCE)/,
  bandRe: /^(TGL|TRANS|DATE|VALUTA|VALUE|URAIAN|DESCRIPTION|DEBET|DEBIT|KREDIT|CREDIT|SALDO|BALANCE|\/)+$/,
  explode: true, carry: true,
  columns: (_header, page, band) => {
    const box = (...labels: string[]): Box | undefined => {
      let x = Infinity, r = -Infinity;
      for (const l of band) for (const s of labels) { const f = findWord(l, s); if (f) { x = Math.min(x, f.x); r = Math.max(r, f.right); } }
      return r > x ? { x, right: r, center: (x + r) / 2 } : undefined;
    };
    const valuta = box("Tgl Valuta", "Value Date"), uraian = box("Uraian", "Description"), debit = box("Debet", "Debit"), credit = box("Kredit", "Credit"), saldo = box("Saldo", "Balance");
    if (!uraian || !debit || !credit || !saldo || credit.center <= debit.center || saldo.center <= credit.center) return null;
    // Half a column left of the debit label's centre: right for centred, left- and right-aligned labels alike.
    const numMinX = debit.center - (credit.center - debit.center) / 2;
    // The description starts right after the value date of the rows themselves, whatever the alignment of the header labels.
    const starts = page.lines.filter((l) => l.tokens.length > 2 && OCBC_DATE.test(l.tokens[0].s) && OCBC_DATE.test(l.tokens[1].s) && l.tokens[2].x < numMinX).map((l) => (right(l.tokens[1]) + l.tokens[2].x) / 2);
    const descMin = starts.length ? Math.min(...starts) : Math.min(uraian.x - 2, (valuta?.right ?? uraian.x - 6) + 4);
    return { desc: { min: descMin, max: debit.center }, numMinX, nums: [{ key: "debit", center: debit.center }, { key: "credit", center: credit.center }, { key: "balance", center: saldo.center }], money: true, ordered: true };
  },
  anchor: (line, cols) => { const t = line.tokens[0]; const m = t && t.x < cols.desc.min ? t.s.match(OCBC_DATE) : null; return m ? parseAnyDate(m[0]) : null; },
  layout: { kind: "below", maxGap: 18 },
  // Disclaimers, promotions and the closing tables start at the left margin, in the date columns.
  guard: (line, cols) => line.tokens[0].x < cols.desc.min - 12,
  stopRe: /^BILAMANA|^INTHEEVENT|^MATAUANG\/CURRENCY(TUNGGAKAN|SALDO|KURS|TOTAL)|^TUNGGAKAN|^OVERDUE|^TOTALTUNGGAKAN|^SALDOMINIMUM|^SALDOMAKSIMUM|^SALDORATA|^KURSVALAS|^SALDODALAM|^TOTALSALDO|^CATATAN:|^NOTE:|^DOKUMENINI/,
  section: (line, next) => {
    const m = N(line.text).match(/^CURRENCYCODE:?([A-Z]{3})/);
    if (!m) return undefined;
    const tail = (l?: PdfLine) => { const v = l?.text.match(/(\(?-?\d[\d,]*\.\d{2}\)?)\s*$/)?.[1]; return v ? toNumber(v) ?? undefined : undefined; };
    return { currency: m[1], opening: tail(line) ?? (next && /^(BEGINNINGBALANCE|SALDOAWAL)/.test(N(next.text)) ? tail(next) : undefined) };
  },
  tidy: (r) => {
    const description = r.description.replace(/^(\d{2}\/\d{2}\/\d{4}\s*)+/, "").trim() || r.description;
    // The remark carries the payer's or the biller's own number: a long digit run, or a code mixing capitals and digits.
    const reference = description.match(/(?<![A-Za-z0-9])(\d{10,}|(?=[A-Z0-9]*\d{4})(?=[A-Z0-9]*[A-Z]{3})[A-Z0-9]{12,})(?![A-Za-z0-9])/)?.[1];
    return { ...r, description, reference: reference ?? r.reference };
  },
  context: (pages) => {
    const m = pageText(pages, 1).match(/(\d{1,2})([A-Z]{3,9})(\d{4})-(\d{1,2})([A-Z]{3,9})(\d{4})/);
    const from = m ? ymd(Number(m[3]), MONTHS[m[2]] ?? 0, Number(m[1])) : null, to = m ? ymd(Number(m[6]), MONTHS[m[5]] ?? 0, Number(m[4])) : null;
    return from && to ? { from, to, year: Number(from.slice(0, 4)) } : {};
  },
  meta: (pages) => {
    const closings: Record<string, number> = {};
    let accountNumber: string | undefined;
    for (const p of pages) for (let i = 0; i < p.lines.length; i++) {
      const text = p.lines[i].text.trim();
      // Closing table: currency, exchange rate (three decimals), balance, balance in IDR.
      const m = text.match(/^([A-Z]{3})\s+[\d,]+\.\d{3}\s+(\(?-?[\d,]+\.\d{2}\)?)\s+\(?-?[\d,]+\.\d{2}\)?$/);
      const v = m ? toNumber(m[2]) : null;
      if (m && v !== null) closings[m[1]] = v;
      if (!accountNumber && /NOMORREKENING|ACCOUNTNUMBER/.test(N(text))) accountNumber = p.lines.slice(i, i + 3).map((l) => l.text.match(/\b\d{10,16}\b/)?.[0]).find(Boolean);
    }
    return { closings, accountNumber };
  },
};

export const PDF_PRESETS: Preset[] = [BCA, BNI, BRI, CIMB, MANDIRI, OCBC];
export const PDF_PRESET_OPTIONS = [...PDF_PRESETS.map((p) => ({ id: p.id, label: p.label })), { id: "pdf-generic" as const, label: "Other bank PDF (dates, amounts and running balance)" }];

export function detectPdfPreset(pages: PdfPage[]): PdfPresetId {
  const text = pageText(pages, 2);
  let best: { id: PdfPresetId; score: number } = { id: "pdf-generic", score: 0 };
  for (const p of PDF_PRESETS) { const score = p.detect(text); if (score > best.score) best = { id: p.id, score }; }
  return best.score >= 2 ? best.id : "pdf-generic";
}

// ---------- Engine ----------

function midpoint(a: number, b: number) { return (a + b) / 2; }

/** What a reader hands back: rows, unreadable lines, and the opening / closing balances it met, per currency section when the statement has several. */
interface Run {
  rows: ParsedBankRow[]; errors: string[];
  openings: Array<{ currency?: string; value?: number }>; closings: Array<{ currency?: string; value: number }>;
  /** The currency tags come from section lines of the statement itself, not from a guess: kept even when there is a single one. */
  explicit?: boolean;
}

/**
 * Runs a preset over the pages: finds the header rows (a page may hold several, one per account section, and the columns
 * are read again at each), cuts the table into currency sections, segments transaction blocks and builds rows.
 */
function runPreset(pages: PdfPage[], preset: Preset): Run {
  const ctx = preset.context?.(pages) ?? {};
  const rows: ParsedBankRow[] = [], errors: string[] = [];
  const openings: Run["openings"] = [];
  const implied = lineCurrencies(pages);
  const explicit = !!preset.section && pages.some((p) => p.lines.some((l, i) => preset.section?.(l, p.lines[i + 1])));
  let cols: Cols | null = null;
  let currency: string | undefined;
  // With `carry`, the last transaction of a page stays open until the top of the next page has been read.
  const open: { last: { block: PdfLine[]; cols: Cols; date: string; currency?: string } | null } = { last: null };
  const emit = (block: PdfLine[], c: Cols, date: string, ccy: string | undefined) => {
    const out = buildRow(block, c, date, preset);
    if (out.opening !== undefined) openings.push({ currency: ccy, value: out.opening });
    if (out.row) { const row = { ...out.row, currency: ccy }; rows.push(preset.tidy ? preset.tidy(row) : row); }
    if (out.error) errors.push(out.error);
  };
  const flush = () => { if (open.last) emit(open.last.block, open.last.cols, open.last.date, open.last.currency); open.last = null; };
  for (const page of pages) {
    const lines = page.lines;
    const heads: Array<{ from: number; to: number; cols: Cols | null }> = [];
    for (let i = 0; i < lines.length; i++) {
      if (!preset.headerRe.test(N(lines[i].text)) || (heads.length > 0 && i <= heads[heads.length - 1].to)) continue;
      let a = i, b = i;
      if (preset.bandRe) {
        while (a > 0 && lines[a].y - lines[a - 1].y <= 14 && preset.bandRe.test(N(lines[a - 1].text))) a--;
        while (b + 1 < lines.length && lines[b + 1].y - lines[b].y <= 14 && preset.bandRe.test(N(lines[b + 1].text))) b++;
      }
      cols = preset.columns(lines[i], page, lines.slice(a, b + 1)) ?? cols;
      heads.push({ from: a, to: b, cols });
    }
    // A page without a header row continues with the columns of the previous page.
    const segs = heads.length ? heads.map((h, k) => ({ from: h.to + 1, to: heads[k + 1]?.from ?? lines.length, cols: h.cols, top: k === 0 })) : [{ from: 0, to: lines.length, cols, top: false }];
    if (!heads.length) flush();
    for (const seg of segs) {
      const c = seg.cols;
      if (!c) continue;
      let region = lines.slice(seg.from, seg.to);
      const stopAt = region.findIndex((l) => preset.stopRe?.test(N(l.text)));
      if (stopAt >= 0) region = region.slice(0, stopAt);
      region = region.filter((l) => !preset.skipRe?.test(N(l.text)));
      // A currency section announced inside the table splits the region: no transaction reaches across it.
      const parts: Array<{ lines: PdfLine[]; currency?: string; top: boolean }> = [{ lines: [], currency, top: seg.top }];
      for (let i = 0; i < region.length; i++) {
        const s = preset.section?.(region[i], region[i + 1]);
        if (!s) { parts[parts.length - 1].lines.push(region[i]); continue; }
        currency = s.currency;
        openings.push({ currency, value: s.opening });
        parts.push({ lines: [], currency, top: false });
      }
      for (const part of parts) {
        const anchors: Array<{ idx: number; date: string }> = [];
        part.lines.forEach((l, idx) => { const d = preset.anchor(l, c, ctx); if (d) anchors.push({ idx, date: d }); });
        if (part.top && open.last) {
          // Lines above the first transaction of the page still belong to the last one of the previous page.
          const end = Math.min(anchors[0]?.idx ?? part.lines.length, 3);
          for (let i = 0; i < end && !preset.guard?.(part.lines[i], c); i++) open.last.block.push(part.lines[i]);
        }
        flush();
        anchors.forEach((a, k) => {
          const line = part.lines[a.idx];
          let block: PdfLine[];
          if (preset.layout.kind === "below") {
            block = [line];
            const nextIdx = anchors[k + 1]?.idx ?? part.lines.length;
            for (let i = a.idx + 1; i < nextIdx; i++) {
              if (part.lines[i].y - block[block.length - 1].y > preset.layout.maxGap || preset.guard?.(part.lines[i], c)) break;
              block.push(part.lines[i]);
            }
          } else {
            const span = preset.layout.span;
            const lo = Math.max(k > 0 ? midpoint(part.lines[anchors[k - 1].idx].y, line.y) : -Infinity, line.y - span);
            const hi = Math.min(k + 1 < anchors.length ? midpoint(line.y, part.lines[anchors[k + 1].idx].y) : Infinity, line.y + span);
            block = part.lines.filter((l) => l.y >= lo && l.y <= hi);
          }
          const ccy = explicit ? part.currency : implied.get(line);
          const lastOfPage = k === anchors.length - 1 && part === parts[parts.length - 1] && seg === segs[segs.length - 1];
          if (preset.carry && lastOfPage) open.last = { block, cols: c, date: a.date, currency: ccy };
          else emit(block, c, a.date, ccy);
        });
      }
    }
  }
  flush();
  return { rows, errors, openings, closings: [], explicit };
}

// ---------- Generic reader ----------

/** Statement period for a bank without a preset: a date range ("01 Sep 2026 - 30 Sep 2026", "01/09/2026 s/d 30/09/2026"), a month ("Periode : Oktober 2026") or, failing that, the year of the first full date. */
function genericContext(pages: PdfPage[]): Ctx {
  const lines = pages.slice(0, 2).flatMap((p) => p.lines.map((l) => l.text));
  const dates = (s: string) => [...s.matchAll(/(\d{1,2})[\s\/\-.]+(\d{1,2}|[A-Za-z]{3,9})[\s\/\-.,]+(\d{4})/g)]
    .map((m) => ymd(Number(m[3]), /^\d/.test(m[2]) ? Number(m[2]) : MONTHS[m[2].toUpperCase()] ?? 0, Number(m[1]))).filter((d): d is string => !!d);
  for (const s of lines) {
    if (!/period|statement date|tanggal laporan|from|dari|s\/d|s\.d/i.test(s)) continue;
    const found = dates(s);
    if (found.length >= 2) return { from: found[0], to: found[found.length - 1], year: Number(found[0].slice(0, 4)) };
    const m = s.match(/([A-Za-z]{3,9})\s+(\d{4})/);
    const mo = m ? MONTHS[m[1].toUpperCase()] : undefined;
    if (m && mo) { const y = Number(m[2]); return { year: y, from: ymd(y, mo, 1) ?? undefined, to: ymd(y, mo, new Date(Date.UTC(y, mo, 0)).getUTCDate()) ?? undefined }; }
    if (found.length === 1) return { year: Number(found[0].slice(0, 4)) };
  }
  for (const s of lines) { const found = dates(s); if (found.length) return { year: Number(found[0].slice(0, 4)) }; }
  return {};
}

/**
 * The date a line starts with: "2026-03-31", "31/03/2026", "31-03-26", "31 Mar 2026", "31-Mar-26", and the day-month
 * forms "31/03", "31 Mar", "31-Mar", which take the year of the statement period (`date` is null when none is known).
 */
function leadingDate(s: string, ctx: Ctx): { date: string | null; len: number; short: boolean } | null {
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?=$|[\sT,])/);
  if (m) { const date = ymd(Number(m[1]), Number(m[2]), Number(m[3])); return date ? { date, len: m[0].length, short: false } : null; }
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})(?=$|[\s,])/);
  if (m) { const date = ymd(Number(m[3]), Number(m[2]), Number(m[1])); return date ? { date, len: m[0].length, short: false } : null; }
  m = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})\.?,?[\s\-\/]+(\d{4}|\d{2})(?=$|[\s,])/);
  if (m && MONTHS[m[2].toUpperCase()]) { const date = ymd(Number(m[3]), MONTHS[m[2].toUpperCase()], Number(m[1])); return date ? { date, len: m[0].length, short: false } : null; }
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?=$|\s)/);
  if (m) return ymd(2024, Number(m[2]), Number(m[1])) ? { date: periodDdMm(ctx, Number(m[1]), Number(m[2])), len: m[0].length, short: true } : null;
  m = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})\.?(?=$|[\s,])/);
  if (m && MONTHS[m[2].toUpperCase()] && ymd(2024, MONTHS[m[2].toUpperCase()], Number(m[1]))) return { date: periodDdMm(ctx, Number(m[1]), MONTHS[m[2].toUpperCase()]), len: m[0].length, short: true };
  return null;
}

interface LineDate { date: string | null; short: boolean; /** Leading tokens taken by the date. */ used: number; /** What follows the date inside its last token. */ rest?: string }
function lineDate(line: PdfLine, ctx: Ctx): LineDate | null {
  const text = line.text.trim();
  if (!line.tokens.length || !/^\d/.test(text)) return null;
  const hit = leadingDate(text, ctx);
  if (!hit) return null;
  let need = N(text.slice(0, hit.len)).length, used = 0, rest: string | undefined;
  for (const t of line.tokens) {
    if (need <= 0) break;
    const n = N(t.s).length;
    used++;
    if (need < n) { let k = 0; for (let seen = 0; seen < need; k++) if (/\S/.test(t.s[k])) seen++; rest = t.s.slice(k).trim(); }
    need -= n;
  }
  return { date: hit.date, short: hit.short, used, rest };
}

interface GCols { numMinX: number; nums: Array<{ key: NumKey; center: number }> }
const G_LABELS: Array<[NumKey, string[]]> = [
  ["debit", ["Debit", "Debet", "Withdrawal", "Penarikan"]], ["credit", ["Credit", "Kredit", "Deposit", "Setoran"]],
  ["amount", ["Amount", "Jumlah", "Mutasi", "Nominal"]], ["balance", ["Balance", "Saldo"]],
];
/** Amount columns of an unknown bank, from a header row that names a date and its amount columns. */
function genericColumns(line: PdfLine): GCols | null {
  if (!(/\b(tanggal|tgl|date)\b/i.test(line.text) || /^(TANGGAL|TGL|DATE|POSTINGDATE|TRANSACTIONDATE)/.test(N(line.text))) || line.tokens.some((t) => MONEY.test(t.s.trim()))) return null;
  let found: Array<{ key: NumKey; x: number; right: number }> = [];
  for (const [key, labels] of G_LABELS) {
    const boxes = labels.map((s) => findWord(line, s)).filter((b): b is Box => !!b);
    if (boxes.length) found.push({ key, x: Math.min(...boxes.map((b) => b.x)), right: Math.max(...boxes.map((b) => b.right)) });
  }
  if (found.some((f) => f.key === "debit" || f.key === "credit")) found = found.filter((f) => f.key !== "amount");
  // Two amount labels at least: one alone ("Update credit limit") is more likely a sentence than a header row.
  if (found.length < 2 || !found.some((f) => f.key !== "balance")) return null;
  found.sort((a, b) => a.x - b.x);
  const before = Math.max(0, ...line.tokens.filter((t) => right(t) <= found[0].x).map(right));
  return { numMinX: Math.max(found[0].x - 30, before + 2), nums: found.map((f) => ({ key: f.key, center: (f.x + f.right) / 2 })) };
}

interface Num { v: number; sign?: 1 | -1; c: number }
/** Figures and words of a line from token `from` on: right of the header's amount columns when known, else the run of figures that ends the line. */
function amountsOf(line: PdfLine, from: number, cols: GCols | null, half: number): { nums: Num[]; marker?: string; words: string[] } {
  const toks = line.tokens.slice(from);
  const nums: Num[] = [], words: string[] = [];
  let marker: string | undefined;
  if (cols) {
    for (const t of toks) {
      const a = center(t) >= cols.numMinX ? toAmount(t.s) : null;
      if (a) nums.push({ ...a, c: center(t) });
      else if (center(t) >= cols.numMinX && MARKER.test(t.s.trim())) marker ??= t.s.trim().toUpperCase();
      else words.push(t.s);
    }
    return { nums, marker, words };
  }
  let cut = toks.length;
  for (; cut > 0; cut--) {
    const t = toks[cut - 1];
    const a = moneyLike(t.s) || center(t) >= half ? toAmount(t.s) : null;
    if (a) nums.unshift({ ...a, c: center(t) });
    else if (MARKER.test(t.s.trim())) marker ??= t.s.trim().toUpperCase();
    else break;
  }
  return nums.length ? { nums, marker, words: toks.slice(0, cut).map((t) => t.s) } : { nums, words: toks.map((t) => t.s) };
}

const signed = (n: Num) => (n.sign === -1 ? -n.v : n.v);
const OPENING_ROW = /^(SALDOAWAL|OPENINGBALANCE|BEGINNINGBALANCE|BALANCEBROUGHTFORWARD|BALANCEB\/F|SALDOLALU)/;
const CLOSING_ROW = /^(SALDOAKHIR|CLOSINGBALANCE|ENDINGBALANCE|BALANCECARRIEDFORWARD|BALANCEC\/F)/;
/** Totals and balance lines under a transaction are not its continuation. */
const SUMMARY_LINE = /^(SALDO|OPENING|CLOSING|BEGINNING|ENDING|TOTAL|JUMLAH|MUTASI)/;
/** Value dates and times of day that follow the transaction date are not part of the description. */
const LEAD_STAMPS = /^((\d{1,2}:\d{2}(:\d{2})?|\d{1,2}\.\d{2}\.\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2})(\s+|$))+/;

/**
 * Generic PDF, for banks without a preset. A transaction starts on a line that opens with a date (see `leadingDate`);
 * its figures are the ones under the header's amount columns when the page has a header row, else the run of figures
 * that ends the line, wherever it sits on the page, and they may come on the line below the date. Signs come from
 * debit / credit columns, DB/CR/D/K marks, a trailing minus or parentheses, and the running balance.
 */
function runGeneric(input: PdfPage[]): Run {
  const pages = exploded(input, false);
  const ctx = genericContext(pages);
  const rows: ParsedBankRow[] = [], errors: string[] = [];
  const openings: Run["openings"] = [], closings: Run["closings"] = [];
  const sections = lineCurrencies(pages);
  const prev = new Map<string, number>();
  let cols: GCols | null = null;
  let undated = 0;
  for (const page of pages) {
    const lines = page.lines;
    const dates = lines.map((l) => lineDate(l, ctx));
    // Day-month dates are only trusted in the date column itself: where most of them start.
    const starts = new Map<number, number>();
    dates.forEach((d, i) => { if (d?.short) { const k = Math.round(lines[i].tokens[0].x / 6); starts.set(k, (starts.get(k) ?? 0) + 1); } });
    const column = [...starts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
    const isRow = (i: number) => { const d = dates[i]; return !!d && (!d.short || Math.abs(Math.round(lines[i].tokens[0].x / 6) - (column ?? 0)) <= 1); };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ccy = sections.get(line), key = ccy ?? "";
      const d = isRow(i) ? dates[i] : null;
      if (!d) {
        const head = genericColumns(line);
        if (head) { cols = head; continue; }
        // "Opening balance 1,000.00" and "Saldo akhir : 5,000.00" outside the dated rows.
        const label = N(line.text).replace(/^CURRENCYCODE:?[A-Z]{3}/, "");
        const tail = line.tokens.length > 1 ? toAmount(line.tokens[line.tokens.length - 1].s) : null;
        if (tail && OPENING_ROW.test(label)) { openings.push({ currency: ccy, value: signed({ ...tail, c: 0 }) }); prev.set(key, signed({ ...tail, c: 0 })); }
        else if (tail && CLOSING_ROW.test(label)) closings.push({ currency: ccy, value: signed({ ...tail, c: 0 }) });
        continue;
      }
      const first = amountsOf(line, d.used, cols, page.width * 0.5);
      const words = [d.rest ?? "", ...first.words];
      let nums = first.nums, marker = first.marker;
      for (let j = i + 1; j < lines.length && lines[j].y - lines[j - 1].y <= 16; j++) {
        if (isRow(j) || SUMMARY_LINE.test(N(lines[j].text)) || genericColumns(lines[j])) break;
        const more = amountsOf(lines[j], 0, cols, page.width * 0.5);
        if (more.nums.length) { if (nums.length) break; nums = more.nums; marker ??= more.marker; }
        words.push(...more.words);
      }
      if (nums.length === 0) continue;
      if (!d.date) { undated++; continue; }
      const description = words.join(" ").replace(/\s+/g, " ").trim().replace(LEAD_STAMPS, "").trim();
      let amount: Num | undefined, balance: number | undefined, known = false;
      if (cols) {
        const by: Partial<Record<NumKey, Num[]>> = {};
        if (nums.length === cols.nums.length) [...nums].sort((a, b) => a.c - b.c).forEach((n, k) => { by[cols!.nums[k].key] = [n]; });
        else for (const n of nums) {
          let best = cols.nums[0];
          for (const c of cols.nums) if (Math.abs(n.c - c.center) < Math.abs(n.c - best.center)) best = c;
          (by[best.key] ??= []).push(n);
        }
        const pick = (k: NumKey) => by[k]?.reduce((a, b) => (b.v > a.v ? b : a));
        const bal = pick("balance"), deb = pick("debit"), cre = pick("credit");
        balance = bal ? signed(bal) : undefined;
        if ((deb?.v ?? 0) !== 0 || (cre?.v ?? 0) !== 0) { const net = (cre?.v ?? 0) - (deb?.v ?? 0); amount = { v: Math.abs(net), sign: net < 0 ? -1 : 1, c: 0 }; known = true; }
        else amount = pick("amount");
      } else if (nums.length >= 3) {
        const deb = nums[nums.length - 3], cre = nums[nums.length - 2];
        balance = signed(nums[nums.length - 1]);
        if (deb.v === cre.v) amount = cre;
        else { amount = { v: Math.abs(cre.v - deb.v), sign: cre.v < deb.v ? -1 : 1, c: 0 }; known = true; }
      } else { amount = nums[0]; balance = nums.length === 2 ? signed(nums[1]) : undefined; }
      const tag = N(description);
      if (OPENING_ROW.test(tag)) { const o = balance ?? nums[nums.length - 1].v; prev.set(key, o); openings.push({ currency: ccy, value: o }); continue; }
      if (CLOSING_ROW.test(tag)) { closings.push({ currency: ccy, value: balance ?? nums[nums.length - 1].v }); continue; }
      if (!amount || amount.v === 0) { errors.push(`${d.date}: no amount (${description.slice(0, 40)})`); continue; }
      let value = amount.sign === -1 ? -amount.v : amount.v;
      if (!known) {
        // A lone amount takes its sign from the running balance when that settles it, else from its own mark.
        const p = prev.get(key);
        const delta = balance !== undefined && p !== undefined ? round2(balance - p) : undefined;
        if (delta !== undefined && Math.abs(delta - amount.v) <= TOL) value = amount.v;
        else if (delta !== undefined && Math.abs(delta + amount.v) <= TOL) value = -amount.v;
        else if (amount.sign === undefined && marker) value = DEBIT_MARK.test(marker) ? -amount.v : amount.v;
      }
      rows.push({ date: d.date, description: description || "(no description)", amount: round2(value), balance: balance === undefined ? undefined : round2(balance), currency: ccy });
      if (balance !== undefined) prev.set(key, balance);
    }
  }
  if (undated) errors.push(`${undated} line${undated === 1 ? "" : "s"} skipped: the dates have no year and the statement period was not found on the first pages.`);
  return { rows, errors, openings, closings };
}

// ---------- Balance checks and coverage ----------

/** The currency sections of the rows, in order of appearance (one untagged section for a single-currency statement). */
function sectionsOf(rows: ParsedBankRow[]): Array<string | undefined> {
  const out: Array<string | undefined> = [];
  for (const r of rows) if (!out.includes(r.currency)) out.push(r.currency);
  return out;
}

interface Check { warnings: string[]; gaps: number; movements: number; balanced?: boolean; chained: boolean }
/**
 * One currency section against its own running balance: flips a lone row whose sign contradicts it, says between which
 * dates the balance moves by more or less than the lines read, and compares opening + movements with the closing balance.
 */
function checkSection(rows: ParsedBankRow[], idx: number[], opening: number | undefined, closing: number | undefined, tag?: string): Check {
  const warnings: string[] = [];
  const say = (s: string) => (tag ? `${tag}: ${s}` : s[0].toUpperCase() + s.slice(1));
  let prev = opening, prevDate: string | undefined, pending: number[] = [], gaps = 0, chained = false;
  for (const i of idx) {
    const r = rows[i];
    pending.push(i);
    if (r.balance === undefined) continue;
    if (prev !== undefined) {
      chained = true;
      const off = round2(r.balance - prev - pending.reduce((s, k) => s + rows[k].amount, 0));
      if (Math.abs(off) > TOL) {
        if (pending.length === 1 && Math.abs(round2(prev - r.amount) - r.balance) <= TOL) rows[i].amount = -rows[i].amount;
        else {
          gaps++;
          const span = prevDate === r.date ? `on ${r.date}` : `between ${prevDate ?? "the opening balance"} and ${r.date}`;
          warnings.push(say(`${span} the balance moves by ${fmt(Math.abs(off))} ${off > 0 ? "more" : "less"} than the lines read: a line may be missing or misread.`));
        }
      }
    }
    prev = r.balance; prevDate = r.date; pending = [];
  }
  const movements = round2(idx.reduce((s, i) => s + rows[i].amount, 0));
  let balanced: boolean | undefined;
  if (opening !== undefined && closing !== undefined) balanced = Math.abs(round2(opening + movements - closing)) <= TOL;
  else if (closing !== undefined && prev !== undefined && pending.length === 0 && idx.length > 0) balanced = Math.abs(round2(prev - closing)) <= TOL;
  if (balanced === false && gaps === 0 && closing !== undefined) {
    warnings.push(say(opening !== undefined
      ? `opening ${fmt(opening)} + lines read ${fmt(movements)} = ${fmt(round2(opening + movements))}, but the statement closes at ${fmt(closing)}: lines are missing or misread.`
      : `the last line read leaves ${fmt(prev ?? 0)}, but the statement closes at ${fmt(closing)}: lines may be missing at the end.`));
  }
  return { warnings, gaps, movements, balanced, chained };
}

/**
 * Verifies the rows against the running balance, each currency section on its own chain, and flips a single row whose
 * sign contradicts it. `opening` is the opening balance of the first section, or one per currency.
 */
export function checkBalances(rows: ParsedBankRow[], opening?: number | Record<string, number | undefined>): string[] {
  const keys = sectionsOf(rows);
  return keys.flatMap((c, k) => checkSection(rows, rows.flatMap((r, i) => (r.currency === c ? [i] : [])), typeof opening === "object" ? opening[c ?? ""] : k === 0 ? opening : undefined, undefined, keys.length > 1 ? c : undefined).warnings);
}

function coverageText(c: Omit<PdfCoverage, "text" | "ok">, chained: boolean): string {
  const head = `${c.currency ? `${c.currency}: ` : ""}${c.rows} line${c.rows === 1 ? "" : "s"} read`;
  if (c.gaps) return `${head}, ${c.gaps} gap${c.gaps === 1 ? "" : "s"} in the running balance (see warnings)`;
  if (c.balanced === false) return `${head}, ${c.opening !== undefined ? "opening + movements ≠ closing" : "last balance ≠ closing"} (see warnings)`;
  if (c.balanced) return `${head}, ${c.opening !== undefined ? "opening + movements = closing" : "last balance = closing"} ✓`;
  return `${head}, ${chained ? "running balance adds up (no closing balance found to check the total)" : "no running balance to check against"}`;
}

export function parseBankPdf(pages: PdfPage[], opts: { preset?: string } = {}): PdfParseResult {
  const tokenCount = pages.reduce((n, p) => n + p.lines.reduce((m, l) => m + l.tokens.length, 0), 0);
  const scanned = tokenCount < 5;
  const forced = PDF_PRESET_OPTIONS.some((p) => p.id === opts.preset);
  let id: PdfPresetId = forced ? (opts.preset as PdfPresetId) : detectPdfPreset(pages);
  let preset = PDF_PRESETS.find((p) => p.id === id);
  const src = preset?.explode ? exploded(pages) : pages;
  let base = preset ? runPreset(src, preset) : runGeneric(pages);
  let missed: string | undefined;
  if (preset && !forced && base.rows.length === 0) {
    // The bank was recognised but not this layout of its statements: the generic reader is better than nothing.
    const generic = runGeneric(pages);
    if (generic.rows.length) { missed = preset.label; base = generic; preset = undefined; id = "pdf-generic"; }
  }
  if (!base.explicit) base.rows = keepSectionCurrencies(base.rows);
  const rows = base.rows;
  const meta: Meta = preset?.meta?.(src) ?? {};
  const ctx = preset?.context?.(src) ?? {};
  const closings = meta.closings ?? {};
  const keys = sectionsOf(rows);
  const one = keys.length <= 1;
  const valued = (c?: string) => base.openings.find((o) => o.currency === c && o.value !== undefined)?.value;
  const openingOf = (c?: string) => (one ? meta.opening ?? valued(c) ?? base.openings.find((o) => o.value !== undefined)?.value : valued(c));
  const closingOf = (c?: string) => (c !== undefined && closings[c] !== undefined ? closings[c]
    : [...base.closings].reverse().find((o) => o.currency === c)?.value ?? (one ? meta.closing ?? base.closings[base.closings.length - 1]?.value ?? (Object.keys(closings).length === 1 ? Object.values(closings)[0] : undefined) : undefined));
  const warnings: string[] = [];
  const coverage: PdfCoverage[] = [];
  for (const c of keys) {
    const idx = rows.flatMap((r, i) => (r.currency === c ? [i] : []));
    const opening = openingOf(c), closing = closingOf(c);
    const chk = checkSection(rows, idx, opening, closing, one ? undefined : c);
    warnings.push(...chk.warnings);
    const cov = { currency: c, rows: idx.length, opening, closing, movements: chk.movements, balanced: chk.balanced, gaps: chk.gaps };
    coverage.push({ ...cov, ok: chk.gaps === 0 && chk.balanced !== false, text: coverageText(cov, chk.chained) });
  }
  if (base.explicit) {
    // Currencies the statement announces or lists in its closing table, from which no line was read.
    const silent = [...new Set([...base.openings.map((o) => o.currency), ...Object.keys(closings)])].filter((c): c is string => !!c && !keys.includes(c));
    for (const c of silent) {
      const opening = valued(c), closing = closings[c];
      const announced = base.openings.some((o) => o.currency === c);
      const moved = opening !== undefined && closing !== undefined && Math.abs(round2(opening - closing)) > TOL;
      if (moved) warnings.push(`${c}: the section opens at ${fmt(opening)} and closes at ${fmt(closing)}, but no line was read from it.`);
      const text = moved ? `${c}: no line read although the balance moved (see warnings)` : `${c}: no transactions${closing !== undefined ? ` (balance ${fmt(closing)})` : ""}`;
      if (announced || closing !== undefined) coverage.push({ currency: c, rows: 0, opening, closing, movements: 0, balanced: moved ? false : undefined, gaps: 0, ok: !moved, text });
    }
  }
  const opening = keys.length === 1 ? coverage[0].opening : keys.length === 0 ? meta.opening : undefined;
  const closing = keys.length === 1 ? coverage[0].closing : keys.length === 0 ? meta.closing : undefined;
  const text = pageText(pages, 1);
  const acc = meta.accountNumber ?? text.match(/(?:NO\.?REKENING|ACCOUNTNO\.?|ACCOUNTNUMBER)[^0-9]{0,12}(\d{8,20})/)?.[1];
  const label = preset?.label ?? "Other bank PDF";
  const dates = rows.map((r) => r.date).sort();
  const currencies = keys.filter((c): c is string => !!c);
  const bits = [`${pages.length} page${pages.length === 1 ? "" : "s"}`, `${rows.length} transaction${rows.length === 1 ? "" : "s"}`];
  if (currencies.length > 1) bits.push(`${currencies.length} currency sections (${currencies.join(", ")})`);
  if (dates.length) bits.push(`${dates[0]} → ${dates[dates.length - 1]}`);
  if (opening !== undefined) bits.push(`opening ${fmt(opening)}`);
  if (closing !== undefined) bits.push(`closing ${fmt(closing)}`);
  if (missed) bits.push(`the ${missed} layout was not recognised, read as a generic statement`);
  return {
    preset: id, label, rows, errors: base.errors, warnings, coverage, note: `${label} · ${bits.join(" · ")}`, pages: pages.length, scanned,
    opening, closing, periodFrom: ctx.from ?? dates[0], periodTo: ctx.to ?? dates[dates.length - 1], accountNumber: acc,
  };
}
