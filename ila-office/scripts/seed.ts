/**
 * Seeds a development database: first admin, ILA's own entity with its chart of accounts, the service catalogue,
 * ILA's vendor list, and a fictional demo client (company, contact, deal, project, renewal, client entity).
 * Idempotent: skips anything that already exists. Run with `npm run seed`.
 */
import { existsSync } from "node:fs";
// `next dev` reads .env.local by itself; this script runs under plain Node, so load it here too.
for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
import { db } from "../lib/db";
import { hashPassword } from "../lib/password";
import { buildAccounts } from "../lib/coa";
import { catalogueItems, COMPANY } from "../lib/catalogue";
import { addMonths, todayISO } from "../lib/dates";
import type { Company, Contact, Deal, Entity, Project, Renewal, User, Vendor } from "../lib/types";

async function main() {
  const now = new Date().toISOString();
  const today = todayISO();

  // 1. Admin user
  const users = await db.list("users");
  let admin = users.find((u) => u.role === "admin");
  if (!admin) {
    const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@ila.local").toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD ?? "change-me-now-please";
    admin = { id: db.newId(), email, name: process.env.SEED_ADMIN_NAME ?? "ILA Admin", role: "admin", passwordHash: hashPassword(password), active: true, createdAt: now } satisfies User;
    await db.insert("users", admin);
    console.log(`admin user: ${email} / ${password}`);
  }

  // 2. ILA's own entity
  const entities = await db.list("entities");
  let own = entities.find((e) => e.isOwn);
  if (!own) {
    own = {
      id: db.newId(), name: "ILA Global Consulting", legalName: COMPANY.name, type: "pt_pma", country: "ID", isOwn: true, region: "Bali", city: "Badung",
      address: COMPANY.baliOffice, baseCurrency: "IDR", fiscalYearStartMonth: 1,
      tax: { regime: "normal_22", pkp: false, ppnRate: 0.11, lkpm: true, payroll: true }, status: "active", createdAt: now,
    } satisfies Entity;
    await db.insert("entities", own);
    await db.insertMany("accounts", buildAccounts(own.id, () => db.newId()));
    console.log("created ILA entity + chart of accounts");
  }

  // 3. Service catalogue
  if ((await db.count("services")) === 0) {
    await db.insertMany("services", catalogueItems(() => db.newId()));
    console.log("loaded service catalogue");
  }

  // 4. Vendors (names and categories from ILA's cost-of-sales vendor list; add phone numbers in the app)
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
    console.log("loaded vendors");
  }

  // 5. Demo client (fictional)
  if ((await db.count("companies")) === 0) {
    const contact: Contact = { id: db.newId(), firstName: "Camille", lastName: "Durand", email: "camille@example.com", phone: "+33 6 00 00 00 00", nationality: "FR", language: "fr", source: "referral", companyIds: [], tags: ["villa", "bali"], createdAt: now };
    const company: Company = { id: db.newId(), name: "PT Demo Villa Investama", type: "pt_pma", country: "ID", region: "Bali", primaryContactId: contact.id, status: "active", subscriptions: [], tags: ["demo"], createdAt: now, notes: "Fictional demo client created by the seed script." };
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
    const deal: Deal = { id: db.newId(), title: "Working KITAS for villa manager", companyId: company.id, contactId: contact.id, stage: "quotation_sent", amount: 43_000_000, currency: "IDR", category: "visa", ownerUserId: admin.id, createdAt: now };
    await db.insert("deals", deal);
    const project: Project = {
      id: db.newId(), number: await db.nextNumber("global", "P"), title: "Investor KITAS - Camille Durand", category: "visa", companyId: company.id, contactId: contact.id, status: "in_progress",
      ownerUserId: admin.id, subject: { name: "Camille Durand", nationality: "FR" }, feeAmount: 19_500_000, feeCurrency: "IDR",
      checklist: [
        { id: db.newId(), label: "Passport copy and photo received", done: true, doneAt: now }, { id: db.newId(), label: "Sponsor letter signed", done: true, doneAt: now },
        { id: db.newId(), label: "e-Visa application submitted", done: false }, { id: db.newId(), label: "Biometrics at Kanim", done: false }, { id: db.newId(), label: "KITAS issued and sent to client", done: false },
      ],
      costOfSales: [{ id: db.newId(), description: "PNBP Investor KITAS 2 years", vendorName: "Own arrangement", amountIDR: 7_000_000, approved: true, approvedByUserId: admin.id, approvedAt: now }],
      startedAt: today, dueDate: addMonths(today, 1), expiresAt: addMonths(today, 24), createdAt: now,
    };
    await db.insert("projects", project);
    const renewal: Renewal = { id: db.newId(), kind: "commercial_address", label: "Commercial address - PT Demo Villa Investama", companyId: company.id, expiresAt: addMonths(today, 2), reminderDays: 60, status: "upcoming", createdAt: now };
    await db.insert("renewals", renewal);
    console.log("created demo client with books, deal, project and renewal");
  }

  console.log("seed complete");
}

main().catch((e) => { console.error(e); process.exit(1); });
