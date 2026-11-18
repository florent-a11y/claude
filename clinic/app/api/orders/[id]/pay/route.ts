import { NextResponse } from "next/server";
import { z } from "zod";
import { PAY_METHODS } from "@/lib/schema";
import { getOrder, saveOrder } from "@/lib/store";
import { choosePayOnDelivery, tokenMatches } from "@/lib/orders";
import { methodInfo } from "@/lib/pay/methods";
import { startPayment } from "@/lib/pay/start";
import { orderPath } from "@/lib/links";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
const limited = createRateLimiter({ limit: 20, windowMs: 10 * 60_000 });
const bodySchema = z.object({ token: z.string().min(8).max(100), method: z.enum(PAY_METHODS) });

/** The customer picks (or changes) how to pay for an order that is ready for payment. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (limited(clientIp(req))) return NextResponse.json({ error: "generic" }, { status: 429 });
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "generic" }, { status: 400 });
  const order = await getOrder(id);
  if (!order || !tokenMatches(order, parsed.data.token)) return NextResponse.json({ error: "generic" }, { status: 404 });
  if (order.status !== "awaiting_payment") return NextResponse.json({ redirect: orderPath(order) });
  const { method } = parsed.data;
  if (!methodInfo(method)) return NextResponse.json({ error: "generic" }, { status: 400 });

  try {
    if (method === "cod") {
      await choosePayOnDelivery(order);
      return NextResponse.json({ redirect: orderPath(order) });
    }
    if (method === "transfer") {
      await saveOrder({ ...order, paymentMethod: "transfer" });
      return NextResponse.json({ redirect: orderPath(order) });
    }
    return NextResponse.json({ redirect: await startPayment(order, method) });
  } catch (e) {
    console.error("[orders] pay", order.id, method, e);
    return NextResponse.json({ error: "generic" }, { status: 502 });
  }
}
