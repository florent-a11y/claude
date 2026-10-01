"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { nowISO } from "@/lib/dates";
import { bool, str } from "@/lib/util";
import { VENDOR_CATEGORIES, type Vendor } from "@/lib/types";

const schema = z.object({
  name: z.string().min(1).max(120), category: z.enum(VENDOR_CATEGORIES), region: z.string().max(60).optional(), phone: z.string().max(40).optional(),
  email: z.email().optional(), npwp: z.string().max(40).optional(), bankAccount: z.string().max(120).optional(), notes: z.string().max(2000).optional(), active: z.boolean(),
});

function read(fd: FormData) {
  return schema.parse({
    name: str(fd, "name"), category: str(fd, "category") ?? "other", region: str(fd, "region"), phone: str(fd, "phone"), email: str(fd, "email")?.toLowerCase(),
    npwp: str(fd, "npwp"), bankAccount: str(fd, "bankAccount"), notes: str(fd, "notes"), active: bool(fd, "active"),
  });
}

export async function createVendor(fd: FormData) {
  await requirePermission("crm:write");
  const vendor: Vendor = { id: db.newId(), ...read(fd), createdAt: nowISO() };
  await db.insert("vendors", vendor);
  revalidatePath("/crm/vendors");
  redirect("/crm/vendors");
}

export async function updateVendor(id: string, fd: FormData) {
  await requirePermission("crm:write");
  if (!(await db.get("vendors", id))) throw new Error("Vendor not found");
  await db.update("vendors", id, read(fd));
  revalidatePath("/crm/vendors");
  redirect("/crm/vendors");
}
