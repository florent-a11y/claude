"use server";
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
});

function readRow(fd: FormData) {
  return rowSchema.parse({
    name: str(fd, "name"), unit: str(fd, "unit") ?? "each", priceIDR: num(fd, "priceIDR"), priceUSD: num(fd, "priceUSD") || undefined, priceEUR: num(fd, "priceEUR") || undefined,
    cadence: str(fd, "cadence") ?? "none", renewalMonths: num(fd, "renewalMonths") || undefined, active: bool(fd, "active"),
  });
}

export async function updateService(id: string, fd: FormData) {
  await requirePermission("crm:write");
  const current = await db.get("services", id);
  if (!current) throw new Error("Service not found");
  const v = readRow(fd);
  await db.update("services", id, { ...v, description: str(fd, "description") ?? current.description, includesNote: str(fd, "includesNote") ?? current.includesNote });
  revalidatePath("/clients/services");
}

const newSchema = rowSchema.extend({
  code: z.string().min(2).max(30).regex(/^[A-Z0-9-]+$/, "Code: upper-case letters, digits and dashes"), category: z.enum(SERVICE_CATEGORIES),
  taxTreatment: z.enum(["out_of_scope", "ppn"]), description: z.string().max(500).optional(), includesNote: z.string().max(300).optional(),
});

export async function createService(fd: FormData) {
  await requirePermission("crm:write");
  const v = newSchema.parse({
    ...readRow(fd), code: str(fd, "code")?.toUpperCase(), category: str(fd, "category"), taxTreatment: str(fd, "taxTreatment") ?? "out_of_scope",
    description: str(fd, "description"), includesNote: str(fd, "includesNote"),
  });
  const all = await db.list("services");
  if (all.some((s) => s.code === v.code)) throw new Error(`Code ${v.code} already exists`);
  const item: ServiceItem = { id: db.newId(), ...v, active: true, sortOrder: Math.max(0, ...all.map((s) => s.sortOrder ?? 0)) + 1 };
  await db.insert("services", item);
  revalidatePath("/clients/services");
}
