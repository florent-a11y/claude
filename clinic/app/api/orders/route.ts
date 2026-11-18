import { NextResponse } from "next/server";
import { checkoutSchema } from "@/lib/schema";
import { CheckoutProblem, createOrder } from "@/lib/orders";
import { startPayment } from "@/lib/pay/start";
import { orderPath } from "@/lib/links";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
const limited = createRateLimiter({ limit: 8, windowMs: 10 * 60_000 });

/** Form field to highlight for a schema error path. */
function fieldFor(path: PropertyKey[]): { code: string; field?: string } {
  const key = path.map(String).join(".");
  if (key === "contact.name") return { code: "name", field: "name" };
  if (key === "contact.email") return { code: "email", field: "email" };
  if (key === "contact.phone") return { code: "phone", field: "phone" };
  if (key === "health.dob") return { code: "dob", field: "dob" };
  if (key.startsWith("health.conditions")) return { code: "conditions", field: "conditions" };
  if (key === "consents.terms") return { code: "consent", field: "terms" };
  if (key === "consents.adult") return { code: "consent", field: "adult" };
  if (key.startsWith("items")) return { code: "items" };
  return { code: "generic" };
}

export async function POST(req: Request) {
  if (limited(clientIp(req))) return NextResponse.json({ error: "rate" }, { status: 429 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "generic" }, { status: 400 }); }
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    const { code, field } = fieldFor(parsed.error.issues[0]?.path ?? []);
    return NextResponse.json({ error: code, field }, { status: 400 });
  }
  // Honeypot filled: pretend it worked, store nothing.
  if (parsed.data.website) return NextResponse.json({ redirect: "/" });

  try {
    const order = await createOrder(parsed.data);
    let redirect = orderPath(order);
    if (order.status === "awaiting_payment" && (order.paymentMethod === "xendit" || order.paymentMethod === "airwallex")) {
      try {
        redirect = await startPayment(order, order.paymentMethod);
      } catch (e) {
        // The order exists: send the customer to its page, where they can retry or choose another method.
        console.error("[orders] start payment", order.id, e);
        redirect = orderPath(order, { pay: "failed" });
      }
    }
    return NextResponse.json({ id: order.id, redirect });
  } catch (e) {
    if (e instanceof CheckoutProblem) return NextResponse.json({ error: e.code, field: e.field }, { status: 400 });
    console.error("[orders] create", e);
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}
