/**
 * CSV helpers for the ops exports. Every cell is quoted, and a cell that a spreadsheet would read as a formula
 * (leading =, +, -, @, tab or CR) is prefixed with an apostrophe so customer-supplied text cannot run when
 * the file is opened in Excel, Numbers or Google Sheets.
 */
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvResponse(header: string[], rows: unknown[][], filename: string): Response {
  const lines = [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
