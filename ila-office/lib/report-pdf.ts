import PDFDocument from "pdfkit";
import { fmtDate, todayISO } from "./dates";
import { fmtNumber } from "./money";

/**
 * Financial statements as PDF (pdfkit, standard Helvetica, A4): the generic table renderer behind the P&L, balance
 * sheet, trial balance and general ledger downloads. Every page repeats the entity header, the title and the column
 * headings; rows carry a style (section, indent, total, grand) that mirrors the on-screen `.table-statement` look.
 */
export interface StatementColumn { label: string; /** Relative width: columns are scaled to fill the printable width. */ width: number; align: "left" | "right" }
export type StatementRowStyle = "normal" | "indent" | "section" | "total" | "grand";
export interface StatementRow { cells: string[]; style?: StatementRowStyle }
export interface StatementEntity { legalName: string; name: string; address?: string; npwp?: string }
export interface StatementPdfInput {
  entity: StatementEntity;
  title: string;
  /** Period or as-of line under the title. */
  subtitle: string;
  columns: StatementColumn[];
  rows: StatementRow[];
  landscape?: boolean;
  /** Small print after the last row. */
  note?: string;
  /** Body font size in points (default 9; wide monthly tables pass less). */
  fontSize?: number;
}

/** Numbers in statements: thousands separators, "-" for negatives, no currency symbol, zero printed as "0". */
export function pdfNumber(n: number, decimals = 0): string {
  return fmtNumber(Object.is(n, -0) ? 0 : n, decimals);
}

const MARGIN = 40;
const INDENT = 14;
const CELL_PAD = 4;
const FOOTER_HEIGHT = 16;
const INK = "#15202b", GREY = "#65727f", RULE = "#94a3b8", LIGHT = "#e2e8f0";

/** Standard fonts only know WinAnsi; anything else would print as garbage, so it becomes "?". */
function safe(s: string): string {
  return s.replace(/[^\x20-\x7e\xa0-\xff–—‘’“”•…€™]/g, "?");
}

