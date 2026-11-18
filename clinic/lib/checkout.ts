import en from "../messages/en.json";
import { AREAS, BOOKING_DAYS_AHEAD, BALI_OFFSET_MIN, baliToday } from "./config";
import { quote, type Quote } from "./pricing";
import { ageOn, type CheckoutInput, type Fulfilment, type Health, type Order, type PayMethod } from "./schema";
import { methodInfo } from "./pay/methods";

/**
 * The rules a checkout must pass, kept apart from storage and email so they can be tested on their own.
 */

/** A checkout the server refuses: `code` is a key under Checkout.errors, `field` the form field to highlight. */
export class CheckoutProblem extends Error {
  constructor(public readonly code: string, public readonly field?: string) { super(code); }
}

export function englishName(slug: string): string {
  return (en.Catalog.items as Record<string, { name: string }>)[slug]?.name ?? slug;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Checks everything the form schema cannot (what the basket needs, dates, age) and returns the cleaned-up parts. */
export function validateCheckout(input: CheckoutInput, now = new Date()): { q: Quote; fulfilment: Fulfilment; health?: Health; payment?: PayMethod } {
  const q = quote(input.items, input.fulfilment, englishName);
  if (q.unknown.length > 0 || q.lines.length === 0) throw new CheckoutProblem("items");
  const today = baliToday(now);

  let health: Health | undefined;
  if (q.needsHealth) {
    const h = input.health;
    if (!h) throw new CheckoutProblem("dob", "dob");
    const age = ageOn(h.dob, today);
    if (!(age >= 0 && age < 120)) throw new CheckoutProblem("dob", "dob");
    if (age < 18) throw new CheckoutProblem("underage", "dob");
    if (h.allergies.length < 2) throw new CheckoutProblem("allergies", "allergies");
    if (h.medications.length < 2) throw new CheckoutProblem("medications", "medications");
    if (!input.consents.medical) throw new CheckoutProblem("consent", "medical");
    const conditions = h.conditions.length > 1 ? h.conditions.filter((c) => c !== "none") : h.conditions;
    health = { ...h, conditions };
  }

  let fulfilment: Fulfilment = { mode: "clinic" };
  if (q.needsFulfilment) {
    const f = input.fulfilment;
    fulfilment = { mode: f.mode, notes: f.notes || undefined };
    if (f.mode === "address") {
      if (!f.area || !AREAS.includes(f.area)) throw new CheckoutProblem("area", "area");
      if (!f.address || f.address.length < 8) throw new CheckoutProblem("address", "address");
      fulfilment.area = f.area;
      fulfilment.address = f.address;
    }
    if (q.hasSession && (!f.date || !f.slot)) throw new CheckoutProblem(f.date ? "slot" : "date", f.date ? "slot" : "date");
    if (f.date) {
      if (f.date < today || f.date > addDays(today, BOOKING_DAYS_AHEAD)) throw new CheckoutProblem("date", "date");
      fulfilment.date = f.date;
      if (f.slot) {
        const endHour = Number(f.slot.slice(6, 8));
        const baliHour = new Date(now.getTime() + BALI_OFFSET_MIN * 60_000).getUTCHours();
        if (f.date === today && endHour <= baliHour) throw new CheckoutProblem("slot_passed", "slot");
        fulfilment.slot = f.slot;
      }
    }
  }

  let payment: PayMethod | undefined;
  if (!q.hasRx) {
    if (!input.payment || !methodInfo(input.payment)) throw new CheckoutProblem("payment", "payment");
    payment = input.payment;
  }
  return { q, fulfilment, health, payment };
}

/** Constant-time check of the secret in the customer's order link. */
export function tokenMatches(order: Order, token: string | null | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(order.token);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ (b[i % b.length] ?? 0);
  return diff === 0;
}
