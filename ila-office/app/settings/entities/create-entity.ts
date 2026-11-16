import { db } from "@/lib/db";
import { buildAccounts } from "@/lib/coa";
import type { Company, Entity } from "@/lib/types";
import {
  companyInputFromEntity, entityInputFromCompany, legalDetailsPatch, missingLegalDetails, unlinkedBooksFor, unlinkedCompaniesFor, type EntityInput,
} from "./entity-sync";

/**
 * A client is created once and exists everywhere: its directory record (Clients → Client companies) and its set of
 * books (Books, Tax, Payroll, the entity picker) are two rows that are always created together and linked both ways.
 * Shared by the company form, Settings → Entities, the bulk "create books" action and the imports. Not a "use server"
 * module: the callers check permissions, this only writes. The pure rules live in entity-sync.ts (re-exported here).
 */

export { companyNeedsBooks, entityInputFromCompany, type EntityInput } from "./entity-sync";

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
 * The books of a client company, created only if they do not exist: an entity that already points at the company, or
 * the one unlinked entity with the same NPWP or name, is linked instead of duplicated (several candidates: an error
 * naming them, nothing is guessed). New books get the default profile of entityInputFromCompany. Idempotent, so the
 * company form, the bulk action and the imports can all call it; `entities` avoids re-reading the table in a loop.
 */
export async function ensureBooksForCompany(company: Company, entities?: Entity[]): Promise<{ entity: Entity; created: boolean }> {
  const now = new Date().toISOString();
  const all = entities ?? await db.list("entities");
  const current = all.find((e) => e.id === company.entityId);
  if (current) return { entity: current, created: false };
  const pointing = all.find((e) => e.crmCompanyId === company.id);
  if (pointing) {
    await db.update("companies", company.id, { entityId: pointing.id, updatedAt: now });
    return { entity: pointing, created: false };
  }
  const candidates = unlinkedBooksFor(company, all);
  if (candidates.length > 1) throw new Error(`${candidates.length} entities without a client company look like ${company.name} (same name or NPWP): open the right one in Settings → Entities and pick this company under "Client company"`);
  const match = candidates[0];
  if (match) {
    // Pairing two existing records: each one's empty legal details are filled from the other, nothing is overwritten.
    const patch = { ...missingLegalDetails(match, company), crmCompanyId: company.id, updatedAt: now };
    await db.update("entities", match.id, patch);
    await db.update("companies", company.id, { ...missingLegalDetails(company, match), entityId: match.id, updatedAt: now });
    Object.assign(match, patch); // also keeps a caller's list from offering these books to another company
    return { entity: match, created: false };
  }
  return { entity: await createEntityFromInput(entityInputFromCompany(company)), created: true };
}

/**
 * The directory record of a set of books, created only if it does not exist (never for ILA's own entity: null). A client
 * company without books that is the same legal person (same NPWP or name) is linked instead of duplicated; several
 * candidates raise an error naming the remedy.
 */
export async function ensureCompanyForEntity(entity: Entity): Promise<{ company: Company; created: boolean } | null> {
  if (entity.isOwn) return null;
  const now = new Date().toISOString();
  const companies = await db.list("companies");
  const current = companies.find((c) => c.id === entity.crmCompanyId) ?? companies.find((c) => c.entityId === entity.id);
  if (current) {
    if (current.entityId !== entity.id) await db.update("companies", current.id, { entityId: entity.id, updatedAt: now });
    if (entity.crmCompanyId !== current.id) await db.update("entities", entity.id, { crmCompanyId: current.id, updatedAt: now });
    return { company: current, created: false };
  }
  const candidates = unlinkedCompaniesFor(entity, companies);
  if (candidates.length > 1) throw new Error(`${candidates.length} client companies without books look like ${entity.name} (same name or NPWP): pick the right one under "Client company"`);
  const match = candidates[0];
  if (match) {
    const patch = { ...missingLegalDetails(match, entity), entityId: entity.id, updatedAt: now };
    await db.update("companies", match.id, patch);
    await db.update("entities", entity.id, { ...missingLegalDetails(entity, match), crmCompanyId: match.id, updatedAt: now });
    return { company: { ...match, ...patch }, created: false };
  }
  const company: Company = { ...companyInputFromEntity(entity), id: db.newId(), createdAt: now };
  await db.insert("companies", company);
  await db.update("entities", entity.id, { crmCompanyId: company.id });
  return { company, created: true };
}

/**
 * Shared legal details are entered once. Call it after a company or an entity was saved, with the row before and after
 * the save: what the save changed (name, NPWP, NIB, deed, address, region, Drive folder) is copied to the linked
 * record, and a field empty on one side is filled from the other (rules in legalDetailsPatch). Only for a pair linked
 * both ways. Writes with db.update, never through the server actions, so a sync cannot trigger another one.
 */
export async function syncLegalDetails(saved: { company: Company; before: Company } | { entity: Entity; before: Entity }): Promise<void> {
  const now = new Date().toISOString();
  if ("company" in saved) {
    const { company, before } = saved;
    const entity = company.entityId ? await db.get("entities", company.entityId) : null;
    if (!entity || entity.crmCompanyId !== company.id) return;
    const theirs = legalDetailsPatch(company, entity, before);
    const mine = missingLegalDetails(company, { ...entity, ...theirs });
    if (Object.keys(theirs).length) await db.update("entities", entity.id, { ...theirs, updatedAt: now });
    if (Object.keys(mine).length) await db.update("companies", company.id, mine);
    return;
  }
  const { entity, before } = saved;
  const company = entity.crmCompanyId ? await db.get("companies", entity.crmCompanyId) : null;
  if (!company || company.entityId !== entity.id) return;
  const theirs = legalDetailsPatch(entity, company, before);
  const mine = missingLegalDetails(entity, { ...company, ...theirs });
  if (Object.keys(theirs).length) await db.update("companies", company.id, { ...theirs, updatedAt: now });
  if (Object.keys(mine).length) await db.update("entities", entity.id, mine);
}
