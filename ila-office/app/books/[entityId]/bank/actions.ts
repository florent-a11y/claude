"use server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { createBankAccount, transfer, matchBankTransaction, postBankTransaction, linkBankTransaction, setBankTransactionStatus, unmatchBankTransaction } from "@/lib/books";
import { bool, num, str } from "@/lib/util";
import { act, base } from "../shared";

const bankSchema = z.object({
  name: z.string().min(1, "Name is required").max(120), bankName: z.string().max(80).optional(), accountNumber: z.string().max(60).optional(), currency: z.string().length(3),
  openingBalance: z.number().optional(), openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  accountId: z.string().optional(), newCode: z.string().regex(/^\d-\d{4}$/, "GL code must look like 1-1120").optional(), newSubtype: z.enum(["bank", "cash"]).optional(),
});

export async function createBankAccountAction(entityId: string, fd: FormData) {
  const to = `${base(entityId)}/bank`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    const v = bankSchema.parse({
      name: str(fd, "name"), bankName: str(fd, "bankName"), accountNumber: str(fd, "accountNumber"), currency: (str(fd, "currency") ?? "IDR").toUpperCase(),
      openingBalance: num(fd, "openingBalance", 0) || undefined, openingDate: str(fd, "openingDate"), accountId: str(fd, "accountId") === "__new__" ? undefined : str(fd, "accountId"),
      newCode: str(fd, "accountId") === "__new__" ? str(fd, "newCode") : undefined, newSubtype: str(fd, "newSubtype") ?? "bank",
    });
    const bank = await createBankAccount(entityId, { ...v, newAccount: v.accountId ? undefined : { code: v.newCode ?? "", name: `${v.bankName ? `${v.bankName} ` : ""}${v.name}`.trim(), subtype: v.newSubtype ?? "bank" } });
    return `${to}/${bank.id}?ok=${encodeURIComponent(`Bank account ${bank.name} created`)}`;
  }, to);
}

export async function setBankActiveAction(entityId: string, bankAccountId: string, active: boolean) {
  const to = `${base(entityId)}/bank`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    const bank = await db.get("bank_accounts", bankAccountId);
    if (!bank || bank.entityId !== entityId) throw new Error("Bank account not found.");
    await db.update("bank_accounts", bankAccountId, { active });
  }, to);
}

const transferSchema = z.object({ fromBankAccountId: z.string().min(1), toBankAccountId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.number().positive(), currency: z.string().length(3), fxRate: z.number().min(0).optional(), toAmountIDR: z.number().min(0).optional(), feeIDR: z.number().min(0).optional(), reference: z.string().max(120).optional() });

export async function transferAction(entityId: string, fd: FormData) {
  const to = `${base(entityId)}/bank`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const v = transferSchema.parse({ fromBankAccountId: str(fd, "fromBankAccountId"), toBankAccountId: str(fd, "toBankAccountId"), date: str(fd, "date"), amount: num(fd, "amount", 0), currency: (str(fd, "currency") ?? "IDR").toUpperCase(), fxRate: num(fd, "fxRate", 0) || undefined, toAmountIDR: num(fd, "toAmountIDR", 0) || undefined, feeIDR: num(fd, "feeIDR", 0) || undefined, reference: str(fd, "reference") });
    const r = await transfer(entityId, v, user.id);
    return `${to}?ok=${encodeURIComponent(`Transfer posted (${r.journal.number})`)}`;
  }, to);
}

export async function matchAction(entityId: string, bankAccountId: string, txId: string, fd: FormData) {
  const back = `${base(entityId)}/bank/${bankAccountId}/tx/${txId}`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const v = z.object({ type: z.enum(["invoice", "bill"]), id: z.string().min(1), amount: z.number().min(0).optional(), fxRate: z.number().min(0).optional() }).parse({ type: str(fd, "type"), id: str(fd, "id"), amount: num(fd, "amount", 0) || undefined, fxRate: num(fd, "fxRate", 0) || undefined });
    const j = await matchBankTransaction(entityId, txId, v, user.id);
    return `${base(entityId)}/bank/${bankAccountId}?status=unmatched&ok=${encodeURIComponent(`Matched: ${j.number} posted`)}`;
  }, back);
}

export async function postBankTxAction(entityId: string, bankAccountId: string, txId: string, fd: FormData) {
  const back = `${base(entityId)}/bank/${bankAccountId}/tx/${txId}`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const v = z.object({ counterAccountId: z.string().min(1, "Pick a counter account"), description: z.string().max(300).optional(), fxRate: z.number().min(0).optional(), counterpartyName: z.string().max(120).optional() }).parse({ counterAccountId: str(fd, "counterAccountId"), description: str(fd, "description"), fxRate: num(fd, "fxRate", 0) || undefined, counterpartyName: str(fd, "counterpartyName") });
    const j = await postBankTransaction(entityId, txId, v, user.id);
    return `${base(entityId)}/bank/${bankAccountId}?status=unmatched&ok=${encodeURIComponent(`${j.number} posted`)}`;
  }, back);
}

export async function linkJournalAction(entityId: string, bankAccountId: string, txId: string, fd: FormData) {
  const back = `${base(entityId)}/bank/${bankAccountId}/tx/${txId}`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    const journalId = z.string().min(1, "Pick a journal entry").parse(str(fd, "journalId"));
    await linkBankTransaction(entityId, txId, journalId);
    return `${base(entityId)}/bank/${bankAccountId}?status=unmatched&ok=${encodeURIComponent("Bank line linked to the journal entry")}`;
  }, back);
}

export async function excludeTxAction(entityId: string, bankAccountId: string, txId: string, fd: FormData) {
  const back = str(fd, "back") ?? `${base(entityId)}/bank/${bankAccountId}`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    await setBankTransactionStatus(entityId, txId, bool(fd, "restore") ? "unmatched" : "excluded");
    return back;
  }, back);
}

export async function unmatchTxAction(entityId: string, bankAccountId: string, txId: string) {
  const back = `${base(entityId)}/bank/${bankAccountId}`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    await unmatchBankTransaction(entityId, txId);
    return `${back}?ok=${encodeURIComponent("Bank line unmatched; linked receipt/payment or quick journal reversed")}`;
  }, back);
}
