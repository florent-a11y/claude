"use server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createInvoice, updateInvoice, postInvoice, recordReceipt, voidInvoice, voidPayment, type InvoiceInput } from "@/lib/books";
import { num, str } from "@/lib/util";
import { act, base } from "../shared";

const lineSchema = z.object({
  description: z.string().min(1, "Line description is required").max(300), qty: z.number().positive(), unitPrice: z.number().min(0), accountId: z.string().min(1, "Revenue account is required"),
  taxCode: z.enum(["none", "ppn", "out_of_scope"]), serviceId: z.string().optional(), projectId: z.string().optional(),
});
const customerSchema = z.object({ type: z.enum(["company", "contact", "other"]), id: z.string().optional(), name: z.string().min(1, "Customer name is required").max(200), email: z.string().max(200).optional(), npwp: z.string().max(40).optional(), address: z.string().max(400).optional() });
const schema = z.object({
  customer: customerSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: z.string().length(3),
  fxRate: z.number().min(0),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
  discount: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
  paymentInstructions: z.string().max(2000).optional(),
  projectId: z.string().optional(),
  fakturNumber: z.string().max(40).optional(),
});

function readInvoice(fd: FormData): InvoiceInput {
  let customer: unknown, lines: unknown;
  try { customer = JSON.parse(String(fd.get("customer") ?? "{}")); lines = JSON.parse(String(fd.get("lines") ?? "[]")); } catch { throw new Error("Form data could not be read."); }
  const currency = (str(fd, "currency") ?? "IDR").toUpperCase();
  const v = schema.parse({
    customer, date: str(fd, "date"), dueDate: str(fd, "dueDate"), currency, fxRate: currency === "IDR" ? 1 : num(fd, "fxRate", 0), lines, discount: num(fd, "discount", 0),
    notes: str(fd, "notes"), paymentInstructions: str(fd, "paymentInstructions"), projectId: str(fd, "projectId"), fakturNumber: str(fd, "fakturNumber"),
  });
  if (v.currency !== "IDR" && v.fxRate <= 0) throw new Error("An FX rate (IDR per 1 unit) is required for foreign-currency invoices.");
  return v;
}

export async function createInvoiceAction(entityId: string, fd: FormData) {
  await act(entityId, async () => {
    await requirePermission("books:write");
    const inv = await createInvoice(entityId, readInvoice(fd));
    return `${base(entityId)}/sales/${inv.id}?ok=${encodeURIComponent(`${inv.number} saved as draft`)}`;
  }, `${base(entityId)}/sales/new`);
}

export async function updateInvoiceAction(entityId: string, invoiceId: string, fd: FormData) {
  await act(entityId, async () => {
    await requirePermission("books:write");
    await updateInvoice(entityId, invoiceId, readInvoice(fd));
    return `${base(entityId)}/sales/${invoiceId}?ok=${encodeURIComponent("Invoice updated")}`;
  }, `${base(entityId)}/sales/${invoiceId}/edit`);
}

export async function postInvoiceAction(entityId: string, invoiceId: string) {
  const to = `${base(entityId)}/sales/${invoiceId}`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const inv = await postInvoice(entityId, invoiceId, user.id);
    return `${to}?ok=${encodeURIComponent(`${inv.number} posted (Dr AR / Cr revenue)`)}`;
  }, to);
}

const receiptSchema = z.object({ bankAccountId: z.string().min(1, "Choose a bank account"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.number().positive("Amount must be positive"), fxRate: z.number().min(0).optional(), reference: z.string().max(120).optional(), notes: z.string().max(500).optional() });

export async function receiptAction(entityId: string, invoiceId: string, fd: FormData) {
  const to = `${base(entityId)}/sales/${invoiceId}`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const v = receiptSchema.parse({ bankAccountId: str(fd, "bankAccountId"), date: str(fd, "date"), amount: num(fd, "amount", 0), fxRate: num(fd, "fxRate", 0) || undefined, reference: str(fd, "reference"), notes: str(fd, "notes") });
    const r = await recordReceipt(entityId, { invoiceId, ...v }, user.id);
    return `${to}?ok=${encodeURIComponent(`Receipt recorded (${r.journal.number}); invoice ${r.invoice.status}`)}`;
  }, to);
}

export async function voidInvoiceAction(entityId: string, invoiceId: string) {
  const to = `${base(entityId)}/sales/${invoiceId}`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    await voidInvoice(entityId, invoiceId);
    return `${to}?ok=${encodeURIComponent("Invoice voided")}`;
  }, to);
}

export async function voidPaymentAction(entityId: string, paymentId: string, backTo: string) {
  await act(entityId, async () => {
    await requirePermission("books:write");
    await voidPayment(entityId, paymentId);
    return `${backTo}?ok=${encodeURIComponent("Payment reversed")}`;
  }, backTo);
}
