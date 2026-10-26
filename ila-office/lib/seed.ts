import { db } from "./db";
import { buildAccounts } from "./coa";
import { catalogueItems, COMPANY } from "./catalogue";
import { todayISO } from "./dates";
import type { Company, Contact, Entity, Vendor } from "./types";

/**
 * Base data every installation needs (ILA's own entity with its chart of accounts, the price list, the vendor list)
 * and an optional fictional demo client. Idempotent: each block is skipped when its data already exists.
 * Used by `npm run seed` and by the first-administrator setup page.
 */

export async function seedBase(): Promise<string[]> {
  const done: string[] = [];
  const now = new Date().toISOString();
  const entities = await db.list("entities");
  if (!entities.some((e) => e.isOwn)) {
    const own: Entity = {
      id: db.newId(), name: "ILA Global Consulting", legalName: COMPANY.name, type: "pt_pma", country: "ID", isOwn: true, region: "Bali", city: "Badung",
      address: COMPANY.baliOffice, baseCurrency: "IDR", fiscalYearStartMonth: 1,
      tax: { regime: "normal_22", pkp: false, ppnRate: 0.11, lkpm: true, payroll: true }, status: "active", createdAt: now,
    };
    await db.insert("entities", own);
    await db.insertMany("accounts", buildAccounts(own.id, () => db.newId()));
    done.push("ILA entity and chart of accounts");
  }
  if ((await db.count("services")) === 0) {
    await db.insertMany("services", catalogueItems(() => db.newId()));
    done.push("price list");
  }
  if ((await db.count("vendors")) === 0) {
    const rows: Array<[string, Vendor["category"], string?]> = [
      ["Own arrangement", "other"], ["Tama (visa agent)", "agent"], ["Charles (visa agent)", "agent"], ["Chonas / Kitabantu", "agent"],
      ["BKPM Astika", "bkpm", "Bali"], ["BKPM Andi", "bkpm", "Jakarta"], ["Notary Yanti", "notary", "Lombok"], ["Notary Indra", "notary", "Jakarta"],
      ["Notary Aditya", "notary", "Sumba"], ["Notary Agung", "notary", "Bali"], ["Notary Wahyu", "notary", "Bali"], ["Notary Widhi", "notary", "Bali"],
      ["PUPR Pris", "pupr", "Bali"], ["PBG Petra", "pbg", "Bali"], ["OSS Rara", "oss"], ["SIM Dedy", "sim"], ["SKTT Esa", "sktt"], ["DORA Robert", "dora"],
      ["Kanim Rangga", "kanim", "Bali"], ["Kanim Ficki", "kanim", "Bali"], ["Kanim Yudi", "kanim", "Bali"], ["Kanim Erik", "kanim", "Bali"],
      ["Kanim Y Abra", "kanim", "Bali"], ["Kanim Yosep", "kanim", "Bali"], ["Bali One Stop", "agent", "Bali"], ["Bu Ninik (Kanim Ngurah Rai)", "kanim", "Bali"],
    ];
    await db.insertMany("vendors", rows.map(([name, category, region]) => ({ id: db.newId(), name, category, region, active: true, createdAt: now })));
    done.push("vendor list");
  }
  return done;
}

/** A fictional client (company, contact, entity with its own books and two subscriptions) to practise on. */
export async function seedDemoClient(): Promise<boolean> {
  if ((await db.count("companies")) > 0) return false;
  const now = new Date().toISOString();
  const today = todayISO();
  const contact: Contact = { id: db.newId(), firstName: "Camille", lastName: "Durand", email: "camille@example.com", phone: "+33 6 00 00 00 00", nationality: "FR", language: "fr", source: "referral", companyIds: [], tags: ["villa", "bali"], createdAt: now };
  const company: Company = { id: db.newId(), name: "PT Demo Villa Investama", type: "pt_pma", country: "ID", region: "Bali", primaryContactId: contact.id, status: "active", subscriptions: [], tags: ["demo"], createdAt: now, notes: "Fictional demo client created at setup. Safe to delete." };
  contact.companyIds = [company.id];
  await db.insert("contacts", contact);
  await db.insert("companies", company);
  const client: Entity = {
    id: db.newId(), name: company.name, legalName: "PT DEMO VILLA INVESTAMA", type: "pt_pma", country: "ID", isOwn: false, region: "Bali", baseCurrency: "IDR", fiscalYearStartMonth: 1,
    tax: { regime: "final_0_5", pkp: false, ppnRate: 0.11, lkpm: true, payroll: false }, crmCompanyId: company.id, status: "active", createdAt: now,
  };
  await db.insert("entities", client);
  await db.insertMany("accounts", buildAccounts(client.id, () => db.newId()));
  await db.update("companies", company.id, { entityId: client.id, subscriptions: [
    { serviceId: "", label: "Monthly tax compliance", amount: 1_500_000, currency: "IDR", cadence: "monthly", startedAt: today },
    { serviceId: "", label: "Monthly bookkeeping", amount: 1_000_000, currency: "IDR", cadence: "monthly", startedAt: today },
  ] });
  return true;
}
