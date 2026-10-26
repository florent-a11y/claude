"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PTKP_STATUSES, type Employee } from "@/lib/types";
import { bool, num, str } from "@/lib/util";
import type { LineOverride } from "@/lib/payroll";
import { approveRun, createRun, deleteDraftRun, markRunPaid, recalculateRun } from "@/lib/payroll-services";

/** Reads per-employee overrides from form fields named ot_<id>, bonus_<id>, notes_<id>. */
async function overridesFrom(fd: FormData): Promise<Record<string, LineOverride>> {
  const out: Record<string, LineOverride> = {};
  for (const [k, v] of fd.entries()) {
    const m = k.match(/^(ot|bonus|notes)_(.+)$/);
    if (!m || typeof v !== "string") continue;
    const o = (out[m[2]] ??= {});
    if (m[1] === "ot") o.overtime = Number(v) || 0;
    else if (m[1] === "bonus") o.bonus = Number(v) || 0;
    else if (v.trim()) o.notes = v.trim().slice(0, 300);
  }
  return out;
}

function overridesQuery(o: Record<string, LineOverride>): string {
  const p = new URLSearchParams();
  for (const [id, v] of Object.entries(o)) {
    if (v.overtime) p.set(`ot_${id}`, String(v.overtime));
    if (v.bonus) p.set(`bonus_${id}`, String(v.bonus));
    if (v.notes) p.set(`notes_${id}`, v.notes);
  }
  return p.toString();
}

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function previewRunAction(entityId: string, fd: FormData) {
  await requirePermission("tax:write");
  const period = periodSchema.parse(str(fd, "period"));
  const payDate = dateSchema.parse(str(fd, "payDate"));
  const q = overridesQuery(await overridesFrom(fd));
  redirect(`/payroll/${entityId}/runs/new?period=${period}&payDate=${payDate}${q ? `&${q}` : ""}`);
}

export async function createRunAction(entityId: string, fd: FormData) {
  await requirePermission("tax:write");
  const period = periodSchema.parse(str(fd, "period"));
  const payDate = dateSchema.parse(str(fd, "payDate"));
  const run = await createRun(entityId, period, payDate, await overridesFrom(fd));
  revalidatePath(`/payroll/${entityId}`);
  redirect(`/payroll/${entityId}/runs/${run.id}`);
}

export async function recalculateRunAction(runId: string, fd: FormData) {
  await requirePermission("tax:write");
  const payDate = str(fd, "payDate") ? dateSchema.parse(str(fd, "payDate")) : undefined;
  const run = await recalculateRun(runId, await overridesFrom(fd), payDate);
  revalidatePath(`/payroll/${run.entityId}/runs/${runId}`);
  redirect(`/payroll/${run.entityId}/runs/${runId}?saved=1`);
}

export async function approveRunAction(runId: string) {
  const user = await requirePermission("tax:write");
  const run = await approveRun(runId, user.id);
  revalidatePath(`/payroll/${run.entityId}`);
  revalidatePath(`/tax/${run.entityId}`);
  redirect(`/payroll/${run.entityId}/runs/${runId}?approved=1`);
}

export async function markPaidAction(runId: string) {
  await requirePermission("tax:write");
  const run = await markRunPaid(runId);
  revalidatePath(`/payroll/${run.entityId}`);
  redirect(`/payroll/${run.entityId}/runs/${runId}?paid=1`);
}

export async function deleteRunAction(runId: string) {
  await requirePermission("tax:write");
  const run = await db.get("payroll_runs", runId);
  if (!run) return;
  await deleteDraftRun(runId);
  revalidatePath(`/payroll/${run.entityId}`);
  redirect(`/payroll/${run.entityId}`);
}

// ---------- Employees ----------

