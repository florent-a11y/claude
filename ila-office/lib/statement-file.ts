import * as XLSX from "xlsx";
import { parseCSV } from "./csv";
import { detectPreset, looksLikeStatement, presetById, type Grid, type PresetId } from "./bank-formats";

/**
 * Turns an uploaded statement file (CSV, XLS, XLSX) into grids of text cells, one per sheet, and picks the sheet and
 * bank preset that fit best. Server-side only (SheetJS); the browser never parses spreadsheets.
 */
export interface StatementSheet { name: string; grid: Grid }

const MAX_ROWS = 20_000;

export function sheetsFromFile(fileName: string, bytes: Buffer): StatementSheet[] {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || ext === "txt" || ext === "tsv") {
    const text = decodeText(bytes);
    return [{ name: "csv", grid: parseCSV(text).slice(0, MAX_ROWS) }];
  }
  // Some banks label HTML tables as .xls; SheetJS handles BIFF, OOXML and HTML alike.
  const wb = XLSX.read(bytes, { type: "buffer", raw: false, cellDates: false });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const grid = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false }) as unknown[][])
      .map((row) => row.map((c) => (c === null || c === undefined ? "" : String(c))))
      .slice(0, MAX_ROWS);
    return { name, grid };
  });
}

/** UTF-8 with BOM, or Windows-1252 fallback when the bytes are not valid UTF-8 (older bank exports). */
function decodeText(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export interface Detection { sheet: string; grid: Grid; preset: PresetId; score: number }

/** Chooses the sheet that matches a known bank best; otherwise the first sheet that looks like a statement. */
export function chooseSheet(sheets: StatementSheet[], fileName: string, forced?: PresetId): Detection {
  let best: Detection | null = null;
  for (const s of sheets) {
    if (forced && forced !== "generic") {
      const p = presetById(forced)!;
      const score = p.detect(s.grid, fileName);
      if (!best || score > best.score) best = { sheet: s.name, grid: s.grid, preset: forced, score };
      continue;
    }
    const d = detectPreset(s.grid, fileName);
    const score = d.id === "generic" ? (looksLikeStatement(s.grid) ? 1 : 0) : d.score;
    if (!best || score > best.score) best = { sheet: s.name, grid: s.grid, preset: d.id, score };
  }
  return best ?? { sheet: sheets[0]?.name ?? "", grid: sheets[0]?.grid ?? [], preset: forced ?? "generic", score: 0 };
}
