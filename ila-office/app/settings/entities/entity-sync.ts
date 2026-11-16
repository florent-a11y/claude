import type { Company, Entity, EntityType } from "@/lib/types";

/**
 * One client, two records: the directory record (`Company`) and its set of books (`Entity`), linked both ways by
 * `Company.entityId` / `Entity.crmCompanyId`. This file holds the pure rules of that pair: what each record looks like
 * when it is created from the other, which existing record is the same legal person (so nothing is created twice),
 * which legal details the two share and how a save on one side reaches the other. No database here (create-entity.ts
 * does the writing), so client components and tests can import it.
 */

/** Everything an entity needs except its id and timestamps (what the entity form collects). */
export type EntityInput = Omit<Entity, "id" | "createdAt" | "updatedAt" | "attachments" | "qboRealmId">;
/** A client company before it is stored. */
export type CompanyInput = Omit<Company, "id" | "createdAt" | "updatedAt" | "attachments">;

// ---------- Creating one record from the other ----------

/** Tax profile given to books created without the entity form: normal CIT (Hong Kong profits tax for HK Ltd, none for individuals), not PKP, LKPM only for a PT PMA, no payroll. */
export function defaultTaxProfile(type: EntityType): Entity["tax"] {
  return { regime: type === "hk_ltd" ? "hk_profits_tax" : type === "individual" ? "none" : "normal_22", pkp: false, ppnRate: 0.11, lkpm: type === "pt_pma", payroll: false };
}

/**
 * Default books profile for a client company: its legal details, the standard chart, IDR books starting in January and
 * the default tax profile above. The accountant refines the tax profile on the entity afterwards.
 */
export function entityInputFromCompany(company: Company): EntityInput {
  const type = company.type === "prospect" ? "other" : company.type;
  return {
    name: company.name, legalName: company.name, type, country: company.country || "ID", isOwn: false,
    npwp: company.npwp, nib: company.nib, aktaNumber: company.aktaNumber, address: company.address, region: company.region,
    baseCurrency: "IDR", fiscalYearStartMonth: 1,
    tax: defaultTaxProfile(type),
    crmCompanyId: company.id, driveFolderUrl: company.driveFolderUrl, status: "active",
  };
}

/** The directory record of a set of books created in Settings → Entities: an active client tagged "books", linked to the entity. */
export function companyInputFromEntity(entity: Entity): CompanyInput {
  return {
    name: entity.name, type: entity.type, country: entity.country || "ID", region: entity.region,
    npwp: entity.npwp, nib: entity.nib, aktaNumber: entity.aktaNumber, address: entity.address,
    entityId: entity.id, status: "active", subscriptions: [], driveFolderUrl: entity.driveFolderUrl, tags: ["books"],
  };
}

/** Active client companies with a legal form and no books yet: the ones the bulk "Create books" sets up. (The company form can create books for any company: a lead, even a prospect, when its box is ticked.) */
export function companyNeedsBooks(c: Company): boolean {
  return c.status === "active" && c.type !== "prospect" && !c.entityId;
}

/** Company form: the "ILA keeps the books" box is ticked by default for a new company with a legal form. */
export function booksByDefault(type: Company["type"]): boolean {
  return type !== "prospect";
}

/** The books box after the Type select changed: a prospect has no books; on the new-company form a prospect that gets a legal form gets books; otherwise the box stays as the user left it. */
export function booksBoxAfterTypeChange(checked: boolean, from: string, to: string, isNew: boolean): boolean {
  if (to === "prospect") return false;
  return isNew && from === "prospect" ? true : checked;
}

/** Books younger than this still show "review the tax profile" on the company page. */
export const BOOKS_REVIEW_DAYS = 7;

/** Books created less than a week ago that still carry the default tax profile of their type: someone should review it. */
export function booksNeedReview(entity: Pick<Entity, "createdAt" | "type" | "tax">, now: number = Date.now()): boolean {
  const age = now - Date.parse(entity.createdAt);
  if (!(age < BOOKS_REVIEW_DAYS * 864e5)) return false;
  const d = defaultTaxProfile(entity.type), t = entity.tax;
  return t.regime === d.regime && t.pkp === d.pkp && t.ppnRate === d.ppnRate && t.lkpm === d.lkpm && t.payroll === d.payroll && !t.pph25Monthly && !t.localTaxRate;
}

