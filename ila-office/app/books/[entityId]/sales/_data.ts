import { db } from "@/lib/db";
import { fullName } from "@/lib/util";
import type { CustomerOpt, ServiceOpt } from "./InvoiceForm";
import type { Entity } from "@/lib/types";

/** Customers come from the CRM: companies first (the entity's own client excluded when billing from a client's books is unusual), then contacts. */
export async function customerOptions(): Promise<CustomerOpt[]> {
  const [companies, contacts] = await Promise.all([db.list("companies", { orderBy: "name" }), db.list("contacts", { orderBy: "lastName" })]);
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const out: CustomerOpt[] = companies.map((c) => ({ key: `company:${c.id}`, type: "company", id: c.id, name: c.name, email: c.primaryContactId ? contactById.get(c.primaryContactId)?.email : undefined, npwp: c.npwp, address: c.address }));
  for (const c of contacts) out.push({ key: `contact:${c.id}`, type: "contact", id: c.id, name: fullName(c) || c.email || c.id, email: c.email });
  return out;
}

export async function serviceOptions(entity: Entity): Promise<ServiceOpt[]> {
  if (!entity.isOwn) return [];
  const services = await db.list("services", { where: { active: true }, orderBy: "sortOrder" });
  return services.map((s) => ({ id: s.id, name: s.name, priceIDR: s.priceIDR, priceUSD: s.priceUSD, priceEUR: s.priceEUR, taxTreatment: s.taxTreatment }));
}

export async function defaultPaymentInstructions(entityId: string): Promise<string> {
  const banks = await db.list("bank_accounts", { where: { entityId, active: true } });
  if (banks.length === 0) return "Payment by bank transfer within 3 working days.";
  return ["Payment by bank transfer within 3 working days to:", ...banks.map((b) => `${b.bankName ?? b.name} ${b.accountNumber ?? ""} (${b.currency})`.trim())].join("\n");
}
