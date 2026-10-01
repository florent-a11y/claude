"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { nowISO, todayISO } from "@/lib/dates";
import { num, str } from "@/lib/util";
import { checklistTemplate, inferExpiry, renewalFromProject } from "@/lib/crm";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, RENEWAL_KIND_LABELS, SERVICE_CATEGORIES, type ChecklistItem, type CostLine, type Project } from "@/lib/types";
import { logActivity } from "../_lib/server";

const schema = z.object({
  title: z.string().min(1).max(200),
  category: z.enum(SERVICE_CATEGORIES),
  serviceId: z.string().optional(),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  quoteId: z.string().optional(),
  renewalId: z.string().optional(),
  ownerUserId: z.string().optional(),
  assigneeUserId: z.string().optional(),
  subjectName: z.string().max(120).optional(),
  subjectPassport: z.string().max(40).optional(),
  subjectNationality: z.string().max(2).optional(),
  subjectDob: z.iso.date().optional(),
  feeAmount: z.number().min(0),
  feeCurrency: z.string().length(3),
  invoiceRef: z.string().max(60).optional(),
  startedAt: z.iso.date().optional(),
  dueDate: z.iso.date().optional(),
  expiresAt: z.iso.date().optional(),
  driveFolderUrl: z.url().optional(),
  notes: z.string().max(5000).optional(),
});

function read(fd: FormData) {
  const v = schema.parse({
    title: str(fd, "title"), category: str(fd, "category") ?? "visa", serviceId: str(fd, "serviceId"), companyId: str(fd, "companyId"), contactId: str(fd, "contactId"),
    dealId: str(fd, "dealId"), quoteId: str(fd, "quoteId"), renewalId: str(fd, "renewalId"), ownerUserId: str(fd, "ownerUserId"), assigneeUserId: str(fd, "assigneeUserId"),
    subjectName: str(fd, "subjectName"), subjectPassport: str(fd, "subjectPassport"), subjectNationality: str(fd, "subjectNationality")?.toUpperCase(), subjectDob: str(fd, "subjectDob"),
    feeAmount: num(fd, "feeAmount"), feeCurrency: (str(fd, "feeCurrency") ?? "IDR").toUpperCase(), invoiceRef: str(fd, "invoiceRef"), startedAt: str(fd, "startedAt"), dueDate: str(fd, "dueDate"),
    expiresAt: str(fd, "expiresAt"), driveFolderUrl: str(fd, "driveFolderUrl"), notes: str(fd, "notes"),
  });
  const subject = v.subjectName ? { name: v.subjectName, passportNumber: v.subjectPassport, nationality: v.subjectNationality, dateOfBirth: v.subjectDob } : undefined;
  const { subjectName: _a, subjectPassport: _b, subjectNationality: _c, subjectDob: _d, renewalId, ...rest } = v;
  return { ...rest, subject, renewalId };
}

export async function createProject(fd: FormData) {
  const user = await requirePermission("crm:write");
  const v = read(fd);
  const now = nowISO();
  const service = v.serviceId ? await db.get("services", v.serviceId) : null;
  const checklist: ChecklistItem[] = checklistTemplate(v.category, service?.code).map((label) => ({ id: db.newId(), label, done: false }));
  const { renewalId, ...fields } = v;
  const project: Project = {
    id: db.newId(), number: await db.nextNumber("global", "P"), ...fields, serviceId: v.serviceId || undefined, status: "new", ownerUserId: v.ownerUserId || user.id,
    assigneeUserId: v.assigneeUserId || undefined, checklist, costOfSales: [], createdAt: now,
  };
  await db.insert("projects", project);
  if (project.dealId) await db.update("deals", project.dealId, { projectId: project.id, updatedAt: now });
  if (renewalId) {
    const r = await db.get("renewals", renewalId);
    if (r) await db.update("renewals", renewalId, { renewalProjectId: project.id, status: r.status === "renewed" ? r.status : "quoted", updatedAt: now });
  }
  await logActivity({ kind: "system", subject: `Project ${project.number} created`, body: project.title, user, projectId: project.id, dealId: project.dealId, quoteId: project.quoteId, companyId: project.companyId, contactId: project.contactId });
  revalidatePath("/crm/projects");
  redirect(`/crm/projects/${project.id}`);
}

