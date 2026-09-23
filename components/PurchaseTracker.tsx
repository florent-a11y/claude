"use client";
import { useEffect } from "react";
import { purchaseEventId, track } from "@/lib/analytics-client";

export interface PurchaseTrackerProps {
  orderId: string;
  /** Order total in major units (USD). */
  value: number;
  currency: string;
  product: string;
  productLabel: string;
  travelers: number;
}

/**
 * Browser-side duplicate of the server-side purchase event (lib/tracking.ts). Same transaction_id for GA4
 * and same eventID for Meta, so both platforms deduplicate. Guarded per browser session against reloads.
 */
export function PurchaseTracker({ orderId, value, currency, product, productLabel, travelers }: PurchaseTrackerProps) {
  useEffect(() => {
    const key = `aca_purchase_${orderId}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* ignore */ }
    const eventId = purchaseEventId(orderId);
    track(
      "purchase",
      { transaction_id: orderId, value, currency, items: [{ item_id: product, item_name: productLabel, quantity: travelers, price: Math.round((value / travelers) * 100) / 100 }] },
      { eventId, meta: { event: "Purchase", params: { value, currency, content_type: "product", content_ids: [product], num_items: travelers, order_id: orderId } } },
    );
    try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
  }, [orderId, value, currency, product, productLabel, travelers]);
  return null;
}
