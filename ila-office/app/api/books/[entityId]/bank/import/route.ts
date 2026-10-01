import { z } from "zod";
import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseCSV } from "@/lib/csv";
import { importBankCsv, mapBankRows, errorMessage } from "@/lib/books";

export const runtime = "nodejs";

const schema = z.object({
  bankAccountId: z.string().min(1), fileName: z.string().max(200).default("statement.csv"), text: z.string().min(1).max(5_000_000), hasHeader: z.boolean().default(true),
  mapping: z.object({ date: z.number().int().min(0), description: z.number().int().min(0), amount: z.number().int().min(0).optional(), debit: z.number().int().min(0).optional(), credit: z.number().int().min(0).optional(), balance: z.number().int().min(0).optional(), reference: z.number().int().min(0).optional(), dateFormat: z.enum(["dd/mm/yyyy", "yyyy-mm-dd", "mm/dd/yyyy"]), debitIsOut: z.boolean().optional(), invertAmount: z.boolean().optional() }),
});

/** POST: parses a bank statement CSV with the given column mapping and stores new (deduplicated) transactions. */
export async function POST(req: Request, ctx: { params: Promise<{ entityId: string }> }) {
  const user = await guard("books:write");
  if (user instanceof Response) return user;
  const { entityId } = await ctx.params;
  const entity = await db.get("entities", entityId);
  if (!entity) return Response.json({ error: "Entity not found" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: errorMessage(parsed.error) }, { status: 400 });
  const { bankAccountId, fileName, text, hasHeader, mapping } = parsed.data;
  if (mapping.amount === undefined && mapping.debit === undefined && mapping.credit === undefined) return Response.json({ error: "Map an amount column or debit/credit columns." }, { status: 400 });
  try {
    const rows = parseCSV(text);
    const { rows: mapped, errors } = mapBankRows(hasHeader ? rows.slice(1) : rows, mapping);
    const batch = await importBankCsv(entityId, { bankAccountId, fileName, rows: mapped, errors }, user.id);
    return Response.json({ id: batch.id, rows: batch.rows, inserted: batch.inserted, skipped: batch.skipped, errors: batch.errors });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 400 });
  }
}
