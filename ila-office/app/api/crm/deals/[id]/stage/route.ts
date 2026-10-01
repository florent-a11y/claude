import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/auth";
import { DEAL_STAGES } from "@/lib/types";
import { moveDealStage } from "@/app/crm/_lib/deals";

export const runtime = "nodejs";
const schema = z.object({ stage: z.enum(DEAL_STAGES), lostReason: z.string().max(300).optional() });

/** POST { stage, lostReason? } → moves the deal (kanban board). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await guard("crm:write");
  if (user instanceof Response) return user;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  const deal = await moveDealStage(id, parsed.data.stage, user, parsed.data.lostReason);
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  return NextResponse.json({ ok: true, deal: { id: deal.id, stage: deal.stage, closedAt: deal.closedAt ?? null } });
}
