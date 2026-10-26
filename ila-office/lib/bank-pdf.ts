import type { ParsedBankRow } from "./ledger";
import { parseAnyDate } from "./bank-formats";

/**
 * Bank statement PDFs (e-statements with a text layer) → statement rows.
 * Works on positioned text: tokens → lines → transaction blocks anchored on a date, cells assigned by x position
 * against the column headers. Presets for BCA, BNI, BRI, CIMB Niaga and Mandiri (Kopra) plus a generic fallback.
 * Pure (no pdf.js here): the extraction lives in lib/pdf-text.ts so this module is unit-testable with fixtures.
 */

export interface PdfToken { x: number; y: number; w: number; h: number; s: string }
export interface PdfLine { y: number; tokens: PdfToken[]; text: string }
export interface PdfPage { number: number; width: number; height: number; lines: PdfLine[] }

export type PdfPresetId = "pdf-bca" | "pdf-bni" | "pdf-bri" | "pdf-cimb" | "pdf-mandiri" | "pdf-generic";

export interface PdfParseResult {
  preset: PdfPresetId; label: string; rows: ParsedBankRow[]; errors: string[]; note: string; pages: number; scanned: boolean;
  opening?: number; closing?: number; periodFrom?: string; periodTo?: string; accountNumber?: string;
}

// ---------- Small helpers ----------

export const N = (s: string) => s.toUpperCase().replace(/\s+/g, "");
const right = (t: PdfToken) => t.x + t.w;
const center = (t: PdfToken) => t.x + t.w / 2;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** "1,234.56", "0.00", "(1,000.00)", "-5.00", "4770000.00" → number; anything else → null. */
export function toNumber(s: string): number | null {
  const t = s.trim();
  if (!/^\(?-?\d[\d,]*(\.\d+)?\)?$/.test(t) || !/\d/.test(t)) return null;
  const neg = t.startsWith("(") || t.startsWith("-");
  const v = Number(t.replace(/[(),-]/g, ""));
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}

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
  NOV: 11, NOVEMBER: 11, DES: 12, DESEMBER: 12, DEC: 12, DECEMBER: 12,
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

// ---------- Column model ----------

type NumKey = "debit" | "credit" | "amount" | "balance";
interface Range { min: number; max: number }
interface Cols {
  desc: Range;
  ref?: Range;
  marker?: Range;
  /** Numbers left of this x are text (dates, branch codes, teller ids), never amounts. */
  numMinX: number;
  nums: Array<{ key: NumKey; center: number }>;
}
interface Ctx { year?: number; from?: string; to?: string }
interface RowOut { row?: ParsedBankRow; opening?: number; error?: string }

interface Preset {
  id: PdfPresetId;
  label: string;
  detect: (text: string) => number;
  headerRe: RegExp;
  columns: (header: PdfLine, page: PdfPage) => Cols | null;
  /** ISO date when the line starts a transaction. */
  anchor: (line: PdfLine, cols: Cols, ctx: Ctx) => string | null;
  layout: { kind: "below"; maxGap: number } | { kind: "around"; span: number };
  skipRe?: RegExp;
  stopRe?: RegExp;
  /** Default sign when a single amount column has no D/K marker. */
  unmarked?: "credit" | "debit";
  context?: (pages: PdfPage[]) => Ctx;
  meta?: (pages: PdfPage[]) => Partial<Pick<PdfParseResult, "opening" | "closing">>;
}

const inRange = (t: PdfToken, r: Range | undefined) => !!r && center(t) >= r.min && center(t) < r.max;
const MARKER = /^(D|K|DB|CR|DR|C)$/i;
const DEBIT_MARK = /^(D|DB|DR)$/i;

