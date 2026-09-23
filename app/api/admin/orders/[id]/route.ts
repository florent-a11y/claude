import { NextResponse } from "next/server";
import { z } from "zod";
import { updateOrder } from "@/lib/store";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["pending_payment", "paid", "in_progress", "delivered", "refunded", "cancelled"]).optional(),
  opsNotes: z.string().max(2000).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 });
  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "delivered") patch.deliveredAt = new Date().toISOString();
  const order = await updateOrder(id, patch);
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, status: order.status });
}