const employeeSchema = z.object({
  name: z.string().min(1).max(120),
  nik: z.string().max(30).optional(),
  npwp: z.string().max(40).optional(),
  email: z.string().email().optional().or(z.literal("")),
  position: z.string().max(80).optional(),
  ptkpStatus: z.enum(PTKP_STATUSES),
  isForeign: z.boolean(),
  passportNumber: z.string().max(30).optional(),
  bpjsKesehatanNumber: z.string().max(30).optional(),
  bpjsKetenagakerjaanNumber: z.string().max(30).optional(),
  bpjs: z.object({ kesehatan: z.boolean(), jht: z.boolean(), jp: z.boolean(), jkk: z.boolean(), jkm: z.boolean(), jkkRiskClass: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]) }),
  basicSalary: z.number().min(0),
  allowances: z.array(z.object({ name: z.string().min(1).max(60), amount: z.number().min(0), taxable: z.boolean() })),
  deductions: z.array(z.object({ name: z.string().min(1).max(60), amount: z.number().min(0) })),
  bankName: z.string().max(60).optional(),
  bankAccountNumber: z.string().max(40).optional(),
  joinDate: dateSchema,
  endDate: dateSchema.optional(),
  contractType: z.enum(["pkwtt", "pkwt", "freelance"]),
  active: z.boolean(),
});

function readEmployee(fd: FormData) {
  const allowances = [1, 2, 3, 4].map((i) => ({ name: str(fd, `allowance_name_${i}`), amount: num(fd, `allowance_amount_${i}`), taxable: bool(fd, `allowance_taxable_${i}`) })).filter((a) => a.name && a.amount > 0);
  const deductions = [1, 2, 3].map((i) => ({ name: str(fd, `deduction_name_${i}`), amount: num(fd, `deduction_amount_${i}`) })).filter((d) => d.name && d.amount > 0);
  const risk = Math.min(5, Math.max(1, num(fd, "jkkRiskClass", 1))) as 1 | 2 | 3 | 4 | 5;
  return employeeSchema.parse({
    name: str(fd, "name"), nik: str(fd, "nik"), npwp: str(fd, "npwp"), email: str(fd, "email") ?? "", position: str(fd, "position"), ptkpStatus: str(fd, "ptkpStatus"), isForeign: bool(fd, "isForeign"),
    passportNumber: str(fd, "passportNumber"), bpjsKesehatanNumber: str(fd, "bpjsKesehatanNumber"), bpjsKetenagakerjaanNumber: str(fd, "bpjsKetenagakerjaanNumber"),
    bpjs: { kesehatan: bool(fd, "bpjs_kesehatan"), jht: bool(fd, "bpjs_jht"), jp: bool(fd, "bpjs_jp"), jkk: bool(fd, "bpjs_jkk"), jkm: bool(fd, "bpjs_jkm"), jkkRiskClass: risk },
    basicSalary: num(fd, "basicSalary"), allowances, deductions, bankName: str(fd, "bankName"), bankAccountNumber: str(fd, "bankAccountNumber"),
    joinDate: str(fd, "joinDate"), endDate: str(fd, "endDate"), contractType: str(fd, "contractType") ?? "pkwtt", active: bool(fd, "active"),
  });
}

export async function createEmployee(entityId: string, fd: FormData) {
  await requirePermission("tax:write");
  const v = readEmployee(fd);
  const employee: Employee = { id: db.newId(), entityId, ...v, email: v.email || undefined, createdAt: new Date().toISOString() };
  await db.insert("employees", employee);
  revalidatePath(`/payroll/${entityId}/employees`);
  redirect(`/payroll/${entityId}/employees`);
}

export async function updateEmployee(id: string, fd: FormData) {
  await requirePermission("tax:write");
  const current = await db.get("employees", id);
  if (!current) throw new Error("Employee not found");
  const v = readEmployee(fd);
  await db.update("employees", id, { ...v, email: v.email || undefined });
  revalidatePath(`/payroll/${current.entityId}/employees`);
  redirect(`/payroll/${current.entityId}/employees`);
}
