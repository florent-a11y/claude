import type { ParsedBankRow } from "./ledger";
import { parseMoney } from "./money";

/**
 * Bank statement formats ILA receives from clients, reconstructed from real exports:
 * - OCBC (Velocity) xlsx: a few header lines, then "Transaction Date, Value Date, Reference No., Cheque No., Description, Debit, Credit, Balance".
 * - Mandiri (Kopra) CSV: semicolon-separated "AccountNo;Ccy;PostDate;Remarks;AdditionalDesc;Credit Amount;Debit Amount;Close Balance",
 *   dates like "16 March 2026 09:34:53", remarks padded with spaces.
 * - BNI (BNIDirect) xls: merged-cell layout; header "Posting Date … Amount, DB/CR, Balance" but the values of each row sit in
 *   other columns, dates are Excel serial numbers, D/K marks debit/credit, page headers repeat every ~25 rows.
 * - Aspire xlsx: one header row (localised: English, Spanish, French…), signed "Amount", "Date" as d/m/yyyy, "Running balance".
 * Everything here is pure: it takes a grid of strings (CSV rows or spreadsheet cells as text) and returns parsed rows.
 */

export type Grid = string[][];
export type PresetId = "ocbc" | "mandiri" | "bni" | "aspire" | "generic";

export interface Extraction { rows: ParsedBankRow[]; errors: string[]; headerRow: number; note: string }
export interface Preset { id: PresetId; label: string; detect: (grid: Grid, fileName: string) => number; extract: (grid: Grid) => Extraction }

// ---------- Dates ----------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2, mar: 3, march: 3, maret: 3, apr: 4, april: 4, may: 5, mei: 5, jun: 6, june: 6, juni: 6,
  jul: 7, july: 7, juli: 7, aug: 8, august: 8, agu: 8, agt: 8, agustus: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, okt: 10, oktober: 10,
  nov: 11, november: 11, nopember: 11, dec: 12, december: 12, des: 12, desember: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return Number.isNaN(Date.parse(s)) ? null : s;
}

/** Excel serial day number (days since 1899-12-30) → ISO date. */
export function excelSerialToISO(n: number): string | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5);
  return d.toISOString().slice(0, 10);
}

/**
 * Parses the date formats seen on Indonesian bank exports: "2026-03-31", "31/03/2026 14:54:32", "1/4/2026", "01-Apr-26",
 * "16 March 2026 09:34:53", "31 Maret 2026", Excel serials "46129.47". Numeric d/m/y is assumed (Indonesia) unless `monthFirst`.
 */
export function parseAnyDate(raw: string | number | undefined | null, opts: { monthFirst?: boolean } = {}): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return excelSerialToISO(raw);
  const s = String(raw).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) return opts.monthFirst ? iso(Number(m[3]), Number(m[1]), Number(m[2])) : iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{1,2})[\s\-\/]+([A-Za-z]{3,9})\.?[\s\-\/,]+(\d{2,4})/);
  if (m) { const mo = MONTHS[m[2].toLowerCase()]; return mo ? iso(Number(m[3]), mo, Number(m[1])) : null; }
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) { const mo = MONTHS[m[1].toLowerCase()]; return mo ? iso(Number(m[3]), mo, Number(m[2])) : null; }
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToISO(Number(s));
  return null;
}

// ---------- Helpers ----------

