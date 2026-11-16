"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { ENTITY_TYPES, ROLES, type User } from "@/lib/types";
import { bool, num, str } from "@/lib/util";
import { logActivity } from "@/app/clients/_lib/server";
import { createEntityFromInput, ensureCompanyForEntity, syncLegalDetails } from "./entities/create-entity";

const entitySchema = z.object({
  name: z.string().min(1).max(120),
  legalName: z.string().min(1).max(200),
  type: z.enum(ENTITY_TYPES),
  country: z.string().length(2),
  region: z.string().max(60).optional(),
  npwp: z.string().max(40).optional(),
  nib: z.string().max(40).optional(),
  nitku: z.string().max(30).optional(),
  signerName: z.string().max(120).optional(),
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
    region: str(fd, "region"), npwp: str(fd, "npwp"), nib: str(fd, "nib"), nitku: str(fd, "nitku"), signerName: str(fd, "signerName"), aktaNumber: str(fd, "aktaNumber"), address: str(fd, "address"), city: str(fd, "city"),
    baseCurrency: (str(fd, "baseCurrency") ?? "IDR").toUpperCase(), fiscalYearStartMonth: num(fd, "fiscalYearStartMonth", 1),
    regime: str(fd, "regime") ?? "normal_22", pkp: bool(fd, "pkp"), ppnRate: num(fd, "ppnRate", 11) / 100,
    pph25Monthly: num(fd, "pph25Monthly", 0) || undefined, localTaxRate: num(fd, "localTaxRate", 0) / 100 || undefined,
    lkpm: bool(fd, "lkpm"), payroll: bool(fd, "payroll"), crmCompanyId: str(fd, "crmCompanyId"), driveFolderUrl: str(fd, "driveFolderUrl") ?? "",
    isOwn: bool(fd, "isOwn"), status: str(fd, "status") ?? "active",
  });
}

/**
 * One creation, both records: books created here without picking a client company get their directory record
 * (Clients → Client companies, status active, tag "books"), or are linked to the client company of the same name or
 * NPWP that has no books yet. ILA's own entity has no client record. With a company picked, the two are linked.
 */
export async function createEntity(fd: FormData) {
  const user = await requirePermission("admin");
  const v = readEntity(fd);
  const entity = await createEntityFromInput({
    name: v.name, legalName: v.legalName, type: v.type, country: v.country, isOwn: v.isOwn, npwp: v.npwp, nib: v.nib, nitku: v.nitku,
    aktaNumber: v.aktaNumber, address: v.address, city: v.city, region: v.region, baseCurrency: v.baseCurrency, fiscalYearStartMonth: v.fiscalYearStartMonth,
    tax: { regime: v.regime, pkp: v.pkp, ppnRate: v.ppnRate, pph25Monthly: v.pph25Monthly, localTaxRate: v.localTaxRate, lkpm: v.lkpm, payroll: v.payroll, signerName: v.signerName },
    crmCompanyId: v.crmCompanyId, driveFolderUrl: v.driveFolderUrl || undefined, status: v.status,
  });
  let flash = "";
  if (!v.crmCompanyId && !v.isOwn) {
    try {
      const made = await ensureCompanyForEntity(entity);
      if (made) {
        await logActivity({ kind: "system", subject: made.created ? "Company created with its books" : "Books linked", body: `Entity ${entity.name} created in Settings → Entities`, user, companyId: made.company.id, entityId: entity.id });
        flash = `?ok=${encodeURIComponent(made.created ? `Books created. ${entity.name} was also added to Clients → Client companies.` : `Books created and linked to the existing client company ${made.company.name}.`)}`;
      }
    } catch (e) {
      flash = `?error=${encodeURIComponent(`The books are created, but not the client record: ${e instanceof Error ? e.message : String(e)}`)}`;
    }
  }
  revalidatePath("/settings/entities");
  revalidatePath("/clients/companies");
  if (v.crmCompanyId) revalidatePath(`/clients/companies/${v.crmCompanyId}`);
  redirect(`/settings/entities/${entity.id}${flash}`);
}

