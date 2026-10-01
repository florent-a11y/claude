"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { nowISO, todayISO } from "@/lib/dates";
import { num, str } from "@/lib/util";
import { ENTITY_TYPES, type Company } from "@/lib/types";
import { logActivity, parseTags } from "../_lib/server";

const schema = z.object({
  name: z.string().min(1).max(160),
  type: z.enum([...ENTITY_TYPES, "prospect"]),
  country: z.string().length(2),
  region: z.string().max(60).optional(),
  npwp: z.string().max(40).optional(),
  nib: z.string().max(40).optional(),
  aktaNumber: z.string().max(80).optional(),
  address: z.string().max(400).optional(),
  primaryContactId: z.string().optional(),
  status: z.enum(["lead", "active", "inactive"]),
  ownerUserId: z.string().optional(),
  driveFolderUrl: z.url().optional(),
  qboCustomerId: z.string().max(40).optional(),
  hubspotId: z.string().max(40).optional(),
  tags: z.array(z.string().max(40)),
  notes: z.string().max(5000).optional(),
});

function read(fd: FormData) {
  return schema.parse({
    name: str(fd, "name"), type: str(fd, "type") ?? "prospect", country: (str(fd, "country") ?? "ID").toUpperCase(), region: str(fd, "region"),
    npwp: str(fd, "npwp"), nib: str(fd, "nib"), aktaNumber: str(fd, "aktaNumber"), address: str(fd, "address"), primaryContactId: str(fd, "primaryContactId"),
    status: str(fd, "status") ?? "lead", ownerUserId: str(fd, "ownerUserId"), driveFolderUrl: str(fd, "driveFolderUrl"), qboCustomerId: str(fd, "qboCustomerId"),
    hubspotId: str(fd, "hubspotId"), tags: parseTags(str(fd, "tags")), notes: str(fd, "notes"),
  });
}

async function linkPrimaryContact(companyId: string, contactId?: string) {
  if (!contactId) return;
  const c = await db.get("contacts", contactId);
  if (c && !c.companyIds.includes(companyId)) await db.update("contacts", contactId, { companyIds: [...c.companyIds, companyId], updatedAt: nowISO() });
}

export async function createCompany(fd: FormData) {
  const user = await requirePermission("crm:write");
  const v = read(fd);
  const company: Company = { id: db.newId(), ...v, ownerUserId: v.ownerUserId || user.id, subscriptions: [], createdAt: nowISO() };
  await db.insert("companies", company);
  await linkPrimaryContact(company.id, v.primaryContactId);
  await logActivity({ kind: "system", subject: "Company created", user, companyId: company.id, contactId: v.primaryContactId });
  revalidatePath("/clients/companies");
  redirect(`/clients/companies/${company.id}`);
}

export async function updateCompany(id: string, fd: FormData) {
  await requirePermission("crm:write");
  const current = await db.get("companies", id);
  if (!current) throw new Error("Company not found");
  const v = read(fd);
  await db.update("companies", id, { ...v, ownerUserId: v.ownerUserId || undefined, updatedAt: nowISO() });
  await linkPrimaryContact(id, v.primaryContactId);
  revalidatePath("/clients/companies");
  revalidatePath(`/clients/companies/${id}`);
  redirect(`/clients/companies/${id}`);
}

const subSchema = z.object({
  serviceId: z.string().optional(), label: z.string().min(1).max(160), amount: z.number().min(0), currency: z.string().length(3),
  cadence: z.enum(["monthly", "quarterly", "annual"]), startedAt: z.iso.date(),
});

export async function addSubscription(companyId: string, fd: FormData) {
  const user = await requirePermission("crm:write");
  const company = await db.get("companies", companyId);
  if (!company) throw new Error("Company not found");
  const v = subSchema.parse({
    serviceId: str(fd, "serviceId"), label: str(fd, "label"), amount: num(fd, "amount"), currency: (str(fd, "currency") ?? "IDR").toUpperCase(),
    cadence: str(fd, "cadence") ?? "monthly", startedAt: str(fd, "startedAt") ?? todayISO(),
  });
  const sub: Company["subscriptions"][number] = { serviceId: v.serviceId ?? "", label: v.label, amount: v.amount, currency: v.currency, cadence: v.cadence, startedAt: v.startedAt };
  await db.update("companies", companyId, { subscriptions: [...company.subscriptions, sub], updatedAt: nowISO() });
  await logActivity({ kind: "status", subject: `Subscription added: ${v.label}`, body: `${v.currency} ${v.amount} ${v.cadence} from ${v.startedAt}`, user, companyId });
  revalidatePath(`/clients/companies/${companyId}`);
}

export async function endSubscription(companyId: string, index: number, fd: FormData) {
  const user = await requirePermission("crm:write");
  const company = await db.get("companies", companyId);
  if (!company) throw new Error("Company not found");
  const subs = [...company.subscriptions];
  const sub = subs[index];
  if (!sub) throw new Error("Subscription not found");
  const endedAt = str(fd, "endedAt") ?? todayISO();
  subs[index] = { ...sub, endedAt };
  await db.update("companies", companyId, { subscriptions: subs, updatedAt: nowISO() });
  await logActivity({ kind: "status", subject: `Subscription ended: ${sub.label}`, body: `Ended ${endedAt}`, user, companyId });
  revalidatePath(`/clients/companies/${companyId}`);
}

export async function removeSubscription(companyId: string, index: number) {
  await requirePermission("crm:write");
  const company = await db.get("companies", companyId);
  if (!company) throw new Error("Company not found");
  await db.update("companies", companyId, { subscriptions: company.subscriptions.filter((_, i) => i !== index), updatedAt: nowISO() });
  revalidatePath(`/clients/companies/${companyId}`);
}