const norm = (s: string | undefined) => (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
const clean = (s: string | undefined) => (s ?? "").toString().replace(/\s+/g, " ").trim();
const money = (s: string | undefined) => (s === undefined || s === null || String(s).trim() === "" ? 0 : parseMoney(String(s)));

function findHeader(grid: Grid, required: string[][], maxRows = 60): { row: number; idx: (names: string[]) => number } | null {
  for (let r = 0; r < Math.min(grid.length, maxRows); r++) {
    const cells = grid[r].map(norm);
    const ok = required.every((alts) => cells.some((c) => alts.includes(c)));
    if (ok) return { row: r, idx: (names) => cells.findIndex((c) => names.map(norm).includes(c)) };
  }
  return null;
}

function skipTrailing(desc: string): boolean {
  return /^(total|ending balance|closing balance|opening balance|saldo akhir|saldo awal|jumlah)\b/i.test(desc);
}

// ---------- Presets ----------

const OCBC: Preset = {
  id: "ocbc", label: "OCBC (Velocity export)",
  detect: (grid, fileName) => (findHeader(grid, [["transaction date"], ["value date"], ["debit"], ["credit"]]) ? 3 : 0) + (/ocbc/i.test(fileName) ? 1 : 0),
  extract: (grid) => {
    const h = findHeader(grid, [["transaction date"], ["value date"], ["debit"], ["credit"]]);
    if (!h) return { rows: [], errors: ["OCBC header row not found"], headerRow: -1, note: "" };
    const c = { date: h.idx(["transaction date"]), ref: h.idx(["reference no.", "reference no", "reference"]), desc: h.idx(["description"]), debit: h.idx(["debit"]), credit: h.idx(["credit"]), balance: h.idx(["balance"]) };
    const rows: ParsedBankRow[] = []; const errors: string[] = [];
    for (let r = h.row + 1; r < grid.length; r++) {
      const g = grid[r];
      const date = parseAnyDate(g[c.date]);
      if (!date) continue; // blank lines, continuation lines of hand-edited sheets, summary blocks
      const debit = Math.abs(money(g[c.debit])), credit = Math.abs(money(g[c.credit]));
      const amount = credit - debit;
      if (amount === 0) { errors.push(`Row ${r + 1}: no amount`); continue; }
      const balance = c.balance >= 0 ? money(g[c.balance]) : undefined;
      rows.push({ date, description: clean(g[c.desc]) || "(no description)", amount, balance: Number.isFinite(balance ?? NaN) && g[c.balance]?.trim() ? balance : undefined, reference: c.ref >= 0 ? clean(g[c.ref]) || undefined : undefined });
    }
    return { rows, errors, headerRow: h.row, note: "Debit = money out, credit = money in; reference = OCBC reference no." };
  },
};

const MANDIRI: Preset = {
  id: "mandiri", label: "Mandiri (Kopra account statement CSV)",
  detect: (grid, fileName) => (findHeader(grid, [["postdate", "post date", "posting date"], ["credit amount", "credit"], ["debit amount", "debit"]], 5) ? 3 : 0) + (/acc_statement|mandiri|kopra/i.test(fileName) ? 1 : 0),
  extract: (grid) => {
    const h = findHeader(grid, [["postdate", "post date", "posting date"], ["credit amount", "credit"], ["debit amount", "debit"]], 5);
    if (!h) return { rows: [], errors: ["Mandiri header row not found"], headerRow: -1, note: "" };
    const c = { date: h.idx(["postdate", "post date", "posting date"]), remarks: h.idx(["remarks", "description"]), extra: h.idx(["additionaldesc", "additional desc"]), credit: h.idx(["credit amount", "credit"]), debit: h.idx(["debit amount", "debit"]), balance: h.idx(["close balance", "closing balance", "balance"]), ccy: h.idx(["ccy", "currency"]) };
    const rows: ParsedBankRow[] = []; const errors: string[] = [];
    for (let r = h.row + 1; r < grid.length; r++) {
      const g = grid[r];
      if (!g.some((x) => x && x.trim())) continue;
      const date = parseAnyDate(g[c.date]);
      if (!date) { errors.push(`Row ${r + 1}: unreadable date "${g[c.date] ?? ""}"`); continue; }
      const amount = Math.abs(money(g[c.credit])) - Math.abs(money(g[c.debit]));
      if (amount === 0) { errors.push(`Row ${r + 1}: no amount`); continue; }
      let description = clean(g[c.remarks]);
      if (!description && c.extra >= 0) description = clean(g[c.extra]);
      // The journal id (e.g. 20260331BMRIIDJA010O9931008352) doubles as a reference when present.
      const ref = description.match(/\b(\d{8}[A-Z]{8}\d{3}[A-Z]\d{10})\b/)?.[1];
      rows.push({ date, description: description || "(no description)", amount, balance: c.balance >= 0 && g[c.balance]?.trim() ? money(g[c.balance]) : undefined, reference: ref, currency: c.ccy >= 0 ? clean(g[c.ccy]) || undefined : undefined });
    }
    return { rows, errors, headerRow: h.row, note: "Kopra export: PostDate with time, Remarks collapsed to single spaces." };
  },
};

const SIGN_OUT = new Set(["d", "db", "dr", "debit", "debet"]);
const SIGN_IN = new Set(["k", "c", "cr", "credit", "kredit"]);

const BNI: Preset = {
  id: "bni", label: "BNI (BNIDirect account statement xls)",
  detect: (grid, fileName) => (findHeader(grid, [["posting date"], ["db/cr", "db / cr", "dc"], ["balance"]]) ? 3 : 0) + (/bni/i.test(fileName) ? 1 : 0),
  extract: (grid) => {
    const h = findHeader(grid, [["posting date"], ["db/cr", "db / cr", "dc"], ["balance"]]);
    if (!h) return { rows: [], errors: ["BNI header row not found"], headerRow: -1, note: "" };
    const rows: ParsedBankRow[] = []; const errors: string[] = [];
    for (let r = h.row + 1; r < grid.length; r++) {
      // Merged cells shift values away from the header columns: work on the non-empty cells in order
      // [posting date, effective date, branch, journal, description, amount, D/K, balance].
      const cells = grid[r].map((x) => (x ?? "").toString().trim()).filter(Boolean);
      if (cells.length < 5) continue;
      const s = cells.findIndex((x) => SIGN_OUT.has(x.toLowerCase()) || SIGN_IN.has(x.toLowerCase()));
      if (s < 2) continue; // page headers, totals, opening balance line
      const date = parseAnyDate(cells[0]);
      if (!date) { errors.push(`Row ${r + 1}: unreadable date "${cells[0]}"`); continue; }
      const amt = Math.abs(money(cells[s - 1]));
      if (!amt) { errors.push(`Row ${r + 1}: no amount`); continue; }
      const out = SIGN_OUT.has(cells[s].toLowerCase());
      const description = clean(cells[s - 2]);
      const reference = s - 3 >= 2 ? clean(cells[s - 3]) : undefined;
      const balance = cells[s + 1] !== undefined ? money(cells[s + 1]) : undefined;
      rows.push({ date, description: description || "(no description)", amount: out ? -amt : amt, balance, reference: reference && /^\d+$/.test(reference) ? reference : undefined });
    }
    return { rows, errors, headerRow: h.row, note: "BNIDirect: D = money out, K = money in; journal number kept as reference; repeated page headers skipped." };
  },
};

const ASPIRE_DATE = ["date", "fecha", "transaction date", "tanggal"];
const ASPIRE_AMOUNT = ["amount", "cantidad", "montant", "jumlah", "importe"];
const ASPIRE_CCY = ["currency", "divisa", "devise", "mata uang", "moneda"];
const ASPIRE_DESC = ["description", "descripción", "descripcion", "deskripsi"];
const ASPIRE_REF = ["payment reference", "referencia del pago", "référence du paiement", "reference", "referencia"];
const ASPIRE_BAL = ["running balance", "saldo corriente", "solde courant", "balance", "saldo"];
const ASPIRE_ID = ["id", "documento de identidad", "transaction id", "identifiant"];

const ASPIRE: Preset = {
  id: "aspire", label: "Aspire (transactions export)",
  detect: (grid, fileName) => (findHeader(grid, [ASPIRE_DATE, ASPIRE_AMOUNT, ASPIRE_CCY], 5) ? 3 : 0) + (/aspire|statement_\d+_[A-Z]{3}_/i.test(fileName) ? 1 : 0),
  extract: (grid) => {
    const h = findHeader(grid, [ASPIRE_DATE, ASPIRE_AMOUNT, ASPIRE_CCY], 5);
    if (!h) return { rows: [], errors: ["Aspire header row not found"], headerRow: -1, note: "" };
    const c = { date: h.idx(ASPIRE_DATE), amount: h.idx(ASPIRE_AMOUNT), ccy: h.idx(ASPIRE_CCY), desc: h.idx(ASPIRE_DESC), ref: h.idx(ASPIRE_REF), balance: h.idx(ASPIRE_BAL), id: h.idx(ASPIRE_ID) };
    const rows: ParsedBankRow[] = []; const errors: string[] = [];
    for (let r = h.row + 1; r < grid.length; r++) {
      const g = grid[r];
      if (!g.some((x) => x && x.trim())) continue;
      const date = parseAnyDate(g[c.date]);
      if (!date) { errors.push(`Row ${r + 1}: unreadable date "${g[c.date] ?? ""}"`); continue; }
      const amount = money(g[c.amount]);
      if (!amount) { errors.push(`Row ${r + 1}: no amount`); continue; }
      const ref = c.ref >= 0 ? clean(g[c.ref]) : "";
      rows.push({ date, description: clean(g[c.desc]) || "(no description)", amount, balance: c.balance >= 0 && g[c.balance]?.trim() ? money(g[c.balance]) : undefined, reference: ref || (c.id >= 0 ? clean(g[c.id]) || undefined : undefined), currency: c.ccy >= 0 ? clean(g[c.ccy]) || undefined : undefined });
    }
    return { rows, errors, headerRow: h.row, note: "Aspire: signed amount; rows in another currency than the account are skipped." };
  },
};

export const PRESETS: Preset[] = [OCBC, MANDIRI, BNI, ASPIRE];

export function presetById(id: string | undefined): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** Picks the preset with the best score for this grid, or "generic" (manual column mapping) when nothing matches. */
export function detectPreset(grid: Grid, fileName = ""): { id: PresetId; score: number } {
  let best: { id: PresetId; score: number } = { id: "generic", score: 0 };
  for (const p of PRESETS) {
    const score = p.detect(grid, fileName);
    if (score > best.score) best = { id: p.id, score };
  }
  return best.score >= 3 ? best : { id: "generic", score: 0 };
}

/** Rows not belonging to the account's currency (Aspire multi-currency exports) are dropped with a note. */
export function filterCurrency(rows: ParsedBankRow[], currency: string): { rows: ParsedBankRow[]; dropped: number } {
  let dropped = 0;
  const out = rows.filter((r) => { if (r.currency && r.currency.toUpperCase() !== currency.toUpperCase()) { dropped++; return false; } return true; });
  return { rows: out, dropped };
}

/** Score for the generic path: how many rows after a candidate header have a date in the first few columns. */
export function looksLikeStatement(grid: Grid): boolean {
  let dated = 0;
  for (const g of grid.slice(0, 200)) if (g.slice(0, 6).some((c) => parseAnyDate(c))) dated++;
  return dated >= 2;
}
