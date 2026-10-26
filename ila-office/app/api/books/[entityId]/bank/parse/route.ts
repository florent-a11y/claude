import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorMessage } from "@/lib/books";
import { chooseSheet, sheetsFromFile } from "@/lib/statement-file";
import { filterCurrency, presetById, PRESETS, type PresetId } from "@/lib/bank-formats";
import { extractPdfPages } from "@/lib/pdf-text";
import { parseBankPdf, PDF_PRESET_OPTIONS } from "@/lib/bank-pdf";

export const runtime = "nodejs";
const MAX_BYTES = 15 * 1024 * 1024;
const GRID_ROWS_RETURNED = 6000;

/**
 * POST multipart {file, bankAccountId, preset?}: parses a statement on the server and returns the rows.
 * PDF e-statements (BCA, BNI, BRI, CIMB Niaga, Mandiri) are read from their text layer; CSV/XLS/XLSX exports go through
 * the bank presets, or come back as a raw grid for manual column mapping.
 */
export async function POST(req: Request, ctx: { params: Promise<{ entityId: string }> }) {
  const user = await guard("books:write", (await ctx.params).entityId);
  if (user instanceof Response) return user;
  const { entityId } = await ctx.params;
  try {
    const fd = await req.formData();
    const file = fd.get("file");
    const bankAccountId = String(fd.get("bankAccountId") ?? "");
    const forced = String(fd.get("preset") ?? "") as PresetId | "";
    if (!(file instanceof File)) return Response.json({ error: "Choose a statement file." }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "File larger than 15 MB." }, { status: 413 });
    const bank = await db.get("bank_accounts", bankAccountId);
    if (!bank || bank.entityId !== entityId) return Response.json({ error: "Bank account not found" }, { status: 404 });
    const buf = Buffer.from(await file.arrayBuffer());
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf" || buf.subarray(0, 5).toString("latin1") === "%PDF-") {
      const pages = await extractPdfPages(buf);
      const r = parseBankPdf(pages, { preset: forced || undefined });
      if (r.scanned) return Response.json({ error: "This PDF has no text layer (it is a scanned image), so it cannot be read. Ask the bank for the e-statement PDF, or export CSV / Excel from internet banking." }, { status: 400 });
      const f = filterCurrency(r.rows, bank.currency);
      const errors = r.errors.filter((e) => !e.startsWith("Running balance"));
      const warnings = r.errors.filter((e) => e.startsWith("Running balance"));
      const digits = (s?: string) => (s ?? "").replace(/\D/g, "");
      const [a, b] = [digits(r.accountNumber), digits(bank.accountNumber)];
      if (a && b && !(a.endsWith(b) || b.endsWith(a))) warnings.unshift(`The statement is for account ${r.accountNumber}, but this bank account is ${bank.accountNumber}. Check you picked the right account.`);
      let note = r.note;
      if (r.rows.length === 0) note += " · No transactions recognised: pick another bank format above, or export the statement as CSV / Excel.";
      return Response.json({
        fileName: file.name, sheet: "PDF", sheets: [], preset: r.preset, presetLabel: r.label, presets: PDF_PRESET_OPTIONS,
        rows: f.rows, errors, warnings, headerRow: -1, note, dropped: f.dropped, grid: [], truncated: false,
        pdf: { pages: r.pages, opening: r.opening, closing: r.closing, periodFrom: r.periodFrom, periodTo: r.periodTo, accountNumber: r.accountNumber },
      });
    }
    const sheets = sheetsFromFile(file.name, buf);
    if (sheets.length === 0 || sheets.every((s) => s.grid.length === 0)) return Response.json({ error: "The file has no rows." }, { status: 400 });
    const chosen = chooseSheet(sheets, file.name, forced || undefined);
    const preset = presetById(chosen.preset);
    let rows: unknown[] = [], errors: string[] = [], headerRow = -1, note = "", dropped = 0;
    if (preset) {
      const ex = preset.extract(chosen.grid);
      const f = filterCurrency(ex.rows, bank.currency);
      rows = f.rows; dropped = f.dropped; errors = ex.errors; headerRow = ex.headerRow; note = ex.note;
    }
    return Response.json({
      fileName: file.name, sheet: chosen.sheet, sheets: sheets.map((s) => s.name), preset: chosen.preset, presetLabel: preset?.label ?? "Generic (map the columns)",
      presets: [...PRESETS.map((p) => ({ id: p.id, label: p.label })), { id: "generic", label: "Generic CSV / spreadsheet (map the columns)" }],
      rows, errors, headerRow, note, dropped, grid: chosen.grid.slice(0, GRID_ROWS_RETURNED), truncated: chosen.grid.length > GRID_ROWS_RETURNED,
    });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 400 });
  }
}
