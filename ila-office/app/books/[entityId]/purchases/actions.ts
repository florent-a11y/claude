"use server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createBill, updateBill, postBill, recordDisbursement, voidBill, voidPayment, type BillInput } from "@/lib/books";
import { num, str } from "@/lib/util";
import { act, base } from "../shared";

const lineSchema = z.object({
  description: z.string().min(1, "Line description is required").max(300), amount: z.number().min(0), accountId: z.string().min(1, "Account is required"),
  taxCode: z.enum(["none", "ppn", "out_of_scope"]), withholding: z.enum(["none", "pph21", "pph23", "pph26", "pph4_2", "pph15", "pph22"]), withholdingRate: z.number().min(0).max(1).optional(),
});
const vendorSchema = z.object({ type: z.enum(["vendor", "contact", "company", "other"]), id: z.string().optional(), name: z.string().min(1, "Vendor name is required").max(200), npwp: z.string().max(40).optional(), country: z.string().max(2).optional() });
const schema = z.object({
  vendor: vendorSchema, vendorInvoiceNumber: z.string().max(80).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: z.string().length(3), fxRate: z.number().min(0), lines: z.array(lineSchema).min(1, "Add at least one line"),
  notes: z.string().max(2000).optional(), fakturNumber: z.string().max(40).optional(),
});

function readBill(fd: FormData): BillInput {
  let vendor: unknown, lines: unknown;
  try { vendor = JSON.parse(String(fd.get("vendor") ?? "{}")); lines = JSON.parse(String(fd.get("lines") ?? "[]")); } catch { throw new Error("Form data could not be read."); }
  const currency = (str(fd, "currency") ?? "IDR").toUpperCase();
  const v = schema.parse({ vendor, vendorInvoiceNumber: str(fd, "vendorInvoiceNumber"), date: str(fd, "date"), dueDate: str(fd, "dueDate"), currency, fxRate: currency === "IDR" ? 1 : num(fd, "fxRate", 0), lines, notes: str(fd, "notes"), fakturNumber: str(fd, "fakturNumber") });
  if (v.currency !== "IDR" && v.fxRate <= 0) throw new Error("An FX rate (IDR per 1 unit) is required for foreign-currency bills.");
  return v;
}

export async function createBillAction(entityId: string, fd: FormData) {
  await act(entityId, async () => {
    await requirePermission("books:write");
    const bill = await createBill(entityId, readBill(fd));
    return `${base(entityId)}/purchases/${bill.id}?ok=${encodeURIComponent(`${bill.number} saved as draft`)}`;
  }, `${base(entityId)}/purchases/new`);
}

export async function updateBillAction(entityId: string, billId: string, fd: FormData) {
  await act(entityId, async () => {
    await requirePermission("books:write");
    await updateBill(entityId, billId, readBill(fd));
    return `${base(entityId)}/purchases/${billId}?ok=${encodeURIComponent("Bill updated")}`;
  }, `${base(entityId)}/purchases/${billId}/edit`);
}

export async function postBillAction(entityId: string, billId: string) {
  const to = `${base(entityId)}/purchases/${billId}`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const bill = await postBill(entityId, billId, user.id);
    return `${to}?ok=${encodeURIComponent(`${bill.number} posted (Dr expense / Cr AP${bill.withholdingTotal ? " / Cr withholding payable" : ""})`)}`;
  }, to);
}

const paySchema = z.object({ bankAccountId: z.string().min(1, "Choose a bank account"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.number().positive("Amount must be positive"), fxRate: z.number().min(0).optional(), reference: z.string().max(120).optional() });

export async function disbursementAction(entityId: string, billId: string, fd: FormData) {
  const to = `${base(entityId)}/purchases/${billId}`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const v = paySchema.parse({ bankAccountId: str(fd, "bankAccountId"), date: str(fd, "date"), amount: num(fd, "amount", 0), fxRate: num(fd, "fxRate", 0) || undefined, reference: str(fd, "reference") });
    const r = await recordDisbursement(entityId, { billId, ...v }, user.id);
    return `${to}?ok=${encodeURIComponent(`Payment recorded (${r.journal.number}); bill ${r.bill.status}`)}`;
  }, to);
}

export async function voidBillAction(entityId: string, billId: string) {
  const to = `${base(entityId)}/purchases/${billId}`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    await voidBill(entityId, billId);
    return `${to}?ok=${encodeURIComponent("Bill voided")}`;
  }, to);
}

export async function voidBillPaymentAction(entityId: string, paymentId: string, backTo: string) {
  await act(entityId, async () => {
    await requirePermission("books:write");
    await voidPayment(entityId, paymentId);
    return `${backTo}?ok=${encodeURIComponent("Payment reversed")}`;
  }, backTo);
}
