"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildAccounts } from "@/lib/coa";
import { ENTITY_TYPES, type Entity, type User } from "@/lib/types";
import { bool, num, str } from "@/lib/util";

const entitySchema = z.object({
  name: z.string().min(1).max(120),
  legalName: z.string().min(1).max(200),
  type: z.enum(ENTITY_TYPES),
  country: z.string().length(2),
  region: z.string().max(60).optional(),
  npwp: z.string().max(40).optional(),
  nib: z.string().max(40).optional(),
  aktaNumber: z.string().max(80).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(80).optional(),
  baseCurrency: z.string().length(3),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  regime: z.enum(["final_0_5", "art_31e", "normal_22", "hk_profits_tax", "none"]),
  pkp: z.boolean(),
  ppnRate: z.number().min(0).max(1),
  pph25Monthly: z.number().min(0).optional(),
  localTaxRate: z.number().min(0).max(1).optional(),
  lkpm: z.boolean(),
  payroll: z.boolean(),
  crmCompanyId: z.string().optional(),
  driveFolderUrl: z.string().url().optional().or(z.literal("")),
  isOwn: z.boolean(),
  status: z.enum(["active", "dormant", "closed"]),
});

function readEntity(fd: FormData) {
  return entitySchema.parse({
    name: str(fd, "name"), legalName: str(fd, "legalName") ?? str(fd, "name"), type: str(fd, "type"), country: (str(fd, "country") ?? "ID").toUpperCase(),
    region: str(fd, "region"), npwp: str(fd, "npwp"), nib: str(fd, "nib"), aktaNumber: str(fd, "aktaNumber"), address: str(fd, "address"), city: str(fd, "city"),
    baseCurrency: (str(fd, "baseCurrency") ?? "IDR").toUpperCase(), fiscalYearStartMonth: num(fd, "fiscalYearStartMonth", 1),
    regime: str(fd, "regime") ?? "normal_22", pkp: bool(fd, "pkp"), ppnRate: num(fd, "ppnRate", 11) / 100,
    pph25Monthly: num(fd, "pph25Monthly", 0) || undefined, localTaxRate: num(fd, "localTaxRate", 0) / 100 || undefined,
    lkpm: bool(fd, "lkpm"), payroll: bool(fd, "payroll"), crmCompanyId: str(fd, "crmCompanyId"), driveFolderUrl: str(fd, "driveFolderUrl") ?? "",
    isOwn: bool(fd, "isOwn"), status: str(fd, "status") ?? "active",
  });
}

export async function createEntity(fd: FormData) {
  await requirePermission("admin");
  const v = readEntity(fd);
  const now = new Date().toISOString();
  const entity: Entity = {
    id: db.newId(), name: v.name, legalName: v.legalName, type: v.type, country: v.country, isOwn: v.isOwn, npwp: v.npwp, nib: v.nib,
    aktaNumber: v.aktaNumber, address: v.address, city: v.city, region: v.region, baseCurrency: v.baseCurrency, fiscalYearStartMonth: v.fiscalYearStartMonth,
    tax: { regime: v.regime, pkp: v.pkp, ppnRate: v.ppnRate, pph25Monthly: v.pph25Monthly, localTaxRate: v.localTaxRate, lkpm: v.lkpm, payroll: v.payroll },
    crmCompanyId: v.crmCompanyId, driveFolderUrl: v.driveFolderUrl || undefined, status: v.status, createdAt: now,
  };
  await db.insert("entities", entity);
  await db.insertMany("accounts", buildAccounts(entity.id, () => db.newId(), { country: entity.country }));
  if (v.crmCompanyId) await db.update("companies", v.crmCompanyId, { entityId: entity.id, updatedAt: now });
  revalidatePath("/settings/entities");
  redirect(`/settings/entities/${entity.id}`);
}

export async function updateEntity(id: string, fd: FormData) {
  await requirePermission("admin");
  const current = await db.get("entities", id);
  if (!current) throw new Error("Entity not found");
  const v = readEntity(fd);
  const now = new Date().toISOString();
  await db.update("entities", id, {
    name: v.name, legalName: v.legalName, type: v.type, country: v.country, isOwn: v.isOwn, npwp: v.npwp, nib: v.nib, aktaNumber: v.aktaNumber,
    address: v.address, city: v.city, region: v.region, baseCurrency: v.baseCurrency, fiscalYearStartMonth: v.fiscalYearStartMonth,
    tax: { ...current.tax, regime: v.regime, pkp: v.pkp, ppnRate: v.ppnRate, pph25Monthly: v.pph25Monthly, localTaxRate: v.localTaxRate, lkpm: v.lkpm, payroll: v.payroll },
    crmCompanyId: v.crmCompanyId, driveFolderUrl: v.driveFolderUrl || undefined, status: v.status, updatedAt: now,
  });
  if (v.crmCompanyId && v.crmCompanyId !== current.crmCompanyId) await db.update("companies", v.crmCompanyId, { entityId: id, updatedAt: now });
  revalidatePath("/settings/entities");
  redirect(`/settings/entities/${id}`);
}

const userSchema = z.object({ email: z.string().email(), name: z.string().min(1).max(80), role: z.enum(["admin", "consultant", "accountant", "viewer"]), password: z.string().min(10).max(200) });

export async function createUser(fd: FormData) {
  await requirePermission("admin");
  const v = userSchema.parse({ email: str(fd, "email"), name: str(fd, "name"), role: str(fd, "role"), password: str(fd, "password") });
  const exists = await db.list("users", { where: (u) => u.email.toLowerCase() === v.email.toLowerCase() });
  if (exists.length) throw new Error("A user with this email already exists");
  const user: User = { id: db.newId(), email: v.email.toLowerCase(), name: v.name, role: v.role, passwordHash: hashPassword(v.password), active: true, createdAt: new Date().toISOString() };
  await db.insert("users", user);
  revalidatePath("/settings/users");
}

export async function setUserActive(id: string, active: boolean) {
  const me = await requirePermission("admin");
  if (me.id === id && !active) throw new Error("You cannot deactivate yourself");
  await db.update("users", id, { active });
  revalidatePath("/settings/users");
}

export async function setUserRole(id: string, fd: FormData) {
  const me = await requirePermission("admin");
  const role = z.enum(["admin", "consultant", "accountant", "viewer"]).parse(str(fd, "role"));
  if (me.id === id && role !== "admin") throw new Error("You cannot remove your own admin role");
  await db.update("users", id, { role });
  revalidatePath("/settings/users");
}

export async function resetPassword(id: string, fd: FormData) {
  await requirePermission("admin");
  const password = z.string().min(10).max(200).parse(str(fd, "password"));
  await db.update("users", id, { passwordHash: hashPassword(password) });
  revalidatePath("/settings/users");
}
