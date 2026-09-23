import "server-only";
import type { Order } from "./schema";
import { notifyOpsNewOrder, sendCustomerConfirmation } from "./email";
import { syncOrderToSheet } from "./sheets";
import { site } from "./config";

/** Runs after an order becomes paid. Each channel fails independently and never blocks the order. */
export async function onOrderPaid(order: Order) {
  const results = await Promise.allSettled([notifyOpsNewOrder(order), sendCustomerConfirmation(order), syncOrderToSheet(order, site.url)]);
  for (const r of results) if (r.status === "rejected") console.error("[notify]", (r.reason as Error).message);
}

export async function onOrderUpdated(order: Order) {
  try { await syncOrderToSheet(order, site.url); } catch (e) { console.error("[sheets]", (e as Error).message); }
}
