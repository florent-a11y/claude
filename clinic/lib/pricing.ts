import { getProduct, type Product } from "./catalog";
import { FREE_DELIVERY_FROM_IDR, zoneFor } from "./config";
import type { CartItem, Fulfilment, OrderLine } from "./schema";

export interface Quote {
  lines: Array<OrderLine & { product: Product }>;
  /** Slugs in the cart that are no longer in the catalogue. */
  unknown: string[];
  subtotalIdr: number;
  deliveryIdr: number;
  calloutIdr: number;
  totalIdr: number;
  /** A doctor must approve before payment. */
  hasRx: boolean;
  /** A nurse gives at least one item: a place and time slot are needed. */
  hasSession: boolean;
  /** At least one physical product to hand over. */
  hasGoods: boolean;
  /** A health questionnaire is required (any prescription item or nurse session). */
  needsHealth: boolean;
  /** Something has to reach the customer (false for a membership-only basket). */
  needsFulfilment: boolean;
}

/**
 * The one place prices are computed, used by the cart preview in the browser and again on the server
 * when the order is created (the server never trusts amounts from the browser).
 *
 * Fees for an address in Bali:
 *  - nurse call-out fee of the zone when a nurse session is in the basket (products then travel with the nurse);
 *  - otherwise the zone's delivery fee, waived from FREE_DELIVERY_FROM_IDR of products.
 */
export function quote(items: CartItem[], fulfilment?: Pick<Fulfilment, "mode" | "area">, names?: (slug: string) => string): Quote {
  const lines: Quote["lines"] = [];
  const unknown: string[] = [];
  for (const item of items) {
    const product = getProduct(item.slug);
    if (!product) { unknown.push(item.slug); continue; }
    const existing = lines.find((l) => l.slug === item.slug);
    if (existing) { existing.qty = Math.min(10, existing.qty + item.qty); continue; }
    lines.push({
      slug: product.slug, name: names?.(product.slug) ?? product.slug, kind: product.kind, rx: product.rx, session: product.session,
      qty: item.qty, unitIdr: product.priceIdr, product,
    });
  }
  const fees = feesFor(lines, fulfilment);
  const hasRx = lines.some((l) => l.rx);
  const hasSession = lines.some((l) => l.session);
  const hasGoods = lines.some(isGoods);
  return { lines, unknown, ...fees, hasRx, hasSession, hasGoods, needsHealth: hasRx || hasSession, needsFulfilment: hasSession || hasGoods };
}

const isGoods = (l: Pick<OrderLine, "session" | "kind">) => !l.session && l.kind !== "membership";

/** Totals for a set of order lines at the unit prices they already carry (used again when a doctor removes lines). */
export function feesFor(lines: OrderLine[], fulfilment?: Pick<Fulfilment, "mode" | "area">) {
  const subtotalIdr = lines.reduce((s, l) => s + l.unitIdr * l.qty, 0);
  const hasSession = lines.some((l) => l.session);
  const goods = lines.filter(isGoods);
  const goodsIdr = goods.reduce((s, l) => s + l.unitIdr * l.qty, 0);
  let deliveryIdr = 0;
  let calloutIdr = 0;
  const zone = fulfilment?.mode === "address" ? zoneFor(fulfilment.area) : undefined;
  if (zone) {
    if (hasSession) calloutIdr = zone.calloutIdr;
    else if (goods.length > 0 && goodsIdr < FREE_DELIVERY_FROM_IDR) deliveryIdr = zone.deliveryIdr;
  }
  return { subtotalIdr, deliveryIdr, calloutIdr, totalIdr: subtotalIdr + deliveryIdr + calloutIdr };
}
