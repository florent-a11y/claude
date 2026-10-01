"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayISO } from "@/lib/dates";
import { OBLIGATION_STATUSES, type VatTransaction, type WithholdingSlip } from "@/lib/types";
import { bool, num, str } from "@/lib/util";
import { createSlip, ensureObligations, ensureObligationsForAll } from "@/lib/tax/services";
import { withholdingObject } from "@/lib/tax/withholding";

const yearSchema = z.number().int().min(2020).max(2100);

export async function generateAllObligations(fd: FormData) {
  await requirePermission("tax:write");
  const year = yearSchema.parse(num(fd, "year", new Date().getFullYear()));
  await ensureObligationsForAll(year);
  revalidatePath("/tax");
  redirect(`/tax?month=${str(fd, "month") ?? `${year}-01`}`);
}

export async function generateEntityObligations(entityId: string, fd: FormData) {
  await requirePermission("tax:write");
  const entity = await db.get("entities", entityId);
  if (!entity) throw new Error("Entity not found");
  const year = yearSchema.parse(num(fd, "year", new Date().getFullYear()));
  await ensureObligations(entity, year);
  revalidatePath(`/tax/${entityId}`);
  redirect(`/tax/${entityId}?year=${year}`);
}

const obligationSchema = z.object({
  status: z.enum(OBLIGATION_STATUSES),
  amount: z.number().min(0).optional(),
  ntpn: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
  assigneeUserId: z.string().optional(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reportedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function updateObligation(id: string, fd: FormData) {
  await requirePermission("tax:write");
  const current = await db.get("tax_obligations", id);
  if (!current) throw new Error("Obligation not found");
  const v = obligationSchema.parse({
    status: str(fd, "status"), amount: str(fd, "amount") === undefined ? undefined : num(fd, "amount"), ntpn: str(fd, "ntpn"), notes: str(fd, "notes"),
    assigneeUserId: str(fd, "assigneeUserId"), paidAt: str(fd, "paidAt"), reportedAt: str(fd, "reportedAt"),
  });
  const today = todayISO();
  await db.update("tax_obligations", id, {
    status: v.status, amount: v.amount, ntpn: v.ntpn, notes: v.notes, assigneeUserId: v.assigneeUserId,
    paidAt: v.paidAt ?? (v.status === "paid" || v.status === "reported" ? current.paidAt ?? today : current.paidAt),
    reportedAt: v.reportedAt ?? (v.status === "reported" ? current.reportedAt ?? today : current.reportedAt),
    updatedAt: new Date().toISOString(),
  });
  revalidatePath(`/tax/${current.entityId}`);
  revalidatePath("/tax");
  const back = str(fd, "back");
  redirect(back && back.startsWith("/") ? back : `/tax/${current.entityId}?year=${current.period.slice(0, 4)}`);
}

// ---------- Withholding slips ----------

const slipSchema = z.object({
  type: z.enum(["pph21", "pph23", "pph26", "pph4_2", "pph15", "pph22"]),
  objectCode: z.string().min(3).max(20),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(200),
  npwp: z.string().max(40).optional(),
  nik: z.string().max(40).optional(),
  address: z.string().max(300).optional(),
  country: z.string().max(2).optional(),
  counterpartyId: z.string().optional(),
  baseAmount: z.number().min(0),
  hasNpwp: z.boolean(),
  treatyRate: z.number().min(0).max(1).optional(),
  rateOverride: z.number().min(0).max(1).optional(),
  description: z.string().max(500).optional(),
  billId: z.string().optional(),
});

export async function createWithholdingSlip(entityId: string, fd: FormData) {
  await requirePermission("tax:write");
  const treaty = bool(fd, "treatyApplied");
  const override = str(fd, "rateOverride");
  const objectCode = str(fd, "objectCode") ?? "";
  const v = slipSchema.parse({
    type: withholdingObject(objectCode)?.type ?? str(fd, "type"), objectCode, period: str(fd, "period"), date: str(fd, "date"), name: str(fd, "name"), npwp: str(fd, "npwp"), nik: str(fd, "nik"),
    address: str(fd, "address"), country: (str(fd, "country") ?? "ID").toUpperCase().slice(0, 2), counterpartyId: str(fd, "counterpartyId"), baseAmount: num(fd, "baseAmount"),
    hasNpwp: Boolean(str(fd, "npwp")), treatyRate: treaty ? num(fd, "treatyRate") / 100 : undefined, rateOverride: override ? num(fd, "rateOverride") / 100 : undefined,
    description: str(fd, "description"), billId: str(fd, "billId"),
  });
  if (!withholdingObject(v.objectCode) && v.rateOverride === undefined) throw new Error("Unknown object code: enter a rate override for non-listed objects.");
  const slip = await createSlip({
    entityId, type: v.type, objectCode: v.objectCode, baseAmount: v.baseAmount, hasNpwp: v.hasNpwp, treatyRate: v.treatyRate, rateOverride: v.rateOverride, period: v.period, date: v.date,
    counterparty: { name: v.name, npwp: v.npwp, nik: v.nik, address: v.address, country: v.country, id: v.counterpartyId }, description: v.description, billId: v.billId,
  });
  revalidatePath(`/tax/${entityId}/withholding`);
  redirect(`/tax/${entityId}/withholding/${slip.id}`);
}

export async function setSlipStatus(slipId: string, fd: FormData) {
  await requirePermission("tax:write");
  const slip = await db.get("withholding_slips", slipId);
  if (!slip) throw new Error("Slip not found");
  const status = z.enum(["draft", "issued", "reported"]).parse(str(fd, "status"));
  const patch: Partial<WithholdingSlip> = { status };
  const ntpn = str(fd, "ntpn");
  if (ntpn) patch.ntpn = ntpn;
  await db.update("withholding_slips", slipId, patch);
  revalidatePath(`/tax/${slip.entityId}/withholding`);
}

export async function markPeriodSlips(entityId: string, fd: FormData) {
  await requirePermission("tax:write");
  const period = z.string().regex(/^\d{4}-\d{2}$/).parse(str(fd, "period"));
  const status = z.enum(["issued", "reported"]).parse(str(fd, "status"));
  const slips = await db.list("withholding_slips", { where: { entityId, period } });
  for (const s of slips) {
    if (status === "issued" && s.status === "draft") await db.update("withholding_slips", s.id, { status });
    if (status === "reported" && s.status !== "reported") await db.update("withholding_slips", s.id, { status, ntpn: str(fd, "ntpn") ?? s.ntpn });
  }
  revalidatePath(`/tax/${entityId}/withholding`);
  redirect(`/tax/${entityId}/withholding?period=${period}`);
}

export async function deleteSlip(slipId: string) {
  await requirePermission("tax:write");
  const slip = await db.get("withholding_slips", slipId);
  if (!slip) return;
  if (slip.status !== "draft") throw new Error("Only draft slips can be deleted");
  await db.remove("withholding_slips", slipId);
  revalidatePath(`/tax/${slip.entityId}/withholding`);
  redirect(`/tax/${slip.entityId}/withholding?period=${slip.period}`);
}

// ---------- Manual PPN rows ----------

const vatSchema = z.object({
  direction: z.enum(["output", "input"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().min(1).max(200), npwp: z.string().max(40).optional(),
  fakturNumber: z.string().max(40).optional(), dpp: z.number().min(0), ppn: z.number().min(0), creditable: z.boolean(), notes: z.string().max(500).optional(),
});

export async function addVatTransaction(entityId: string, fd: FormData) {
  await requirePermission("tax:write");
  const v = vatSchema.parse({
    direction: str(fd, "direction"), date: str(fd, "date"), name: str(fd, "name"), npwp: str(fd, "npwp"), fakturNumber: str(fd, "fakturNumber"),
    dpp: num(fd, "dpp"), ppn: num(fd, "ppn"), creditable: bool(fd, "creditable"), notes: str(fd, "notes"),
  });
  const row: VatTransaction = {
    id: db.newId(), entityId, direction: v.direction, date: v.date, period: v.date.slice(0, 7), counterparty: { name: v.name, npwp: v.npwp }, fakturNumber: v.fakturNumber,
    dpp: v.dpp, ppn: v.ppn, rate: v.dpp > 0 ? v.ppn / v.dpp : 0, creditable: v.direction === "output" ? true : v.creditable && Boolean(v.fakturNumber), notes: v.notes, createdAt: new Date().toISOString(),
  };
  await db.insert("vat_transactions", row);
  revalidatePath(`/tax/${entityId}/ppn`);
  redirect(`/tax/${entityId}/ppn?period=${row.period}`);
}

export async function deleteVatTransaction(id: string) {
  await requirePermission("tax:write");
  const row = await db.get("vat_transactions", id);
  if (!row) return;
  await db.remove("vat_transactions", id);
  revalidatePath(`/tax/${row.entityId}/ppn`);
  redirect(`/tax/${row.entityId}/ppn?period=${row.period}`);
}
