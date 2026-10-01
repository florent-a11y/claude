import { z } from "zod";
import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseCSV } from "@/lib/csv";
import { importBankCsv, mapBankRows, errorMessage } from "@/lib/books";
import type { ParsedBankRow } from "@/lib/ledger";

export const runtime = "nodejs";

const mappingSchema = z.object({ date: z.number().int().min(0), description: z.number().int().min(0), amount: z.number().int().min(0).optional(), debit: z.number().int().min(0).optional(), credit: z.number().int().min(0).optional(), balance: z.number().int().min(0).optional(), reference: z.number().int().min(0).optional(), dateFormat: z.enum(["dd/mm/yyyy", "yyyy-mm-dd", "mm/dd/yyyy", "auto"]), debitIsOut: z.boolean().optional(), invertAmount: z.boolean().optional() });
const rowSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), description: z.string().min(1).max(500), amount: z.number().finite(), balance: z.number().finite().optional(), reference: z.string().max(120).optional(), currency: z.string().max(3).optional() });
const schema = z.object({
  bankAccountId: z.string().min(1), fileName: z.string().max(200).default("statement.csv"),
  /** Legacy path: raw CSV text + column mapping (generic format). */
  text: z.string().max(5_000_000).optional(), hasHeader: z.boolean().default(true), mapping: mappingSchema.optional(),
  /** Grid + mapping (generic format parsed on the server). */
  grid: z.array(z.array(z.string())).max(20_000).optional(),
  /** Rows already parsed by a bank preset (returned by /bank/parse) and reviewed by the user. */
  rows: z.array(rowSchema).max(20_000).optional(),
});

/** POST: stores new (deduplicated) bank transactions, either pre-parsed by a bank preset or mapped from a CSV/grid. */
export async function POST(req: Request, ctx: { params: Promise<{ entityId: string }> }) {
  const user = await guard("books:write");
  if (user instanceof Response) return user;
  const { entityId } = await ctx.params;
  const entity = await db.get("entities", entityId);
  if (!entity) return Response.json({ error: "Entity not found" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: errorMessage(parsed.error) }, { status: 400 });
  const { bankAccountId, fileName, text, hasHeader, mapping, grid, rows: presetRows } = parsed.data;
  try {
    let mapped: ParsedBankRow[]; let errors: string[] = [];
    if (presetRows) {
      const bank = await db.get("bank_accounts", bankAccountId);
      if (!bank || bank.entityId !== entityId) return Response.json({ error: "Bank account not found" }, { status: 404 });
      mapped = presetRows.filter((r) => !r.currency || r.currency.toUpperCase() === bank.currency.toUpperCase());
    } else {
      if (!mapping) return Response.json({ error: "Column mapping is required." }, { status: 400 });
      if (mapping.amount === undefined && mapping.debit === undefined && mapping.credit === undefined) return Response.json({ error: "Map an amount column or debit/credit columns." }, { status: 400 });
      const all = grid ?? (text ? parseCSV(text) : []);
      ({ rows: mapped, errors } = mapBankRows(hasHeader ? all.slice(1) : all, mapping));
    }
    const batch = await importBankCsv(entityId, { bankAccountId, fileName, rows: mapped, errors }, user.id);
    return Response.json({ id: batch.id, rows: batch.rows, inserted: batch.inserted, skipped: batch.skipped, errors: batch.errors });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 400 });
  }
}