/** Builds one statement row from the lines of a transaction block. */
function buildRow(block: PdfLine[], cols: Cols, date: string, preset: Preset): RowOut {
  const desc: string[] = [], refs: string[] = [];
  const nums: Partial<Record<NumKey, number[]>> = {};
  let marker: string | undefined;
  for (const line of block) {
    const parts: string[] = [];
    for (const t of line.tokens) {
      const c = center(t);
      if (c >= cols.numMinX) {
        const v = toNumber(t.s);
        if (v !== null) {
          let best = cols.nums[0];
          for (const n of cols.nums) if (Math.abs(c - n.center) < Math.abs(c - best.center)) best = n;
          (nums[best.key] ??= []).push(v);
          continue;
        }
        if (MARKER.test(t.s) && (!cols.marker || inRange(t, cols.marker))) { marker = t.s.toUpperCase(); continue; }
        if (cols.marker && inRange(t, cols.marker)) continue;
      }
      if (inRange(t, cols.ref)) { refs.push(t.s); continue; }
      if (inRange(t, cols.desc)) parts.push(t.s);
    }
    if (parts.length) desc.push(parts.join(" "));
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

export const PDF_PRESETS: Preset[] = [BCA, BNI, BRI, CIMB, MANDIRI];
export const PDF_PRESET_OPTIONS = [...PDF_PRESETS.map((p) => ({ id: p.id, label: p.label })), { id: "pdf-generic" as const, label: "Other bank PDF (dates, amounts and running balance)" }];

export function detectPdfPreset(pages: PdfPage[]): PdfPresetId {
  const text = pageText(pages, 2);
  let best: { id: PdfPresetId; score: number } = { id: "pdf-generic", score: 0 };
  for (const p of PDF_PRESETS) { const score = p.detect(text); if (score > best.score) best = { id: p.id, score }; }
  return best.score >= 2 ? best.id : "pdf-generic";
}

// ---------- Engine ----------

function midpoint(a: number, b: number) { return (a + b) / 2; }

/** Runs a preset over the pages: finds the header on each page, segments transaction blocks, builds rows. */
function runPreset(pages: PdfPage[], preset: Preset): { rows: ParsedBankRow[]; errors: string[]; opening?: number } {
  const ctx = preset.context?.(pages) ?? {};
  const rows: ParsedBankRow[] = [];
  const errors: string[] = [];
  let opening: number | undefined;
  let cols: Cols | null = null;
  for (const page of pages) {
    const headerIdx = page.lines.findIndex((l) => preset.headerRe.test(N(l.text)));
    if (headerIdx >= 0) cols = preset.columns(page.lines[headerIdx], page) ?? cols;
    if (!cols) continue;
    let region = page.lines.slice(headerIdx + 1);
    const stopAt = region.findIndex((l) => preset.stopRe?.test(N(l.text)));
    if (stopAt >= 0) region = region.slice(0, stopAt);
    region = region.filter((l) => !preset.skipRe?.test(N(l.text)));
    const anchors: Array<{ idx: number; date: string }> = [];
    region.forEach((l, idx) => { const d = preset.anchor(l, cols as Cols, ctx); if (d) anchors.push({ idx, date: d }); });
    anchors.forEach((a, k) => {
      const line = region[a.idx];
      let block: PdfLine[];
      if (preset.layout.kind === "below") {
        block = [line];
        const nextIdx = anchors[k + 1]?.idx ?? region.length;
        for (let i = a.idx + 1; i < nextIdx; i++) {
          const prev = block[block.length - 1];
          if (region[i].y - prev.y > preset.layout.maxGap) break;
          block.push(region[i]);
        }
      } else {
        const span = preset.layout.span;
        const lo = Math.max(k > 0 ? midpoint(region[anchors[k - 1].idx].y, line.y) : -Infinity, line.y - span);
        const hi = Math.min(k + 1 < anchors.length ? midpoint(line.y, region[anchors[k + 1].idx].y) : Infinity, line.y + span);
        block = region.filter((l) => l.y >= lo && l.y <= hi);
      }
      const out = buildRow(block, cols as Cols, a.date, preset);
      if (out.opening !== undefined && opening === undefined) opening = out.opening;
      if (out.row) rows.push(out.row);
      if (out.error) errors.push(out.error);
    });
  }
  return { rows, errors, opening };
}

/** Generic PDF: any line that starts with a full date; numbers in the right 45% of the page are amount / balance. */
function runGeneric(pages: PdfPage[]): { rows: ParsedBankRow[]; errors: string[]; opening?: number } {
  const rows: ParsedBankRow[] = [];
  const errors: string[] = [];
  let prevBalance: number | undefined;
  for (const page of pages) {
    const numMinX = page.width * 0.5;
    const lines = page.lines;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const first = line.tokens[0];
      if (!first || !/\d/.test(first.s)) continue;
      const date = parseAnyDate(first.s) ?? (/^\d{1,2}\s+[A-Za-z]{3,9}/.test(line.text) ? parseAnyDate(line.text) : null);
      if (!date) continue;
      const numeric = line.tokens.filter((t) => center(t) >= numMinX && toNumber(t.s) !== null);
      if (numeric.length === 0) continue;
      const marker = line.tokens.find((t) => center(t) >= numMinX && MARKER.test(t.s))?.s.toUpperCase();
      const values = numeric.map((t) => toNumber(t.s) as number);
      let amount: number, balance: number | undefined;
      if (values.length >= 3) { const d = Math.abs(values[values.length - 3]), c = Math.abs(values[values.length - 2]); amount = c - d; balance = values[values.length - 1]; }
      else if (values.length === 2) { amount = Math.abs(values[0]); balance = values[1]; }
      else amount = Math.abs(values[0]);
      if (values.length < 3) {
        if (balance !== undefined && prevBalance !== undefined) amount = Math.abs(round2(balance - prevBalance) - amount) <= 0.011 ? amount : -amount;
        else if (marker) amount = DEBIT_MARK.test(marker) ? -Math.abs(amount) : Math.abs(amount);
      }
      const descTokens = line.tokens.filter((t) => t !== first && center(t) < numMinX && !MARKER.test(t.s)).map((t) => t.s);
      for (let j = i + 1; j < lines.length && lines[j].y - lines[j - 1].y <= 16; j++) {
        const l = lines[j];
        if (l.tokens[0] && parseAnyDate(l.tokens[0].s)) break;
        if (l.tokens.some((t) => center(t) >= numMinX && toNumber(t.s) !== null)) break;
        descTokens.push(...l.tokens.map((t) => t.s));
      }
      const description = descTokens.join(" ").replace(/\s+/g, " ").trim();
      if (/^(SALDOAWAL|OPENINGBALANCE)/.test(N(description))) { prevBalance = balance ?? Math.abs(values[values.length - 1]); continue; }
      if (amount === 0) { errors.push(`${date}: no amount`); continue; }
      rows.push({ date, description: description || "(no description)", amount: round2(amount), balance: balance === undefined ? undefined : round2(balance) });
      if (balance !== undefined) prevBalance = balance;
    }
  }
  return { rows, errors };
}

/** Verifies the rows against the running balance and flips a single row whose sign contradicts it. */
export function checkBalances(rows: ParsedBankRow[], opening?: number): string[] {
  const warnings: string[] = [];
  let prev = opening;
  let pending: number[] = [];
  const tol = 0.011;
  rows.forEach((r, i) => {
    pending.push(i);
    if (r.balance === undefined) return;
    if (prev !== undefined) {
      const sum = pending.reduce((s, k) => s + rows[k].amount, 0);
      if (Math.abs(round2(prev + sum) - r.balance) > tol) {
        if (pending.length === 1 && Math.abs(round2(prev - r.amount) - r.balance) <= tol) rows[i].amount = -rows[i].amount;
        else warnings.push(`Running balance does not add up around ${r.date} (expected ${round2(prev + sum)}, statement says ${r.balance}).`);
      }
    }
    prev = r.balance;
    pending = [];
  });
  return warnings;
}

export function parseBankPdf(pages: PdfPage[], opts: { preset?: string } = {}): PdfParseResult {
  const tokenCount = pages.reduce((n, p) => n + p.lines.reduce((m, l) => m + l.tokens.length, 0), 0);
  const scanned = tokenCount < 5;
  const id: PdfPresetId = (PDF_PRESET_OPTIONS.some((p) => p.id === opts.preset) ? (opts.preset as PdfPresetId) : detectPdfPreset(pages));
  const preset = PDF_PRESETS.find((p) => p.id === id);
  const base = preset ? runPreset(pages, preset) : runGeneric(pages);
  const meta = preset?.meta?.(pages) ?? {};
  const ctx = preset?.context?.(pages) ?? {};
  const opening = meta.opening ?? base.opening;
  const warnings = checkBalances(base.rows, opening);
  const text = pageText(pages, 1);
  const acc = text.match(/(?:NO\.?REKENING|ACCOUNTNO\.?|ACCOUNTNUMBER)[^0-9]{0,12}(\d{8,20})/)?.[1];
  const label = preset?.label ?? "Other bank PDF";
  const dates = base.rows.map((r) => r.date).sort();
  const bits = [`${pages.length} page${pages.length === 1 ? "" : "s"}`, `${base.rows.length} transaction${base.rows.length === 1 ? "" : "s"}`];
  if (dates.length) bits.push(`${dates[0]} → ${dates[dates.length - 1]}`);
  if (opening !== undefined) bits.push(`opening ${opening.toLocaleString("en-US")}`);
  if (meta.closing !== undefined) bits.push(`closing ${meta.closing.toLocaleString("en-US")}`);
  return {
    preset: id, label, rows: base.rows, errors: [...base.errors, ...warnings], note: `${label} · ${bits.join(" · ")}`, pages: pages.length, scanned,
    opening, closing: meta.closing, periodFrom: ctx.from ?? dates[0], periodTo: ctx.to ?? dates[dates.length - 1], accountNumber: acc,
  };
}
