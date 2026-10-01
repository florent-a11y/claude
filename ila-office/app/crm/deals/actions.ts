"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { nowISO } from "@/lib/dates";
import { num, str } from "@/lib/util";
import { isClosedStage } from "@/lib/crm";
import { DEAL_STAGES, SERVICE_CATEGORIES, type Deal } from "@/lib/types";
import { logActivity } from "../_lib/server";
import { moveDealStage } from "../_lib/deals";

const schema = z.object({
  title: z.string().min(1).max(200),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  stage: z.enum(DEAL_STAGES),
  amount: z.number().min(0),
  currency: z.string().length(3),
  category: z.enum(SERVICE_CATEGORIES).optional(),
  ownerUserId: z.string().optional(),
  expectedCloseDate: z.iso.date().optional(),
  nextStep: z.string().max(300).optional(),
  source: z.string().max(80).optional(),
  lostReason: z.string().max(300).optional(),
});

function read(fd: FormData) {
  return schema.parse({
    title: str(fd, "title"), companyId: str(fd, "companyId"), contactId: str(fd, "contactId"), stage: str(fd, "stage") ?? "prospect", amount: num(fd, "amount"),
    currency: (str(fd, "currency") ?? "IDR").toUpperCase(), category: str(fd, "category"), ownerUserId: str(fd, "ownerUserId"), expectedCloseDate: str(fd, "expectedCloseDate"),
    nextStep: str(fd, "nextStep"), source: str(fd, "source"), lostReason: str(fd, "lostReason"),
  });
}

export async function createDeal(fd: FormData) {
  const user = await requirePermission("crm:write");
  const v = read(fd);
  const now = nowISO();
  const deal: Deal = { id: db.newId(), ...v, ownerUserId: v.ownerUserId || user.id, createdAt: now, closedAt: isClosedStage(v.stage) ? now : undefined };
  await db.insert("deals", deal);
  await logActivity({ kind: "system", subject: `Deal created (${v.stage})`, user, dealId: deal.id, companyId: deal.companyId, contactId: deal.contactId });
  revalidatePath("/crm/deals");
  redirect(`/crm/deals/${deal.id}`);
}

export async function updateDeal(id: string, fd: FormData) {
  const user = await requirePermission("crm:write");
  const current = await db.get("deals", id);
  if (!current) throw new Error("Deal not found");
  const v = read(fd);
  const { stage, lostReason, ...rest } = v;
  await db.update("deals", id, { ...rest, ownerUserId: v.ownerUserId || undefined, lostReason: lostReason, updatedAt: nowISO() });
  if (stage !== current.stage) await moveDealStage(id, stage, user, lostReason);
  revalidatePath("/crm/deals");
  revalidatePath(`/crm/deals/${id}`);
  redirect(`/crm/deals/${id}`);
}

/** Form-based stage change (used where JavaScript is unavailable or from detail pages). */
export async function setDealStage(id: string, fd: FormData) {
  const user = await requirePermission("crm:write");
  const stage = z.enum(DEAL_STAGES).parse(str(fd, "stage"));
  await moveDealStage(id, stage, user, str(fd, "lostReason"));
  revalidatePath("/crm/deals");
  revalidatePath(`/crm/deals/${id}`);
}

export async function deleteDeal(id: string) {
  await requirePermission("crm:write");
  const deal = await db.get("deals", id);
  if (!deal) throw new Error("Deal not found");
  if (deal.quoteId || deal.projectId) throw new Error("This deal has a quote or project; close it as lost instead.");
  await db.remove("deals", id);
  revalidatePath("/crm/deals");
  redirect("/crm/deals");
}