export async function updateEntity(id: string, fd: FormData) {
  await requirePermission("admin");
  const current = await db.get("entities", id);
  if (!current) throw new Error("Entity not found");
  const v = readEntity(fd);
  const now = new Date().toISOString();
  const entity = await db.update("entities", id, {
    name: v.name, legalName: v.legalName, type: v.type, country: v.country, isOwn: v.isOwn, npwp: v.npwp, nib: v.nib, nitku: v.nitku, aktaNumber: v.aktaNumber,
    address: v.address, city: v.city, region: v.region, baseCurrency: v.baseCurrency, fiscalYearStartMonth: v.fiscalYearStartMonth,
    tax: { ...current.tax, regime: v.regime, pkp: v.pkp, ppnRate: v.ppnRate, pph25Monthly: v.pph25Monthly, localTaxRate: v.localTaxRate, lkpm: v.lkpm, payroll: v.payroll, signerName: v.signerName },
    crmCompanyId: v.crmCompanyId, driveFolderUrl: v.driveFolderUrl || undefined, status: v.status, updatedAt: now,
  });
  if (v.crmCompanyId !== current.crmCompanyId) {
    // Relinked: the new company points here, and the previous one no longer shows these books as its own.
    if (v.crmCompanyId) await db.update("companies", v.crmCompanyId, { entityId: id, updatedAt: now });
    const previous = current.crmCompanyId ? await db.get("companies", current.crmCompanyId) : null;
    if (previous?.entityId === id) await db.update("companies", previous.id, { entityId: undefined, updatedAt: now });
  }
  // Legal details are entered once: what this save changed goes to the client company (see syncLegalDetails).
  if (entity) await syncLegalDetails({ entity, before: current });
  revalidatePath("/settings/entities");
  if (entity?.crmCompanyId) revalidatePath(`/clients/companies/${entity.crmCompanyId}`);
  redirect(`/settings/entities/${id}`);
}

const roleSchema = z.enum(ROLES as [User["role"], ...User["role"][]]);
const userSchema = z.object({ email: z.string().email(), name: z.string().min(1).max(80), role: roleSchema, password: z.string().min(10).max(200) });

/** Entity ids a client user may be allocated: existing, not ILA's own books. */
async function allocatableEntityIds(fd: FormData): Promise<string[]> {
  const wanted = fd.getAll("entityIds").filter((v): v is string => typeof v === "string" && v !== "");
  if (wanted.length === 0) return [];
  const entities = await db.list("entities", { where: (e) => !e.isOwn });
  const ok = new Set(entities.map((e) => e.id));
  return [...new Set(wanted.filter((id) => ok.has(id)))];
}

export async function createUser(fd: FormData) {
  await requirePermission("admin");
  const v = userSchema.parse({ email: str(fd, "email"), name: str(fd, "name"), role: str(fd, "role"), password: str(fd, "password") });
  const exists = await db.list("users", { where: (u) => u.email.toLowerCase() === v.email.toLowerCase() });
  if (exists.length) throw new Error("A user with this email already exists");
  const entityIds = v.role === "client" ? await allocatableEntityIds(fd) : undefined;
  const user: User = { id: db.newId(), email: v.email.toLowerCase(), name: v.name, role: v.role, entityIds, passwordHash: hashPassword(v.password), active: true, createdAt: new Date().toISOString() };
  await db.insert("users", user);
  revalidatePath("/settings/users");
}

/** Which client companies a client user may see. Team users are never restricted. */
export async function setUserEntities(id: string, fd: FormData) {
  await requirePermission("admin");
  const user = await db.get("users", id);
  if (!user) throw new Error("User not found");
  if (user.role !== "client") throw new Error("Only client users are restricted to specific companies");
  await db.update("users", id, { entityIds: await allocatableEntityIds(fd) });
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
  const role = roleSchema.parse(str(fd, "role"));
  if (me.id === id && role !== "admin") throw new Error("You cannot remove your own admin role");
  // Moving a user out of the client role lifts the company restriction; moving into it starts with no company until allocated.
  await db.update("users", id, { role, entityIds: role === "client" ? [] : undefined });
  revalidatePath("/settings/users");
}

export async function resetPassword(id: string, fd: FormData) {
  await requirePermission("admin");
  const password = z.string().min(10).max(200).parse(str(fd, "password"));
  await db.update("users", id, { passwordHash: hashPassword(password) });
  revalidatePath("/settings/users");
}
