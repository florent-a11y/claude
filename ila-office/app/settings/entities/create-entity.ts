import { db } from "@/lib/db";
import { buildAccounts } from "@/lib/coa";
import type { Company, Entity } from "@/lib/types";

/**
 * Creating a set of books, shared by Settings → Entities (form) and Clients → Companies ("create books" for one or
 * every client company). Not a "use server" module: the callers check permissions, this only writes.
 */

/** Everything an entity needs except its id and timestamps (what the entity form collects). */
export type EntityInput = Omit<Entity, "id" | "createdAt" | "updatedAt" | "attachments" | "qboRealmId">;

/** Inserts the entity, initialises its chart of accounts and links the CRM company back to it. */
export async function createEntityFromInput(input: EntityInput): Promise<Entity> {
  const now = new Date().toISOString();
  const entity: Entity = { ...input, id: db.newId(), createdAt: now };
  await db.insert("entities", entity);
  await db.insertMany("accounts", buildAccounts(entity.id, () => db.newId(), { country: entity.country }));
  if (entity.crmCompanyId) await db.update("companies", entity.crmCompanyId, { entityId: entity.id, updatedAt: now });
  return entity;
}

/**
 * Default books profile for a client company: its legal details, the standard chart, IDR books starting in January,
 * normal CIT (Hong Kong profits tax for HK Ltd, none for individuals), not PKP, LKPM only for a PT PMA, no payroll.
 * The accountant refines the tax profile on the entity afterwards.
 */
export function entityInputFromCompany(company: Company): EntityInput {
  const type = company.type === "prospect" ? "other" : company.type;
  return {
    name: company.name, legalName: company.name, type, country: company.country || "ID", isOwn: false,
    npwp: company.npwp, nib: company.nib, aktaNumber: company.aktaNumber, address: company.address, region: company.region,
    baseCurrency: "IDR", fiscalYearStartMonth: 1,
    tax: { regime: type === "hk_ltd" ? "hk_profits_tax" : type === "individual" ? "none" : "normal_22", pkp: false, ppnRate: 0.11, lkpm: type === "pt_pma", payroll: false },
    crmCompanyId: company.id, driveFolderUrl: company.driveFolderUrl, status: "active",
  };
}

/** Active client companies with a legal form and no books yet: the ones "Create books" would set up. */
export function companyNeedsBooks(c: Company): boolean {
  return c.status === "active" && c.type !== "prospect" && !c.entityId;
}