export function renderStatementPdf(input: StatementPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const fs = input.fontSize ?? 9;
    const doc = new PDFDocument({
      size: "A4", layout: input.landscape ? "landscape" : "portrait", margin: MARGIN, bufferPages: true,
      info: { Title: `${input.title} - ${input.entity.legalName || input.entity.name}`, Author: input.entity.legalName || input.entity.name, Creator: "ILA Office" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = MARGIN, right = doc.page.width - MARGIN, width = right - left;
    const maxY = doc.page.height - MARGIN - FOOTER_HEIGHT;
    const weight = input.columns.reduce((s, c) => s + Math.max(1, c.width), 0) || 1;
    let x = left;
    const cols = input.columns.map((c) => {
      const w = (Math.max(1, c.width) / weight) * width;
      const col = { ...c, x, w };
      x += w;
      return col;
    });
    const lineH = fs * 1.3;
    const rowPad = 2.5;

    const header = (): number => {
      let y = MARGIN;
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(13).text(safe(input.entity.legalName || input.entity.name), left, y, { width, align: "center" });
      y = doc.y + 1;
      const meta = [input.entity.address, input.entity.npwp ? `NPWP ${input.entity.npwp}` : undefined].filter(Boolean).join(" · ");
      if (meta) { doc.fillColor(GREY).font("Helvetica").fontSize(8).text(safe(meta), left, y, { width, align: "center" }); y = doc.y + 1; }
      doc.fillColor(INK).font("Helvetica").fontSize(11).text(safe(input.title), left, y + 2, { width, align: "center" });
      y = doc.y + 1;
      doc.fillColor(GREY).font("Helvetica").fontSize(9).text(safe(input.subtitle), left, y, { width, align: "center" });
      y = doc.y + 10;
      doc.fillColor(GREY).font("Helvetica-Bold").fontSize(Math.max(6.5, fs - 1));
      let h = 0;
      for (const c of cols) h = Math.max(h, doc.heightOfString(safe(c.label), { width: c.w - CELL_PAD * 2 }));
      for (const c of cols) doc.text(safe(c.label), c.x + CELL_PAD, y, { width: c.w - CELL_PAD * 2, align: c.align, lineBreak: true });
      y += h + 3;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.8).strokeColor(RULE).stroke();
      return y + 3;
    };

    const fontFor = (style: StatementRowStyle) => (style === "normal" || style === "indent" ? "Helvetica" : "Helvetica-Bold");
    const cellText = (row: StatementRow, i: number) => {
      const s = safe(row.cells[i] ?? "");
      return row.style === "section" ? s.toUpperCase() : s;
    };
    /** Numbers never wrap: a figure wider than its column is printed smaller instead. */
    const fitSize = (text: string, w: number): number => {
      let size = fs;
      while (size > 5 && doc.fontSize(size).widthOfString(text) > w) size -= 0.5;
      return size;
    };
    const rowHeight = (row: StatementRow): number => {
      const style = row.style ?? "normal";
      doc.font(fontFor(style)).fontSize(fs);
      let h = lineH;
      cols.forEach((c, i) => {
        const text = cellText(row, i);
        if (!text) return;
        const w = c.w - CELL_PAD * 2 - (i === 0 && style === "indent" ? INDENT : 0);
        if (c.align === "right") return; // single line, shrunk to fit
        h = Math.max(h, doc.heightOfString(text, { width: w }));
      });
      const extra = style === "section" ? 6 : style === "grand" ? 4 : style === "total" ? 1.5 : 0;
      return h + rowPad * 2 + extra;
    };
    const drawRow = (row: StatementRow, y: number): number => {
      const style = row.style ?? "normal";
      const h = rowHeight(row);
      let top = y;
      if (style === "section") top += 6;
      if (style === "total" || style === "grand") { doc.moveTo(left, top).lineTo(right, top).lineWidth(0.5).strokeColor(RULE).stroke(); top += style === "grand" ? 2 : 1.5; }
      doc.fillColor(style === "section" ? GREY : INK).font(fontFor(style));
      cols.forEach((c, i) => {
        const text = cellText(row, i);
        if (!text) return;
        const indent = i === 0 && style === "indent" ? INDENT : 0;
        const w = c.w - CELL_PAD * 2 - indent;
        const size = c.align === "right" ? fitSize(text, w) : style === "section" ? Math.max(6.5, fs - 1) : fs;
        doc.fontSize(size).text(text, c.x + CELL_PAD + indent, top + rowPad + (fs - size) * 0.6, { width: w, align: c.align, lineBreak: c.align === "left" });
      });
      const bottom = y + h;
      if (style === "grand") {
        doc.moveTo(left, bottom - 2.5).lineTo(right, bottom - 2.5).lineWidth(0.5).strokeColor(RULE).stroke();
        doc.moveTo(left, bottom - 0.5).lineTo(right, bottom - 0.5).lineWidth(0.5).strokeColor(RULE).stroke();
      } else if (style === "normal" || style === "indent") {
        doc.moveTo(left, bottom).lineTo(right, bottom).lineWidth(0.25).strokeColor(LIGHT).stroke();
      }
      return bottom;
    };

    let y = header();
    const rows = input.rows;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let need = rowHeight(row);
      // A section heading must be followed by at least one row on the same page.
      if (row.style === "section" && i + 1 < rows.length) need += rowHeight(rows[i + 1]);
      if (y + need > maxY) { doc.addPage(); y = header(); }
      y = drawRow(row, y);
    }
    if (rows.length === 0) {
      doc.fillColor(GREY).font("Helvetica").fontSize(fs).text("No rows in this range.", left, y + rowPad, { width, align: "center" });
      y = doc.y;
    }
    if (input.note) {
      doc.font("Helvetica-Oblique").fontSize(8);
      const h = doc.heightOfString(safe(input.note), { width });
      if (y + 10 + h > maxY) { doc.addPage(); y = header(); }
      doc.fillColor(GREY).text(safe(input.note), left, y + 10, { width });
    }

    // Footer on every page, stamped once the page count is known.
    const range = doc.bufferedPageRange();
    const generated = fmtDate(todayISO());
    for (let p = range.start; p < range.start + range.count; p++) {
      doc.switchToPage(p);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fillColor(GREY).font("Helvetica").fontSize(7.5).text(`ILA Office · generated ${generated} · page ${p - range.start + 1} of ${range.count}`, left, doc.page.height - MARGIN + 6, { width, align: "center", lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}
