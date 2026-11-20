import { z } from "zod";
import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { createBankAccount, entityAccounts, errorMessage } from "@/lib/books";
import { NEW_GL, nextBankGlCode } from "@/lib/bank-sections";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(1, "Give the bank account a name").max(120),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Currency is a three-letter code"),
  bankName: z.string().trim().max(80).optional(),
  accountNumber: z.string().trim().max(60).optional(),
  /** An unused bank or cash GL account, or NEW_GL (or nothing) to create one with the next free bank code. */
  accountId: z.string().optional(),
});

/**
 * POST → creates a bank account from the statement import screen, when a statement carries a currency the entity
 * has no bank account for yet (the USD section of an OCBC multi-currency PDF). Returns `{ id, name, currency }`.
 * The GL account is the one chosen, or a new bank GL account named after the bank account.
 */
export async function POST(req: Request, ctx: { params: Promise<{ entityId: string }> }) {
  const user = await guard("books:write", (await ctx.params).entityId);
  if (user instanceof Response) return user;
  const { entityId } = await ctx.params;
  const entity = await db.get("entities", entityId);
  if (!entity) return Response.json({ error: "Entity not found" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: errorMessage(parsed.error) }, { status: 400 });
  const v = parsed.data;
  try {
    const [accounts, banks] = await Promise.all([entityAccounts(entityId), db.list("bank_accounts", { where: { entityId } })]);
    const currency = v.currency.toUpperCase();
    const existing = !v.accountId || v.accountId === NEW_GL ? undefined : v.accountId;
    if (existing && banks.some((b) => b.accountId === existing)) return Response.json({ error: "That GL account already belongs to another bank account: choose another one, or create a new GL account." }, { status: 400 });
    if (banks.some((b) => b.active && b.name.trim().toLowerCase() === v.name.toLowerCase() && b.currency.toUpperCase() === currency)) return Response.json({ error: `A ${currency} bank account named ${v.name} already exists: choose it in the list instead.` }, { status: 400 });
    const bank = await createBankAccount(entityId, {
      name: v.name, bankName: v.bankName || undefined, accountNumber: v.accountNumber || undefined, currency, accountId: existing,
      newAccount: existing ? undefined : { code: nextBankGlCode(accounts), name: v.name, subtype: "bank" },
    });
    return Response.json({ id: bank.id, name: bank.name, currency: bank.currency });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 400 });
  }
}
