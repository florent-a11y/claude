import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { site } from "./config";
import { feesFor } from "./pricing";
import type { Activity, CheckoutInput, Fulfilment, Order, OrderLine, OrderStatus, PayMethod } from "./schema";
import { validateCheckout } from "./checkout";
import { getOrder, saveOrder } from "./store";
import { methodInfo } from "./pay/methods";
import { emailCustomer, emailOps } from "./email";
import { idr } from "./money";

const ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I
export function newOrderId(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return `${site.orderPrefix}-${s}`;
}

const entry = (by: string, action: string, eventId?: string): Activity => ({ at: new Date().toISOString(), by, action, ...(eventId ? { eventId } : {}) });

/** Creates and stores the order. Orders with prescription items wait for the doctor; the others wait for payment
 *  (or are confirmed at once when the customer pays on delivery). */
export async function createOrder(input: CheckoutInput): Promise<Order> {
  const { q, fulfilment, health, payment } = validateCheckout(input);
  let id = newOrderId();
  for (let i = 0; i < 5 && (await getOrder(id)); i++) id = newOrderId();
  const lines: OrderLine[] = q.lines.map(({ product: _product, ...line }) => line);
  const status: OrderStatus = q.hasRx ? "awaiting_review" : payment === "cod" ? "confirmed" : "awaiting_payment";
  const order: Order = {
    id, token: randomBytes(16).toString("hex"), createdAt: new Date().toISOString(), status, lines,
    subtotalIdr: q.subtotalIdr, deliveryIdr: q.deliveryIdr, calloutIdr: q.calloutIdr, totalIdr: q.totalIdr,
    contact: input.contact, fulfilment, health, paymentMethod: payment, paid: false,
    activity: [entry("customer", q.hasRx ? "order placed, sent for doctor review" : `order placed (${payment})`)],
  };
  await saveOrder(order);
  await emailCustomer(order, "received");
  await emailOps(`${q.hasRx ? "Doctor review needed" : "New order"} ${order.id}`, summaryLines(order));
  return order;
}

export function summaryLines(order: Order): string[] {
  return [
    `Order ${order.id} · ${order.status} · ${idr(order.totalIdr)}`,
    `${order.contact.name} · ${order.contact.phone} · ${order.contact.email}`,
    ...order.lines.map((l) => `  ${l.qty} × ${l.name}${l.rx ? " (doctor review)" : ""}`),
    order.fulfilment.mode === "address" ? `Address: ${order.fulfilment.area}, ${order.fulfilment.address}` : "At the lounge",
    order.fulfilment.date ? `Requested: ${order.fulfilment.date} ${order.fulfilment.slot ?? ""}` : "",
    `${site.url}/admin/orders/${order.id}`,
  ].filter(Boolean);
}

async function patch(order: Order, changes: Partial<Order>, log: Activity): Promise<Order> {
  const next: Order = { ...order, ...changes, activity: [...order.activity, log] };
  await saveOrder(next);
  return next;
}

/** Marks an order paid (payment provider webhook, return-page check, or staff confirming a transfer or cash). Idempotent. */
export async function markPaid(order: Order, by: string, method: PayMethod, eventId?: string): Promise<Order> {
  if (order.paid) return order;
  if (["declined", "cancelled", "refunded", "awaiting_review"].includes(order.status)) return order;
  const wasWaiting = order.status === "awaiting_payment" || order.status === "payment_review";
  const next = await patch(order, { paid: true, paidAt: new Date().toISOString(), paymentMethod: method, status: wasWaiting ? "confirmed" : order.status }, entry(by, `payment received (${method})`, eventId));
  if (wasWaiting) {
    await emailCustomer(next, "confirmed");
    await emailOps(`Paid: ${next.id}`, summaryLines(next));
  }
  return next;
}

/** Customer chooses to pay when the nurse or courier arrives. */
export async function choosePayOnDelivery(order: Order): Promise<Order> {
  if (order.status !== "awaiting_payment" || !methodInfo("cod")) return order;
  const next = await patch(order, { status: "confirmed", paymentMethod: "cod" }, entry("customer", "chose pay on delivery"));
  await emailOps(`Confirmed (pay on delivery): ${next.id}`, summaryLines(next));
  return next;
}

/** Customer uploaded a bank-transfer proof: staff check the bank account, then confirm. */
export async function attachProof(order: Order, proofId: string): Promise<Order> {
  if (order.status !== "awaiting_payment" && order.status !== "payment_review") return order;
  const next = await patch(order, { status: "payment_review", paymentMethod: "transfer", proofId }, entry("customer", "uploaded transfer proof"));
  await emailOps(`Transfer to check: ${next.id}`, summaryLines(next));
  return next;
}

/**
 * The doctor's decision on the prescription lines. `approved` lists the slugs the doctor releases; every other
 * prescription line is removed. Totals are recomputed on what remains. Nothing left means the order is declined.
 */
export async function reviewOrder(order: Order, by: string, approved: string[], note: string): Promise<Order> {
  if (order.status !== "awaiting_review") return order;
  const keep = order.lines.filter((l) => !l.rx || approved.includes(l.slug));
  const removed = order.lines.filter((l) => l.rx && !approved.includes(l.slug));
  const at = new Date().toISOString();
  const cleanNote = note.trim().slice(0, 1000) || undefined;
  if (keep.length === 0) {
    const next = await patch(order, { status: "declined", lines: [], removedLines: removed, review: { by, at, decision: "declined", note: cleanNote } }, entry(by, "doctor declined the request"));
    await emailCustomer(next, "declined");
    return next;
  }
  const needsPlace = keep.some((l) => l.session || l.kind !== "membership");
  const fulfilment: Fulfilment = needsPlace ? order.fulfilment : { mode: "clinic" };
  const decision = removed.length === 0 ? "approved" : "partly_approved";
  const next = await patch(order, {
    status: "awaiting_payment", lines: keep, removedLines: removed.length ? removed : undefined, fulfilment, ...feesFor(keep, fulfilment),
    review: { by, at, decision, note: cleanNote },
  }, entry(by, decision === "approved" ? "doctor approved the request" : `doctor approved part of the request (removed: ${removed.map((l) => l.name).join(", ")})`));
  await emailCustomer(next, "approved");
  return next;
}

/** Status changes staff may make by hand, from → to. */
export const STAFF_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  awaiting_review: ["cancelled"],
  awaiting_payment: ["cancelled"],
  payment_review: ["awaiting_payment", "cancelled"],
  confirmed: ["out_for_delivery", "completed", "cancelled", "refunded"],
  out_for_delivery: ["completed", "confirmed", "refunded"],
  completed: ["refunded"],
};

export async function setStatus(order: Order, by: string, status: OrderStatus): Promise<Order> {
  if (!STAFF_TRANSITIONS[order.status]?.includes(status)) return order;
  const changes: Partial<Order> = { status };
  if (order.status === "payment_review" && status === "awaiting_payment") changes.proofId = undefined; // proof rejected: ask again
  const next = await patch(order, changes, entry(by, `status: ${order.status} → ${status}`));
  if (status === "out_for_delivery") await emailCustomer(next, "onTheWay");
  return next;
}

export async function setOpsNotes(order: Order, by: string, notes: string): Promise<Order> {
  return patch(order, { opsNotes: notes.trim().slice(0, 4000) || undefined }, entry(by, "updated notes"));
}

export { CheckoutProblem, englishName, tokenMatches, validateCheckout } from "./checkout";
