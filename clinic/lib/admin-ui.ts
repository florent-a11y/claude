import type { OrderStatus } from "./schema";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_review: "Doctor review", awaiting_payment: "Awaiting payment", payment_review: "Transfer to check", confirmed: "Confirmed",
  out_for_delivery: "On the way", completed: "Completed", declined: "Declined", cancelled: "Cancelled", refunded: "Refunded",
};
export const STATUS_TONE: Record<OrderStatus, string> = {
  awaiting_review: "bg-clay-50 text-clay-600", awaiting_payment: "bg-sand-200 text-forest-900", payment_review: "bg-amber-100 text-amber-900",
  confirmed: "bg-sage-200 text-forest-900", out_for_delivery: "bg-sky-100 text-sky-900", completed: "bg-sage-100 text-forest-700",
  declined: "bg-sand-200 text-ink-500", cancelled: "bg-sand-200 text-ink-500", refunded: "bg-sand-200 text-ink-500",
};
export const METHOD_LABEL = { xendit: "Xendit (QRIS / VA / e-wallet)", airwallex: "Airwallex card", transfer: "Bank transfer", cod: "Pay on delivery" } as const;

/** Console time in Bali: "18 Nov, 14:05". */
export function baliTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" }).format(new Date(iso));
}

/** Digits for a wa.me link from what the customer typed: "0812…" becomes "62812…". */
export function waDigits(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("0") ? `62${d.slice(1)}` : d;
}