export async function updateProject(id: string, fd: FormData) {
  await requirePermission("crm:write");
  const current = await db.get("projects", id);
  if (!current) throw new Error("Project not found");
  const { renewalId: _r, ...v } = read(fd);
  const now = nowISO();
  await db.update("projects", id, { ...v, serviceId: v.serviceId || undefined, ownerUserId: v.ownerUserId || current.ownerUserId, assigneeUserId: v.assigneeUserId || undefined, updatedAt: now });
  if (v.dealId && v.dealId !== current.dealId) await db.update("deals", v.dealId, { projectId: id, updatedAt: now });
  revalidatePath("/crm/projects");
  revalidatePath(`/crm/projects/${id}`);
  redirect(`/crm/projects/${id}`);
}

/** Status transition. Done: stamps completedAt, infers the expiry from the service and opens the renewal. */
export async function setProjectStatus(id: string, fd: FormData) {
  const user = await requirePermission("crm:write");
  const status = z.enum(PROJECT_STATUSES).parse(str(fd, "status"));
  const p = await db.get("projects", id);
  if (!p) throw new Error("Project not found");
  if (p.status === status) return;
  const now = nowISO();
  const today = todayISO();
  const patch: Partial<Project> = { status, updatedAt: now };
  if (status === "in_progress" && !p.startedAt) patch.startedAt = today;
  if (status === "submitted") patch.submittedAt = p.submittedAt ?? today;
  let renewalNote = "";
  if (status === "done") {
    patch.completedAt = p.completedAt ?? today;
    const service = p.serviceId ? await db.get("services", p.serviceId) : null;
    const expiresAt = inferExpiry({ expiresAt: p.expiresAt, completedAt: patch.completedAt }, service ?? undefined, today);
    if (expiresAt) patch.expiresAt = expiresAt;
    const existing = await db.list("renewals", { where: { projectId: id } });
    const renewal = existing.length === 0 ? renewalFromProject({ ...p, expiresAt }, { id: db.newId(), now, serviceCode: service?.code }) : null;
    if (renewal) {
      await db.insert("renewals", renewal);
      renewalNote = `Renewal opened: ${RENEWAL_KIND_LABELS[renewal.kind]} expiring ${renewal.expiresAt}.`;
      await logActivity({ kind: "system", subject: `Renewal created from ${p.number}`, body: `${renewal.label} · expires ${renewal.expiresAt}`, user, projectId: id, companyId: p.companyId, contactId: p.contactId });
    }
    // A renewal project that completes marks its source renewal as renewed.
    const sources = await db.list("renewals", { where: { renewalProjectId: id } });
    for (const r of sources) if (r.status !== "renewed") await db.update("renewals", r.id, { status: "renewed", updatedAt: now });
  }
  await db.update("projects", id, patch);
  await logActivity({ kind: "status", subject: `Project ${PROJECT_STATUS_LABELS[p.status]} → ${PROJECT_STATUS_LABELS[status]}`, body: renewalNote || undefined, user, projectId: id, dealId: p.dealId, companyId: p.companyId, contactId: p.contactId });
  revalidatePath("/crm/projects");
  revalidatePath("/crm/renewals");
  revalidatePath(`/crm/projects/${id}`);
}

export async function toggleChecklist(projectId: string, itemId: string) {
  const user = await requirePermission("crm:write");
  const p = await db.get("projects", projectId);
  if (!p) throw new Error("Project not found");
  const checklist = p.checklist.map((c) => (c.id === itemId ? (c.done ? { ...c, done: false, doneAt: undefined, doneBy: undefined } : { ...c, done: true, doneAt: nowISO(), doneBy: user.id }) : c));
  await db.update("projects", projectId, { checklist, updatedAt: nowISO() });
  revalidatePath(`/crm/projects/${projectId}`);
}

export async function addChecklistItem(projectId: string, fd: FormData) {
  await requirePermission("crm:write");
  const p = await db.get("projects", projectId);
  if (!p) throw new Error("Project not found");
  const label = z.string().min(1).max(200).parse(str(fd, "label"));
  const dueDate = str(fd, "dueDate");
  await db.update("projects", projectId, { checklist: [...p.checklist, { id: db.newId(), label, done: false, dueDate }], updatedAt: nowISO() });
  revalidatePath(`/crm/projects/${projectId}`);
}

