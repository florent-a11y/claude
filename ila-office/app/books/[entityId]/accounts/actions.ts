"use server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createAccount, updateAccount, deleteAccount } from "@/lib/books";
import { ACCOUNT_SUBTYPES } from "@/lib/types";
import { bool, str } from "@/lib/util";
import { act, base } from "../shared";

const TAX_TAGS = [
  "ppn_output", "ppn_input", "pph21_payable", "pph23_payable", "pph26_payable", "pph4_2_payable", "pph25_prepaid", "pph23_prepaid", "pph22_prepaid", "cit_payable", "bpjs_payable",
  "local_tax_payable", "ar_trade", "ap_trade", "bank_default", "sales_default", "salary_expense", "bpjs_expense", "cit_expense", "retained_earnings", "current_earnings", "fx_gain", "fx_loss", "suspense",
] as const;

const createSchema = z.object({
  code: z.string().regex(/^\d-\d{4}$/, "Code must look like 1-1100"),
  name: z.string().min(1).max(120),
  nameId: z.string().max(120).optional(),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  subtype: z.enum(ACCOUNT_SUBTYPES),
  taxTag: z.enum(TAX_TAGS).optional(),
  deductible: z.boolean().optional(),
});

export async function createAccountAction(entityId: string, fd: FormData) {
  const to = `${base(entityId)}/accounts`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    const v = createSchema.parse({ code: str(fd, "code"), name: str(fd, "name"), nameId: str(fd, "nameId"), type: str(fd, "type"), subtype: str(fd, "subtype"), taxTag: str(fd, "taxTag"), deductible: str(fd, "type") === "expense" ? bool(fd, "deductible") : undefined });
    await createAccount(entityId, v);
    return `${to}?ok=${encodeURIComponent(`Account ${v.code} created`)}`;
  }, to);
}

const updateSchema = z.object({ code: z.string().regex(/^\d-\d{4}$/, "Code must look like 1-1100"), name: z.string().min(1).max(120), nameId: z.string().max(120).optional(), active: z.boolean(), deductible: z.boolean().optional() });

export async function updateAccountAction(entityId: string, accountId: string, fd: FormData) {
  const to = `${base(entityId)}/accounts/${accountId}`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    const v = updateSchema.parse({ code: str(fd, "code"), name: str(fd, "name"), nameId: str(fd, "nameId"), active: bool(fd, "active"), deductible: fd.has("deductibleShown") ? bool(fd, "deductible") : undefined });
    await updateAccount(entityId, accountId, v);
    return `${base(entityId)}/accounts?ok=${encodeURIComponent("Account saved")}`;
  }, to);
}

export async function deleteAccountAction(entityId: string, accountId: string) {
  await act(entityId, async () => {
    await requirePermission("books:write");
    await deleteAccount(entityId, accountId);
    return `${base(entityId)}/accounts?ok=${encodeURIComponent("Account deleted")}`;
  }, `${base(entityId)}/accounts/${accountId}`);
}
