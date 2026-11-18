import { z } from "zod";
import { SLOTS } from "./config";

export const LOCALE_CODES = ["en", "ru", "fr"] as const;

/** Conditions the doctor and nurse need to know about. "none" is the explicit "nothing applies" answer. */
export const CONDITIONS = ["heart", "blood_pressure", "kidney", "liver", "diabetes", "cancer", "clotting", "g6pd", "autoimmune", "pregnant", "none"] as const;
export type Condition = (typeof CONDITIONS)[number];

const text = (max: number) => z.string().trim().max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const cartItemSchema = z.object({ slug: z.string().min(1).max(60), qty: z.number().int().min(1).max(10) });
export type CartItem = z.infer<typeof cartItemSchema>;

export const healthSchema = z.object({
  dob: isoDate,
  sex: z.enum(["female", "male", "other"]),
  weightKg: z.number().min(30).max(250).optional(),
  conditions: z.array(z.enum(CONDITIONS)).min(1).max(CONDITIONS.length),
  allergies: text(500),
  medications: text(500),
  goals: text(1000),
});
export type Health = z.infer<typeof healthSchema>;

export const fulfilmentSchema = z.object({
  /** "clinic": visit or collect at the clinic. "address": nurse visit and/or delivery to a villa, hotel or home in Bali. */
  mode: z.enum(["clinic", "address"]),
  area: text(60).optional(),
  address: text(300).optional(),
  date: isoDate.optional(),
  slot: z.enum(SLOTS).optional(),
  notes: text(500).optional(),
});
export type Fulfilment = z.infer<typeof fulfilmentSchema>;

/** How the customer asked to pay at checkout (orders with prescription items choose after the doctor's approval). */
export const PAY_METHODS = ["xendit", "airwallex", "transfer", "cod"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export const checkoutSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(20),
  contact: z.object({
    name: text(120).min(2),
    email: z.email().max(200),
    phone: text(30).regex(/^\+?[\d\s().-]{7,}$/, "Enter a valid phone number"),
    locale: z.enum(LOCALE_CODES),
  }),
  fulfilment: fulfilmentSchema,
  health: healthSchema.optional(),
  payment: z.enum(PAY_METHODS).optional(),
  consents: z.object({
    terms: z.literal(true),
    adult: z.literal(true),
    medical: z.boolean(),
  }),
  /** Honeypot: real visitors leave it empty. */
  website: z.string().max(200).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const leadSchema = z.object({
  name: text(120).min(2),
  contact: text(200).min(5),
  topic: z.enum(["consult", "booking", "order", "membership", "other"]),
  message: text(2000).min(5),
  locale: z.enum(LOCALE_CODES),
  website: z.string().max(200).optional(),
});
export type LeadInput = z.infer<typeof leadSchema>;

export type OrderStatus =
  | "awaiting_review" // prescription items: waiting for the doctor
  | "awaiting_payment" // approved (or nothing to review): customer has to pay or choose pay-on-delivery
  | "payment_review" // bank transfer proof uploaded: staff check the bank account
  | "confirmed" // paid, or pay-on-delivery accepted: to be prepared and scheduled
  | "out_for_delivery" // courier or nurse on the way
  | "completed"
  | "declined" // doctor declined every item
  | "cancelled"
  | "refunded";

export const ORDER_STATUSES: OrderStatus[] = ["awaiting_review", "awaiting_payment", "payment_review", "confirmed", "out_for_delivery", "completed", "declined", "cancelled", "refunded"];

export interface OrderLine {
  slug: string;
  /** English name at the time of the order (the catalogue may change later). */
  name: string;
  kind: string;
  rx: boolean;
  session: boolean;
  qty: number;
  unitIdr: number;
}

export interface Activity { at: string; by: string; action: string; eventId?: string }

export interface Order {
  id: string;
  /** Secret part of the customer's order link. */
  token: string;
  createdAt: string;
  status: OrderStatus;
  lines: OrderLine[];
  /** Prescription lines the doctor did not approve. */
  removedLines?: OrderLine[];
  subtotalIdr: number;
  deliveryIdr: number;
  calloutIdr: number;
  totalIdr: number;
  contact: CheckoutInput["contact"];
  fulfilment: Fulfilment;
  health?: Health;
  paymentMethod?: PayMethod;
  paid: boolean;
  paidAt?: string;
  xenditInvoiceId?: string;
  xenditInvoiceUrl?: string;
  xenditInvoiceExpires?: string;
  airwallexIntentId?: string;
  /** Stored file id of the bank-transfer proof. */
  proofId?: string;
  review?: { by: string; at: string; decision: "approved" | "partly_approved" | "declined"; note?: string };
  opsNotes?: string;
  activity: Activity[];
}

export interface Lead extends Omit<LeadInput, "website"> {
  id: string;
  createdAt: string;
  handledAt?: string;
}

/** Age in whole years on a given day (both YYYY-MM-DD). */
export function ageOn(dob: string, today: string): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
