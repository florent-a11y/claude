import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorMessage } from "@/lib/books";
import { chooseSheet, sheetsFromFile } from "@/lib/statement-file";
import { filterCurrency, presetById, PRESETS, type PresetId } from "@/lib/bank-formats";

export const runtime = "nodejs";
const MAX_BYTES = 15 * 1024 * 1024;
const GRID_ROWS_RETURNED = 6000;

/**
 * POST multipart {file, bankAccountId, preset?}: parses a CSV/XLS/XLSX statement on the server, detects the bank
 * format and returns the parsed rows (for known banks) plus the raw grid (for manual column mapping).
 */
export async function POST(req: Request, ctx: { params: Promise<{ entityId: string }> }) {
  const user = await guard("books:write");
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
    const sheets = sheetsFromFile(file.name, Buffer.from(await file.arrayBuffer()));
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
