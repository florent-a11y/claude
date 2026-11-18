"use server";
import { revalidatePath } from "next/cache";
import { canReview, staff } from "@/lib/admin";
import { ORDER_STATUSES, PAY_METHODS, type OrderStatus, type PayMethod } from "@/lib/schema";
import { getLead, getOrder, saveLead } from "@/lib/store";
import { markPaid, reviewOrder, setOpsNotes, setStatus } from "@/lib/orders";

const str = (form: FormData, key: string) => String(form.get(key) ?? "");

async function load(form: FormData) {
  const order = await getOrder(str(form, "id"));
  if (!order) throw new Error("Order not found");
  return order;
}
function done(id: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${id}`);
}

/** Doctor's decision: the ticked prescription lines are approved, the others removed. "decline" removes them all. */
export async function reviewAction(form: FormData) {
  const who = await staff();
  if (!canReview(who)) throw new Error("Only the doctor sign-in can review prescription items");
  const order = await load(form);
  const approved = str(form, "decision") === "decline" ? [] : form.getAll("approve").map(String);
  await reviewOrder(order, `doctor:${who.user}`, approved, str(form, "note"));
  done(order.id);
}

/** Staff confirm money received by hand: a checked bank transfer, cash or QRIS on delivery. */
export async function markPaidAction(form: FormData) {
  const who = await staff();
  const order = await load(form);
  const method = str(form, "method") as PayMethod;
  if (!PAY_METHODS.includes(method)) throw new Error("Unknown payment method");
  await markPaid(order, `${who.role}:${who.user}`, method);
  done(order.id);
}

export async function statusAction(form: FormData) {
  const who = await staff();
  const order = await load(form);
  const status = str(form, "status") as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) throw new Error("Unknown status");
  await setStatus(order, `${who.role}:${who.user}`, status);
  done(order.id);
}

export async function notesAction(form: FormData) {
  const who = await staff();
  const order = await load(form);
  await setOpsNotes(order, `${who.role}:${who.user}`, str(form, "notes"));
  done(order.id);
}

export async function leadHandledAction(form: FormData) {
  await staff();
  const lead = await getLead(str(form, "id"));
  if (lead) await saveLead({ ...lead, handledAt: lead.handledAt ? undefined : new Date().toISOString() });
  revalidatePath("/admin/leads");
}
