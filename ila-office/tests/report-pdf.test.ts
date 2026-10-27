import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { renderStatementPdf, pdfNumber, type StatementRow } from "../lib/report-pdf";
import { buildWorkbook } from "../lib/report-xlsx";
import { extractPdfPages } from "../lib/pdf-text";

const entity = { legalName: "PT CONTOH SEJAHTERA", name: "Contoh", address: "Jl. Sunset Road 1, Kuta", npwp: "01.234.567.8-901.000" };
const columns = [{ label: "Account", width: 300, align: "left" as const }, { label: "01 Jan 2026 - 31 Mar 2026", width: 110, align: "right" as const }];

test("pdfNumber: thousands separators, minus sign, zero printed as 0", () => {
  assert.equal(pdfNumber(0), "0");
  assert.equal(pdfNumber(-0), "0");
  assert.equal(pdfNumber(1234567), "1,234,567");
  assert.equal(pdfNumber(-2500000), "-2,500,000");
  assert.equal(pdfNumber(1234.5, 2), "1,234.50");
});

test("renderStatementPdf: a one-page statement carries the header, the rows and the footer", async () => {
  const rows: StatementRow[] = [
    { cells: ["Revenue", ""], style: "section" },
    { cells: ["4-1000  Consulting fees", pdfNumber(12_500_000)], style: "indent" },
    { cells: ["4-1100  Credit notes", pdfNumber(-500_000)], style: "indent" },
    { cells: ["Total revenue", pdfNumber(12_000_000)], style: "total" },
    { cells: ["Operating expenses", ""], style: "section" },
    { cells: ["6-1000  Office rent", pdfNumber(0)], style: "indent" },
    { cells: ["Total operating expenses", pdfNumber(0)], style: "total" },
    { cells: ["Net profit", pdfNumber(12_000_000)], style: "grand" },
  ];
  const pdf = await renderStatementPdf({ entity, title: "Profit & loss", subtitle: "01 Jan 2026 - 31 Mar 2026", columns, rows, note: "Natural signs." });
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  const pages = await extractPdfPages(pdf);
  assert.equal(pages.length, 1);
  const text = pages[0].lines.map((l) => l.text).join("\n");
  assert.match(text, /PT CONTOH SEJAHTERA/);
  assert.match(text, /Profit & loss/);
  assert.match(text, /01 Jan 2026 - 31 Mar 2026/);
  assert.match(text, /NPWP 01\.234\.567\.8-901\.000/);
  assert.match(text, /REVENUE/); // section rows print in upper case
  assert.match(text, /Consulting fees\s+12,500,000/);
  assert.match(text, /Credit notes\s+-500,000/);
  assert.match(text, /Office rent\s+0/);
  assert.match(text, /Net profit\s+12,000,000/);
  assert.match(text, /Natural signs\./);
  assert.match(text, /ILA Office · generated .* · page 1 of 1/);
});

