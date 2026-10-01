"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { nowISO } from "@/lib/dates";
import { str } from "@/lib/util";
import type { Contact } from "@/lib/types";
import { logActivity, parseTags } from "../_lib/server";

const schema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional(),
  email: z.email().optional(),
  phone: z.string().max(40).optional(),
  whatsapp: z.string().max(40).optional(),
  nationality: z.string().max(2).optional(),
  language: z.string().max(10).optional(),
  passportNumber: z.string().max(40).optional(),
  passportExpiry: z.iso.date().optional(),
  dateOfBirth: z.iso.date().optional(),
  source: z.string().max(80).optional(),
  ownerUserId: z.string().optional(),
  companyIds: z.array(z.string()),
  tags: z.array(z.string().max(40)),
  notes: z.string().max(5000).optional(),
  driveFolderUrl: z.url().optional(),
  hubspotId: z.string().max(40).optional(),
  qboCustomerId: z.string().max(40).optional(),
});

function read(fd: FormData) {
  return schema.parse({
    firstName: str(fd, "firstName"), lastName: str(fd, "lastName"), email: str(fd, "email")?.toLowerCase(), phone: str(fd, "phone"), whatsapp: str(fd, "whatsapp"),
    nationality: str(fd, "nationality")?.toUpperCase(), language: str(fd, "language")?.toLowerCase(), passportNumber: str(fd, "passportNumber"),
    passportExpiry: str(fd, "passportExpiry"), dateOfBirth: str(fd, "dateOfBirth"), source: str(fd, "source"), ownerUserId: str(fd, "ownerUserId"),
    companyIds: fd.getAll("companyIds").filter((v): v is string => typeof v === "string" && v !== ""), tags: parseTags(str(fd, "tags")), notes: str(fd, "notes"),
    driveFolderUrl: str(fd, "driveFolderUrl"), hubspotId: str(fd, "hubspotId"), qboCustomerId: str(fd, "qboCustomerId"),
  });
}

export async function createContact(fd: FormData) {
  const user = await requirePermission("crm:write");
  const v = read(fd);
  const contact: Contact = { id: db.newId(), ...v, lastName: v.lastName ?? "", ownerUserId: v.ownerUserId || user.id, createdAt: nowISO() };
  await db.insert("contacts", contact);
  await logActivity({ kind: "system", subject: "Contact created", user, contactId: contact.id });
  revalidatePath("/clients/contacts");
  redirect(`/clients/contacts/${contact.id}`);
}

export async function updateContact(id: string, fd: FormData) {
  const user = await requirePermission("crm:write");
  const current = await db.get("contacts", id);
  if (!current) throw new Error("Contact not found");
  const v = read(fd);
  await db.update("contacts", id, { ...v, lastName: v.lastName ?? "", ownerUserId: v.ownerUserId || undefined, updatedAt: nowISO() });
  void user;
  revalidatePath("/clients/contacts");
  revalidatePath(`/clients/contacts/${id}`);
  redirect(`/clients/contacts/${id}`);
}

export async function deleteContact(id: string) {
  await requirePermission("crm:write");
  const invoices = await db.list("invoices", { where: (i) => i.customer.type === "contact" && i.customer.id === id, limit: 1 });
  if (invoices.length > 0) throw new Error("This contact has invoices; keep it for the books instead of deleting.");
  await db.remove("contacts", id);
  revalidatePath("/clients/contacts");
  redirect("/clients/contacts");
}
