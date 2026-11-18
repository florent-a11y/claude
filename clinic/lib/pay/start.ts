import "server-only";
import type { Order } from "../schema";
import { saveOrder } from "../store";
import { markPaid } from "../orders";
import { orderPath, orderUrl } from "../links";
import { methodInfo } from "./methods";
import { createInvoice, getInvoice, isPaidStatus } from "./xendit";
import { createPaymentIntent, hostedCheckoutUrl, retrievePaymentIntent } from "./airwallex";

/**
 * Starts an online payment and returns where to send the customer: the provider's hosted page, or straight back
 * to the order page when the method is simulated (development without provider keys).
 */
export async function startPayment(order: Order, method: "xendit" | "airwallex"): Promise<string> {
  const info = methodInfo(method);
  if (!info) throw new Error(`Payment method not available: ${method}`);
  if (order.status !== "awaiting_payment" || order.paid) return orderPath(order);

  if (info.simulated) {
    await markPaid(order, "simulated payment", method);
    return orderPath(order, { paid: "1" });
  }
  const urls = { success: orderUrl(order, { paid: "1" }), failure: orderUrl(order, { pay: "failed" }) };

  if (method === "xendit") {
    // Reuse a live invoice so a second click cannot produce two payable invoices for one order.
    const stillValid = order.xenditInvoiceUrl && order.xenditInvoiceExpires && new Date(order.xenditInvoiceExpires).getTime() > Date.now() + 5 * 60_000;
    if (stillValid) return order.xenditInvoiceUrl!;
    const invoice = await createInvoice(order, urls);
    await saveOrder({ ...order, paymentMethod: "xendit", xenditInvoiceId: invoice.id, xenditInvoiceUrl: invoice.invoice_url, xenditInvoiceExpires: invoice.expiry_date });
    return invoice.invoice_url;
  }

  const intent = await createPaymentIntent(order, urls.success);
  await saveOrder({ ...order, paymentMethod: "airwallex", airwallexIntentId: intent.id });
  return hostedCheckoutUrl(intent, urls);
}

/**
 * Called when the customer lands back on the order page after paying: asks the provider directly, so the order is
 * confirmed even if the webhook is late or misconfigured. Never throws.
 */
export async function syncPayment(order: Order): Promise<Order> {
  if (order.paid || order.status !== "awaiting_payment") return order;
  try {
    if (order.xenditInvoiceId && methodInfo("xendit")?.simulated === false) {
      const invoice = await getInvoice(order.xenditInvoiceId);
      if (invoice.external_id === order.id && isPaidStatus(invoice.status) && Number(invoice.amount) === order.totalIdr) return await markPaid(order, "xendit (return check)", "xendit", `xendit:${invoice.id}`);
    }
    if (order.airwallexIntentId && methodInfo("airwallex")?.simulated === false) {
      const intent = await retrievePaymentIntent(order.airwallexIntentId);
      if (intent.status === "SUCCEEDED") return await markPaid(order, "airwallex (return check)", "airwallex", `airwallex:${intent.id}`);
    }
  } catch (e) {
    console.error("[pay] sync", order.id, e);
  }
  return order;
}