test("renderStatementPdf: long statements repeat the header on every page, number the pages and never end a page with a section heading", async () => {
  const rows: StatementRow[] = [];
  for (let s = 1; s <= 12; s++) {
    rows.push({ cells: [`Section ${s}`, ""], style: "section" });
    for (let i = 1; i <= 7; i++) rows.push({ cells: [`${s}-${i}00  Account ${s}.${i}`, pdfNumber(s * 1_000_000 + i)], style: "indent" });
    rows.push({ cells: [`Total section ${s}`, pdfNumber(s)], style: "total" });
  }
  rows.push({ cells: ["Grand total", pdfNumber(99)], style: "grand" });
  const pdf = await renderStatementPdf({ entity, title: "Trial balance", subtitle: "As of 31 Mar 2026", columns, rows, landscape: true });
  const pages = await extractPdfPages(pdf);
  assert.ok(pages.length >= 2, `expected several pages, got ${pages.length}`);
  assert.ok(pages[0].width > pages[0].height, "landscape");
  pages.forEach((p, i) => {
    const lines = p.lines.map((l) => l.text);
    assert.equal(lines[0], "PT CONTOH SEJAHTERA", `page ${i + 1} starts with the legal name`);
    assert.ok(lines.includes("Trial balance"), `page ${i + 1} repeats the title`);
    assert.ok(lines.includes("As of 31 Mar 2026"), `page ${i + 1} repeats the subtitle`);
    assert.ok(lines.some((l) => l.startsWith("Account")), `page ${i + 1} repeats the column header`);
    assert.match(lines[lines.length - 1], new RegExp(`^ILA Office · generated \\d{2} \\w{3} \\d{4} · page ${i + 1} of ${pages.length}$`));
    const lastRow = lines[lines.length - 2];
    assert.doesNotMatch(lastRow, /^SECTION \d+$/, `page ${i + 1} ends with a section heading: ${lastRow}`);
  });
  const all = pages.flatMap((p) => p.lines.map((l) => l.text));
  assert.ok(all.some((l) => /Grand total\s+99/.test(l)));
  for (let s = 1; s <= 12; s++) assert.ok(all.includes(`SECTION ${s}`), `section ${s} present`);
});

test("renderStatementPdf: an empty statement still renders", async () => {
  const pdf = await renderStatementPdf({ entity: { legalName: "", name: "Fallback Name" }, title: "General ledger", subtitle: "1-1000 · Cash", columns, rows: [] });
  const text = (await extractPdfPages(pdf))[0].lines.map((l) => l.text).join("\n");
  assert.match(text, /Fallback Name/);
  assert.match(text, /No rows in this range/);
});

test("buildWorkbook: numeric cells stay numbers, dates stay ISO strings, sheet names are sanitised and unique", () => {
  const buf = buildWorkbook([
    { name: "General ledger", headers: ["Date", "Entry", "Memo", "Debit", "Credit", "Balance"], rows: [["", "", "Opening balance 2026-01-01", "", "", 1_000_000], ["2026-01-15", "JE-1", "Rent", 0, 250_000, 750_000], ["", "", "Closing balance 2026-01-31", 0, 250_000, 750_000]], colWidths: [12, 10, 36, 16, 16, 16] },
    { name: "Summary: [x]/y?*", headers: ["Opening balance", "Total debit", "Total credit", "Closing balance"], rows: [[1_000_000, 0, 250_000, 750_000]] },
    { name: "Summary: [x]/y?*", headers: ["A"], rows: [[1.5]] },
  ]);
  assert.ok(Buffer.isBuffer(buf) && buf.length > 0);
  assert.equal(buf.subarray(0, 2).toString(), "PK"); // zip container
  const wb = XLSX.read(buf, { type: "buffer", cellNF: true });
  assert.deepEqual(wb.SheetNames, ["General ledger", "Summary x y", "Summary x y 2"]);
  const ws = wb.Sheets["General ledger"];
  assert.equal(ws["A1"].v, "Date");
  assert.equal(ws["F2"].t, "n");
  assert.equal(ws["F2"].v, 1_000_000);
  assert.equal(ws["E3"].t, "n");
  assert.equal(ws["E3"].v, 250_000);
  assert.equal(ws["D3"].t, "n");
  assert.equal(ws["D3"].v, 0);
  assert.equal(ws["A3"].t, "s");
  assert.equal(ws["A3"].v, "2026-01-15");
  assert.equal(ws["F2"].z, "#,##0"); // thousands format, still a number
  assert.equal(ws["F2"].w, "1,000,000");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  assert.equal(rows.length, 3);
  assert.equal(typeof rows[1].Credit, "number");
  const summary = wb.Sheets["Summary x y"];
  assert.equal(summary["A2"].t, "n");
  assert.equal(summary["D2"].v, 750_000);
  assert.equal(wb.Sheets["Summary x y 2"]["A2"].z, "#,##0.00");
});
