import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrder, updateOrder } from "@/lib/store";
import { ORDER_STATUSES, type Order } from "@/lib/schema";
import { onOrderUpdated } from "@/lib/notify";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  opsNotes: z.string().max(2000).optional(),
  assignee: z.string().max(60).optional(),
  acknowledge: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

function actor(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  if (!h.startsWith("Basic ")) return "ops";
  return Buffer.from(h.slice(6), "base64").toString().split(":")[0] || "ops";
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 });
  const current = await getOrder(id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const by = actor(req);
  const now = new Date().toISOString();
  const patch: Partial<Order> = {};
  const activity = [...(current.activity ?? [])];
  const p = parsed.data;

  if (p.acknowledge && !current.acknowledgedAt) {
    patch.acknowledgedAt = now;
    if (current.status === "paid") patch.status = "acknowledged";
    if (!current.assignee && !p.assignee) patch.assignee = by;
    activity.push({ at: now, by, action: "acknowledged" });
  }
  if (p.assignee !== undefined && p.assignee !== current.assignee) {
    patch.assignee = p.assignee;
    activity.push({ at: now, by, action: p.assignee ? `assigned to ${p.assignee}` : "unassigned" });
  }
  if (p.status && p.status !== current.status) {
    patch.status = p.status;
    if (p.status === "delivered") patch.deliveredAt = now;
    if (!current.acknowledgedAt) patch.acknowledgedAt = now;
    activity.push({ at: now, by, action: `status → ${p.status}` });
  }
  if (p.opsNotes !== undefined && p.opsNotes !== current.opsNotes) {
    patch.opsNotes = p.opsNotes;
    activity.push({ at: now, by, action: "notes updated" });
  }
  if (p.note) activity.push({ at: now, by, action: "comment", note: p.note });

  patch.activity = activity;
  const order = await updateOrder(id, patch);
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await onOrderUpdated(order);
  return NextResponse.json({ ok: true, status: order.status, assignee: order.assignee ?? null });
}
