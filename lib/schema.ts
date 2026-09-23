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

export const contactSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(6).max(20),
  whatsapp: z.boolean(),
  express: z.boolean(),
  acceptTerms: z.literal(true, { message: "You must accept the terms" }),
  acknowledgeFree: z.literal(true, { message: "Please confirm you understand the official form is free" }),
});

export const orderInputSchema = z.object({
  travelers: z.array(travelerSchema).min(1).max(10),
  travel: travelSchema,
  declarations: declarationsSchema,
  contact: contactSchema,
});

export type Traveler = z.infer<typeof travelerSchema>;
export type Travel = z.infer<typeof travelSchema>;
export type Declarations = z.infer<typeof declarationsSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type OrderInput = z.infer<typeof orderInputSchema>;

export type OrderStatus = "pending_payment" | "paid" | "in_progress" | "delivered" | "refunded" | "cancelled";

export interface Order extends OrderInput {
  id: string;
  createdAt: string;
  status: OrderStatus;
  amountCents: number;
  currency: string;
  airwallexIntentId?: string;
  paidAt?: string;
  deliveredAt?: string;
  opsNotes?: string;
}
