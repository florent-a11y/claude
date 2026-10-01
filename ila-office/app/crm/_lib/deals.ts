import { db } from "@/lib/db";
import { nowISO } from "@/lib/dates";
import { isClosedStage } from "@/lib/crm";
import { DEAL_STAGE_LABELS, type Deal, type DealStage } from "@/lib/types";
import type { SessionUser } from "@/lib/auth";
import { logActivity } from "./server";

/** Moves a deal to a stage, stamps closedAt on won/lost and logs a status activity. Shared by the action and the JSON route. */
export async function moveDealStage(id: string, stage: DealStage, user: SessionUser, lostReason?: string): Promise<Deal | null> {
  const deal = await db.get("deals", id);
  if (!deal) return null;
  if (deal.stage === stage && !(stage === "closed_lost" && lostReason && lostReason !== deal.lostReason)) return deal;
  const now = nowISO();
  const patch: Partial<Deal> = { stage, updatedAt: now, closedAt: isClosedStage(stage) ? now : undefined };
  if (stage === "closed_lost" && lostReason) patch.lostReason = lostReason;
  const next = await db.update("deals", id, patch);
  await logActivity({
    kind: "status", subject: `Deal stage: ${DEAL_STAGE_LABELS[deal.stage]} → ${DEAL_STAGE_LABELS[stage]}`,
    body: stage === "closed_lost" && lostReason ? `Lost reason: ${lostReason}` : undefined, user, dealId: id, companyId: deal.companyId, contactId: deal.contactId,
  });
  return next;
}
