import { db } from "@/lib/db";
import { fullName } from "@/lib/util";
import type { VendorOpt } from "./BillForm";

/** Vendors from the vendor list, plus CRM companies and contacts (resident directors, landlords…). */
export async function vendorOptions(): Promise<VendorOpt[]> {
  const [vendors, companies, contacts] = await Promise.all([db.list("vendors", { where: { active: true }, orderBy: "name" }), db.list("companies", { orderBy: "name" }), db.list("contacts", { orderBy: "lastName" })]);
  return [
    ...vendors.map((v) => ({ key: `vendor:${v.id}`, type: "vendor" as const, id: v.id, name: v.name, npwp: v.npwp, country: "ID" })),
    ...companies.map((c) => ({ key: `company:${c.id}`, type: "company" as const, id: c.id, name: c.name, npwp: c.npwp, country: c.country })),
    ...contacts.map((c) => ({ key: `contact:${c.id}`, type: "contact" as const, id: c.id, name: fullName(c) || c.email || c.id, country: c.nationality })),
  ];
}
