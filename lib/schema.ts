import { z } from "zod";
import { todayJakarta } from "./window";
import { LOCALES } from "@/i18n/routing";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const travelerSchema = z.object({
  givenNames: z.string().min(1, "Required").max(80),
  familyName: z.string().min(1, "Required").max(80),
  gender: z.enum(["M", "F", "X"]),
  dateOfBirth: date,
  nationality: z.string().length(2),
  passportNumber: z.string().min(5, "Check passport number").max(20),
  passportIssued: date,
  passportExpiry: date,
});

export const travelSchema = z.object({
  arrivalDate: date,
  departureDate: date.optional().or(z.literal("")),
  portOfEntry: z.string().min(1),
  transportMode: z.enum(["air", "sea", "land"]),
  flightNumber: z.string().max(12).optional().or(z.literal("")),
  originCountry: z.string().length(2),
  purpose: z.string().min(1),
  visaType: z.string().min(1),
  accommodationName: z.string().min(2, "Required").max(120),
  accommodationAddress: z.string().min(5, "Required").max(240),
  accommodationCity: z.string().min(2, "Required").max(80),
});

export const declarationsSchema = z.object({
  countriesVisited21d: z.array(z.string().length(2)).max(10),
  symptoms: z.boolean(),
  animalsPlants: z.boolean(),
  cashOver100M: z.boolean(),
  goodsOverAllowance: z.boolean(),
  commercialGoods: z.boolean(),
  registerImei: z.boolean(),
  baggagePieces: z.number().int().min(0).max(30),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const productSchema = z.enum(["arrival_card", "evoa", "bundle"]);

/** e-VOA specific data. Documents are upload ids returned by /api/uploads. */
export const evoaSchema = z.object({
  intendedEntryDate: date,
  purpose: z.enum(["tourism", "business", "family", "transit", "official"]),
  returnTicket: z.boolean(),
  documents: z.array(z.object({
    travelerIndex: z.number().int().min(0).max(9),
    passportScanId: z.string().min(1, "Passport scan is required"),
    photoId: z.string().min(1, "Passport photo is required"),
  })).min(1),
});

export const contactSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(6).max(20),
  whatsapp: z.boolean().optional().default(false),
  express: z.boolean(),
  acceptTerms: z.literal(true, { message: "You must accept the terms" }),
  acknowledgeNotGov: z.literal(true, { message: "Please confirm you understand this is not a government website" }),
  /** Language the customer used on the site; customer emails are sent in it. */
  locale: z.enum(LOCALES).default("en"),
});

/**
 * Ad attribution captured in the browser (lib/analytics-client.ts) and completed by the server (ip, userAgent).
 * Used only to send the paid conversion back to GA4 / Meta (lib/tracking.ts). Every field is optional.
 */
const attr = z.string().trim().max(200);
export const attributionSchema = z.object({
  /** Cookie-consent decision in the browser ("granted" | "denied" | "unknown"); the API routes prefer the `consent` cookie. */
  consent: z.enum(["granted", "denied", "unknown"]),
  gaClientId: attr,
  fbp: attr,
  fbc: attr,
  gclid: attr,
  fbclid: attr,
  utmSource: attr,
  utmMedium: attr,
  utmCampaign: attr,
  landingPage: attr,
  userAgent: attr,
  /** Server-side only: first value of x-forwarded-for. */
  ip: attr,
}).partial();
export type Attribution = z.infer<typeof attributionSchema>;

export const orderInputSchema = z.object({
  product: productSchema.default("arrival_card"),
  travelers: z.array(travelerSchema).min(1).max(10),
  travel: travelSchema,
  declarations: declarationsSchema,
  evoa: evoaSchema.optional(),
  contact: contactSchema,
  attribution: attributionSchema.optional(),
}).superRefine((o, ctx) => {
  if (o.product !== "arrival_card") {
    if (!o.evoa) { ctx.addIssue({ code: "custom", path: ["evoa"], message: "e-VOA details are required" }); return; }
    const missing = o.travelers.map((_, i) => i).filter((i) => !o.evoa!.documents.some((d) => d.travelerIndex === i));
    if (missing.length) ctx.addIssue({ code: "custom", path: ["evoa", "documents"], message: `Documents missing for traveler ${missing.map((i) => i + 1).join(", ")}` });
  }
});

/** Reminder list ("waitlist"): travelers who arrive in more than 72 hours leave their email and we tell them when to apply. */
export const reminderInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  arrivalDate: date.refine((v) => v >= todayJakarta(), "Arrival date must be today or in the future"),
  travelers: z.coerce.number().int().min(1).max(10).default(1),
  nationality: z.string().trim().toUpperCase().length(2).optional().or(z.literal("")),
  productInterest: productSchema.default("arrival_card"),
  locale: z.enum(LOCALES).default("en"),
  source: z.string().trim().max(60).optional().or(z.literal("")),
  consent: z.literal(true, { message: "Please agree to receive the reminder email" }),
  /** Honeypot: real users never see or fill this field. */
  website: z.literal("").optional(),
  attribution: attributionSchema.optional(),
});

export type ReminderInput = z.infer<typeof reminderInputSchema>;

export interface Reminder {
  id: string;
  email: string;
  arrivalDate: string;
  travelers: number;
  nationality?: string;
  productInterest: Product;
  locale: string;
  source?: string;
  createdAt: string;
  notifiedAt?: string;
  notifiedEarlyAt?: string;
  unsubscribedAt?: string;
  convertedOrderId?: string;
  /** Random token used in the unsubscribe and prefill links. */
  token: string;
  attribution?: Attribution;
}

export type ReminderStatus = "waiting" | "notified" | "unsubscribed" | "converted";
export function reminderStatus(r: Reminder): ReminderStatus {
  if (r.convertedOrderId) return "converted";
  if (r.unsubscribedAt) return "unsubscribed";
  if (r.notifiedAt) return "notified";
  return "waiting";
}

export type Traveler = z.infer<typeof travelerSchema>;
export type Travel = z.infer<typeof travelSchema>;
export type Declarations = z.infer<typeof declarationsSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type Evoa = z.infer<typeof evoaSchema>;
export type Product = z.infer<typeof productSchema>;
export type OrderInput = z.infer<typeof orderInputSchema>;

export const ORDER_STATUSES = ["pending_payment", "paid", "acknowledged", "in_progress", "submitted", "delivered", "refunded", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid: "New (paid)",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  submitted: "Submitted to portal",
  delivered: "Delivered",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

/** Statuses that still need work from the team. */
export const OPEN_STATUSES: OrderStatus[] = ["paid", "acknowledged", "in_progress", "submitted"];

export interface Activity { at: string; by: string; action: string; note?: string }

export interface Order extends OrderInput {
  id: string;
  governmentFeeCents: number;
  createdAt: string;
  status: OrderStatus;
  amountCents: number;
  currency: string;
  airwallexIntentId?: string;
  paidAt?: string;
  deliveredAt?: string;
  opsNotes?: string;
  assignee?: string;
  acknowledgedAt?: string;
  activity?: Activity[];
  /** Ids (private bucket) of the files sent to the customer at delivery. */
  deliveredDocuments?: string[];
  /** When the "how was your arrival?" review request email went out (cron, 2 days after arrival). */
  reviewRequestedAt?: string;
  /** Set when the order was already too old for a review request (never nag late). */
  reviewSkipped?: boolean;
  /** Set once the server-side purchase conversions (GA4 + Meta) have been attempted; see lib/tracking.ts. */
  trackingSentAt?: string;
}
