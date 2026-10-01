"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { nowISO } from "@/lib/dates";
import { num, str } from "@/lib/util";
import { RENEWAL_REMINDER_DAYS, projectsNeedingRenewal, renewalFromProject } from "@/lib/crm";
import { RENEWAL_KINDS, type Renewal } from "@/lib/types";
import { logActivity } from "../_lib/server";

const schema = z.object({
  kind: z.enum(RENEWAL_KINDS), label: z.string().min(1).max(200), companyId: z.string().optional(), contactId: z.string().optional(), projectId: z.string().optional(),
  serviceId: z.string().optional(), expiresAt: z.iso.date(), reminderDays: z.number().int().min(0).max(365), ownerUserId: z.string().optional(), notes: z.string().max(2000).optional(),
});

export async function createRenewal(fd: FormData) {
  const user = await requirePermission("crm:write");
  const kind = str(fd, "kind") ?? "other";
  const v = schema.parse({
    kind, label: str(fd, "label"), companyId: str(fd, "companyId"), contactId: str(fd, "contactId"), projectId: str(fd, "projectId"), serviceId: str(fd, "serviceId"),
    expiresAt: str(fd, "expiresAt"), reminderDays: num(fd, "reminderDays", RENEWAL_REMINDER_DAYS[kind as Renewal["kind"]] ?? 60), ownerUserId: str(fd, "ownerUserId"), notes: str(fd, "notes"),
  });
  const r: Renewal = { id: db.newId(), ...v, ownerUserId: v.ownerUserId || user.id, status: "upcoming", createdAt: nowISO() };
  await db.insert("renewals", r);
  await logActivity({ kind: "system", subject: `Renewal added: ${r.label}`, body: `Expires ${r.expiresAt}`, user, companyId: r.companyId, contactId: r.contactId, projectId: r.projectId });
  revalidatePath("/crm/renewals");
  redirect("/crm/renewals");
}

const STATUSES = ["upcoming", "reminded", "quoted", "renewed", "lapsed", "cancelled"] as const;

export async function setRenewalStatus(id: string, status: (typeof STATUSES)[number]) {
  const user = await requirePermission("crm:write");
  z.enum(STATUSES).parse(status);
  const r = await db.get("renewals", id);
  if (!r) throw new Error("Renewal not found");
  await db.update("renewals", id, { status, updatedAt: nowISO() });
  await logActivity({ kind: "status", subject: `Renewal ${r.status} → ${status}: ${r.label}`, user, companyId: r.companyId, contactId: r.contactId, projectId: r.projectId });
  revalidatePath("/crm/renewals");
}

export async function updateRenewalExpiry(id: string, fd: FormData) {
  await requirePermission("crm:write");
  const expiresAt = z.iso.date().parse(str(fd, "expiresAt"));
  await db.update("renewals", id, { expiresAt, updatedAt: nowISO() });
  revalidatePath("/crm/renewals");
}

/** Creates a renewal for every done project with an expiry date that has none yet. */
export async function generateRenewalsFromProjects() {
  const user = await requirePermission("crm:write");
  const [projects, renewals, services] = await Promise.all([db.list("projects", { where: { status: "done" } }), db.list("renewals"), db.list("services")]);
  const svc = new Map(services.map((s) => [s.id, s]));
  const now = nowISO();
  const rows: Renewal[] = [];
  for (const p of projectsNeedingRenewal(projects, renewals)) {
    const r = renewalFromProject(p, { id: db.newId(), now, serviceCode: p.serviceId ? svc.get(p.serviceId)?.code : undefined });
    if (r) rows.push(r);
  }
  await db.insertMany("renewals", rows);
  if (rows.length) await logActivity({ kind: "system", subject: `${rows.length} renewal(s) generated from completed projects`, user });
  revalidatePath("/crm/renewals");
  redirect(`/crm/renewals?generated=${rows.length}`);
}