// ---------- Legal details shared by the two records ----------

/** Entered once, stored on both records. The name is shared too, with its own rule (see legalDetailsPatch). */
export const SHARED_LEGAL_FIELDS = ["npwp", "nib", "aktaNumber", "address", "region", "driveFolderUrl"] as const;
export type SharedLegalField = (typeof SHARED_LEGAL_FIELDS)[number];
/** What a company and an entity have in common (`legalName` exists on the entity only). */
export type LegalDetails = { name: string; legalName?: string } & { [K in SharedLegalField]?: string };
export type LegalDetailsPatch = Partial<LegalDetails>;

const blank = (v: string | undefined): boolean => !v || v.trim() === "";
const same = (a: string | undefined, b: string | undefined): boolean => (a ?? "").trim() === (b ?? "").trim();

/** Shared fields empty on `of` that `from` has: filling them loses nothing. Also used to show the counterpart's values on the edit forms. */
export function missingLegalDetails(of: LegalDetails, from: LegalDetails): LegalDetailsPatch {
  const patch: LegalDetailsPatch = {};
  for (const f of SHARED_LEGAL_FIELDS) if (blank(of[f]) && !blank(from[f])) patch[f] = from[f];
  return patch;
}

/**
 * What saving one record (`before` → `from`) changes on its counterpart `to`:
 * - a field edited in this save is copied, a cleared field is cleared (key present with `undefined`);
 * - a field left untouched is copied only where the counterpart has nothing, so a stale or empty value never
 *   overwrites the other record (two different values nobody touched stay as they are);
 * - a changed name becomes the counterpart's name; an entity's legal name follows only if it was the same as its name.
 * Returns only the fields that differ on `to`.
 */
export function legalDetailsPatch(from: LegalDetails, to: LegalDetails, before: LegalDetails): LegalDetailsPatch {
  const patch: LegalDetailsPatch = {};
  if (!same(from.name, before.name) && !same(from.name, to.name)) {
    patch.name = from.name;
    if (to.legalName !== undefined && to.legalName === to.name) patch.legalName = from.name;
  }
  for (const f of SHARED_LEGAL_FIELDS) {
    const edited = !same(from[f], before[f]);
    if (edited ? !same(from[f], to[f]) : blank(to[f]) && !blank(from[f])) patch[f] = blank(from[f]) ? undefined : from[f];
  }
  return patch;
}

// ---------- The same legal person, so nothing is created twice ----------

const nameKey = (s: string | undefined): string => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** NPWP digits in the 16-digit form (a 15-digit NPWP gets a leading 0); empty when it is not a full number. */
const npwpKey = (s: string | undefined): string => { const d = (s ?? "").replace(/\D/g, ""); return d.length === 15 ? `0${d}` : d.length === 16 ? d : ""; };

/** Same NPWP, or the same name (or legal name) ignoring case and punctuation. */
export function sameLegalPerson(a: LegalDetails, b: LegalDetails): boolean {
  const na = npwpKey(a.npwp), nb = npwpKey(b.npwp);
  if (na && na === nb) return true;
  const names = new Set([nameKey(a.name), nameKey(a.legalName)].filter(Boolean));
  return [nameKey(b.name), nameKey(b.legalName)].some((n) => n !== "" && names.has(n));
}

/** Entities that could already be the books of this company: not ILA's own, not linked to a company yet, same legal person. */
export function unlinkedBooksFor(company: Company, entities: Entity[]): Entity[] {
  return entities.filter((e) => !e.isOwn && !e.crmCompanyId && sameLegalPerson(company, e));
}

/** Client companies that could already be the directory record of this entity: no books yet, same legal person. */
export function unlinkedCompaniesFor(entity: Entity, companies: Company[]): Company[] {
  return companies.filter((c) => !c.entityId && sameLegalPerson(entity, c));
}
