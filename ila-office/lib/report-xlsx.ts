import * as XLSX from "xlsx";

/**
 * Excel export for the Books reports (SheetJS, server only). Each sheet is a header row plus data rows; numbers stay
 * numeric (with a thousands format) so clients can sum and reconcile in Excel, dates are ISO strings, and column
 * widths come from `colWidths` (characters) or from the longest cell.
 */
export interface XlsxSheet { name: string; headers: string[]; rows: unknown[][]; /** Width per column in characters. */ colWidths?: number[] }

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const MAX_WIDTH = 60;

function cellValue(v: unknown): string | number | boolean {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? v : "";
  if (typeof v === "boolean") return v;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v);
}

/** Excel sheet names: at most 31 characters, none of []:*?/\ and unique within the workbook. */
function sheetName(raw: string, used: Set<string>): string {
  const base = (raw.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim() || "Sheet").slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

function autoWidths(data: Array<Array<string | number | boolean>>): number[] {
  const widths: number[] = [];
  for (const row of data) {
    row.forEach((c, i) => {
      const len = typeof c === "number" ? c.toLocaleString("en-US").length : String(c).length;
      widths[i] = Math.max(widths[i] ?? 0, len);
    });
  }
  return widths.map((w) => Math.min(MAX_WIDTH, Math.max(8, w + 2)));
}

/** Builds an .xlsx workbook (one worksheet per entry) and returns its bytes. */
export function buildWorkbook(sheets: XlsxSheet[]): Buffer {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  sheets.forEach((s, i) => {
    const data = [s.headers.map(cellValue), ...s.rows.map((r) => r.map(cellValue))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const ref = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let r = 1; r <= ref.e.r; r++) {
      for (let c = 0; c <= ref.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
        if (cell && cell.t === "n" && typeof cell.v === "number") cell.z = Number.isInteger(cell.v) ? "#,##0" : "#,##0.00";
      }
    }
    ws["!cols"] = (s.colWidths ?? autoWidths(data)).map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName(s.name || `Sheet${i + 1}`, used));
  });
  if (sheets.length === 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Response that downloads the workbook as `filename`. */
export function xlsxResponse(sheets: XlsxSheet[], filename: string): Response {
  const buf = buildWorkbook(sheets);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": XLSX_CONTENT_TYPE,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