export async function removeChecklistItem(projectId: string, itemId: string) {
  await requirePermission("crm:write");
  const p = await db.get("projects", projectId);
  if (!p) throw new Error("Project not found");
  await db.update("projects", projectId, { checklist: p.checklist.filter((c) => c.id !== itemId), updatedAt: nowISO() });
  revalidatePath(`/crm/projects/${projectId}`);
}

const costSchema = z.object({ description: z.string().min(1).max(200), vendorId: z.string().optional(), vendorName: z.string().max(120).optional(), amountIDR: z.number().min(0), amountUSD: z.number().min(0).optional(), note: z.string().max(300).optional() });

export async function addCostLine(projectId: string, fd: FormData) {
  const user = await requirePermission("crm:write");
  const p = await db.get("projects", projectId);
  if (!p) throw new Error("Project not found");
  const v = costSchema.parse({ description: str(fd, "description"), vendorId: str(fd, "vendorId"), vendorName: str(fd, "vendorName"), amountIDR: num(fd, "amountIDR"), amountUSD: num(fd, "amountUSD") || undefined, note: str(fd, "note") });
  let vendorName = v.vendorName;
  if (v.vendorId) { const vendor = await db.get("vendors", v.vendorId); vendorName = vendor?.name ?? vendorName; }
  const line: CostLine = { id: db.newId(), description: v.description, vendorId: v.vendorId || undefined, vendorName, amountIDR: v.amountIDR, amountUSD: v.amountUSD, approved: false, note: v.note };
  await db.update("projects", projectId, { costOfSales: [...p.costOfSales, line], updatedAt: nowISO() });
  await logActivity({ kind: "system", subject: `Cost line added: ${v.description}`, body: `IDR ${v.amountIDR}${vendorName ? ` · ${vendorName}` : ""}`, user, projectId, companyId: p.companyId });
  revalidatePath(`/crm/projects/${projectId}`);
}

/** Only the project owner (per the Cost of Sales SOP) or an admin may approve a vendor cost. */
export async function approveCostLine(projectId: string, lineId: string) {
  const user = await requirePermission("crm:write");
  const p = await db.get("projects", projectId);
  if (!p) throw new Error("Project not found");
  if (user.role !== "admin" && p.ownerUserId !== user.id) throw new Error("Only the project owner or an admin can approve costs");
  const now = nowISO();
  const costOfSales = p.costOfSales.map((c) => (c.id === lineId ? { ...c, approved: true, approvedByUserId: user.id, approvedAt: now } : c));
  const line = p.costOfSales.find((c) => c.id === lineId);
  await db.update("projects", projectId, { costOfSales, updatedAt: now });
  await logActivity({ kind: "status", subject: `Cost approved: ${line?.description ?? lineId}`, body: line ? `IDR ${line.amountIDR}` : undefined, user, projectId, companyId: p.companyId });
  revalidatePath(`/crm/projects/${projectId}`);
}

export async function markCostPaid(projectId: string, lineId: string) {
  await requirePermission("crm:write");
  const p = await db.get("projects", projectId);
  if (!p) throw new Error("Project not found");
  const now = nowISO();
  await db.update("projects", projectId, { costOfSales: p.costOfSales.map((c) => (c.id === lineId ? { ...c, paidAt: c.paidAt ?? now.slice(0, 10) } : c)), updatedAt: now });
  revalidatePath(`/crm/projects/${projectId}`);
}

export async function removeCostLine(projectId: string, lineId: string) {
  const user = await requirePermission("crm:write");
  const p = await db.get("projects", projectId);
  if (!p) throw new Error("Project not found");
  const line = p.costOfSales.find((c) => c.id === lineId);
  if (line?.approved && user.role !== "admin" && p.ownerUserId !== user.id) throw new Error("Approved costs can only be removed by the project owner or an admin");
  await db.update("projects", projectId, { costOfSales: p.costOfSales.filter((c) => c.id !== lineId), updatedAt: nowISO() });
  revalidatePath(`/crm/projects/${projectId}`);
}
