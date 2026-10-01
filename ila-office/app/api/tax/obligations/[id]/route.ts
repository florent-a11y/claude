import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayISO } from "@/lib/dates";
import { OBLIGATION_STATUSES } from "@/lib/types";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(OBLIGATION_STATUSES).optional(),
  assigneeUserId: z.string().max(80).nullable().optional(),
  amount: z.number().min(0).nullable().optional(),
  ntpn: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/** Inline updates from the calendar matrix: PATCH /api/tax/obligations/:id with any subset of the fields above. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard("tax:write");
  if (g instanceof Response) return g;
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  const current = await db.get("tax_obligations", decodeURIComponent(id));
  if (!current) return NextResponse.json({ error: "Obligation not found" }, { status: 404 });
  const v = parsed.data;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (v.status !== undefined) {
    patch.status = v.status;
    const today = todayISO();
    if ((v.status === "paid" || v.status === "reported") && !current.paidAt) patch.paidAt = today;
    if (v.status === "reported" && !current.reportedAt) patch.reportedAt = today;
  }
  if (v.assigneeUserId !== undefined) patch.assigneeUserId = v.assigneeUserId ?? undefined;
  if (v.amount !== undefined) patch.amount = v.amount ?? undefined;
  if (v.ntpn !== undefined) patch.ntpn = v.ntpn ?? undefined;
  if (v.notes !== undefined) patch.notes = v.notes ?? undefined;
  const updated = await db.update("tax_obligations", current.id, patch);
  return NextResponse.json(updated);
}

export const POST = PATCH;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard("read");
  if (g instanceof Response) return g;
  const { id } = await params;
  const row = await db.get("tax_obligations", decodeURIComponent(id));
  if (!row) return NextResponse.json({ error: "Obligation not found" }, { status: 404 });
  return NextResponse.json(row);
}
