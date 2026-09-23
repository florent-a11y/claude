import { z } from "zod";

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
});

export const orderInputSchema = z.object({
  product: productSchema.default("arrival_card"),
  travelers: z.array(travelerSchema).min(1).max(10),
  travel: travelSchema,
  declarations: declarationsSchema,
  evoa: evoaSchema.optional(),
  contact: contactSchema,
}).superRefine((o, ctx) => {
  if (o.product !== "arrival_card") {
    if (!o.evoa) { ctx.addIssue({ code: "custom", path: ["evoa"], message: "e-VOA details are required" }); return; }
    const missing = o.travelers.map((_, i) => i).filter((i) => !o.evoa!.documents.some((d) => d.travelerIndex === i));
    if (missing.length) ctx.addIssue({ code: "custom", path: ["evoa", "documents"], message: `Documents missing for traveler ${missing.map((i) => i + 1).join(", ")}` });
  }
});

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
}
