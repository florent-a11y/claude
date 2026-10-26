"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { bool, num, str } from "@/lib/util";
import { SERVICE_CATEGORIES, type ServiceItem } from "@/lib/types";

const CADENCES = ["none", "monthly", "quarterly", "annual", "biennial"] as const;
const rowSchema = z.object({
  name: z.string().min(1).max(200), unit: z.string().min(1).max(40), priceIDR: z.number().min(0), priceUSD: z.number().min(0).optional(), priceEUR: z.number().min(0).optional(),
  cadence: z.enum(CADENCES), renewalMonths: z.number().int().min(0).max(120).optional(), active: z.boolean(),
  category: z.enum(SERVICE_CATEGORIES), taxTreatment: z.enum(["out_of_scope", "ppn"]), description: z.string().max(500).optional(), includesNote: z.string().max(300).optional(),
});

function readRow(fd: FormData, current?: ServiceItem) {
  return rowSchema.parse({
    name: str(fd, "name"), unit: str(fd, "unit") ?? "each", priceIDR: num(fd, "priceIDR"), priceUSD: num(fd, "priceUSD") || undefined, priceEUR: num(fd, "priceEUR") || undefined,
    cadence: str(fd, "cadence") ?? "none", renewalMonths: num(fd, "renewalMonths") || undefined, active: bool(fd, "active"),
    category: str(fd, "category") ?? current?.category ?? "visa", taxTreatment: str(fd, "taxTreatment") ?? current?.taxTreatment ?? "out_of_scope",
    description: str(fd, "description"), includesNote: str(fd, "includesNote"),
  });
}

export async function updateService(id: string, fd: FormData) {
  await requirePermission("crm:write");
  const current = await db.get("services", id);
  if (!current) throw new Error("Service not found");
  const v = readRow(fd, current);
  const patch: Partial<ServiceItem> = { name: v.name, unit: v.unit, priceIDR: v.priceIDR, priceUSD: v.priceUSD, priceEUR: v.priceEUR, cadence: v.cadence, renewalMonths: v.renewalMonths, active: v.active, category: v.category, taxTreatment: v.taxTreatment, description: v.description, includesNote: v.includesNote };
  await db.update("services", id, patch);
  revalidatePath("/clients/services");
  redirect(`/clients/services?category=${v.category}`);
}

const newSchema = rowSchema.extend({ code: z.string().min(2).max(30).regex(/^[A-Z0-9-]+$/, "Code: upper-case letters, digits and dashes") });

export async function createService(fd: FormData) {
  await requirePermission("crm:write");
  const v = newSchema.parse({ ...readRow(fd), code: str(fd, "code")?.toUpperCase() });
  const all = await db.list("services");
  if (all.some((s) => s.code === v.code)) throw new Error(`Code ${v.code} already exists`);
  const item: ServiceItem = { id: db.newId(), ...v, sortOrder: Math.max(0, ...all.map((s) => s.sortOrder ?? 0)) + 1 };
  await db.insert("services", item);
  revalidatePath("/clients/services");
  redirect(`/clients/services?category=${v.category}`);
}
