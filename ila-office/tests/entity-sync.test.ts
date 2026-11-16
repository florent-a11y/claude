import { test } from "node:test";
import assert from "node:assert/strict";
import type { Company, Entity } from "../lib/types";
import {
  BOOKS_REVIEW_DAYS, SHARED_LEGAL_FIELDS, booksBoxAfterTypeChange, booksByDefault, booksNeedReview, companyInputFromEntity, companyNeedsBooks,
  defaultTaxProfile, entityInputFromCompany, legalDetailsPatch, missingLegalDetails, sameLegalPerson, unlinkedBooksFor, unlinkedCompaniesFor,
} from "../app/settings/entities/entity-sync";

/**
 * One client, two records (directory company + set of books): the pure rules of app/settings/entities/entity-sync.ts.
 * Synthetic data only.
 */

const NOW = "2026-11-16T03:00:00.000Z";
const company = (over: Partial<Company> = {}): Company => ({
  id: "co-1", name: "PT Sample Alpha", type: "pt_pma", country: "ID", region: "Bali", npwp: "01.234.567.8-901.000", nib: "1234567890123",
  aktaNumber: "AHU-0001", address: "Jl. Contoh 1, Denpasar", status: "active", subscriptions: [], driveFolderUrl: "https://drive.example.com/alpha",
  tags: [], createdAt: NOW, ...over,
});
const entity = (over: Partial<Entity> = {}): Entity => ({
  id: "en-1", name: "PT Sample Alpha", legalName: "PT Sample Alpha", type: "pt_pma", country: "ID", isOwn: false, region: "Bali",
  npwp: "01.234.567.8-901.000", nib: "1234567890123", aktaNumber: "AHU-0001", address: "Jl. Contoh 1, Denpasar", baseCurrency: "IDR",
  fiscalYearStartMonth: 1, tax: defaultTaxProfile("pt_pma"), driveFolderUrl: "https://drive.example.com/alpha", status: "active", createdAt: NOW, ...over,
});

// ---------- Creating one record from the other ----------

test("entityInputFromCompany: legal details, IDR books from January, linked to the company, default tax profile", () => {
  const c = company();
  const e = entityInputFromCompany(c);
  assert.deepEqual(e, {
    name: "PT Sample Alpha", legalName: "PT Sample Alpha", type: "pt_pma", country: "ID", isOwn: false,
    npwp: c.npwp, nib: c.nib, aktaNumber: c.aktaNumber, address: c.address, region: "Bali",
    baseCurrency: "IDR", fiscalYearStartMonth: 1,
    tax: { regime: "normal_22", pkp: false, ppnRate: 0.11, lkpm: true, payroll: false },
    crmCompanyId: "co-1", driveFolderUrl: c.driveFolderUrl, status: "active",
  });
});

test("entityInputFromCompany: the tax profile follows the legal form; a prospect becomes type other", () => {
  assert.deepEqual(entityInputFromCompany(company({ type: "pt_pmdn" })).tax, { regime: "normal_22", pkp: false, ppnRate: 0.11, lkpm: false, payroll: false });
  assert.equal(entityInputFromCompany(company({ type: "cv" })).tax.lkpm, false);
  assert.equal(entityInputFromCompany(company({ type: "hk_ltd", country: "HK" })).tax.regime, "hk_profits_tax");
  assert.equal(entityInputFromCompany(company({ type: "hk_ltd", country: "HK" })).country, "HK");
  assert.equal(entityInputFromCompany(company({ type: "individual" })).tax.regime, "none");
  const prospect = entityInputFromCompany(company({ type: "prospect", country: "" }));
  assert.equal(prospect.type, "other");
  assert.equal(prospect.country, "ID", "no country falls back to Indonesia");
  assert.deepEqual(prospect.tax, defaultTaxProfile("other"));
});

test("companyInputFromEntity: an active client tagged books, linked to the entity, with its legal details", () => {
  const e = entity({ name: "Sample Beta", legalName: "PT SAMPLE BETA INVESTAMA", type: "pt_pmdn", region: "Lombok", city: "Mataram" });
  assert.deepEqual(companyInputFromEntity(e), {
    name: "Sample Beta", type: "pt_pmdn", country: "ID", region: "Lombok", npwp: e.npwp, nib: e.nib, aktaNumber: e.aktaNumber, address: e.address,
    entityId: "en-1", status: "active", subscriptions: [], driveFolderUrl: e.driveFolderUrl, tags: ["books"],
  });
});

test("the two creation paths agree: a company made from an entity describes the same books", () => {
  const e = entity({ type: "cv", region: "Sumba" });
  const back = entityInputFromCompany({ ...companyInputFromEntity(e), id: "co-9", createdAt: NOW });
  for (const f of ["name", "type", "country", ...SHARED_LEGAL_FIELDS] as const) assert.equal(back[f], e[f], f);
  assert.equal(back.crmCompanyId, "co-9");
});

test("companyNeedsBooks: the bulk rule is active, with a legal form, without books", () => {
  assert.equal(companyNeedsBooks(company()), true);
  assert.equal(companyNeedsBooks(company({ entityId: "en-1" })), false, "already has books");
  assert.equal(companyNeedsBooks(company({ type: "prospect" })), false, "not incorporated yet");
  assert.equal(companyNeedsBooks(company({ status: "lead" })), false, "leads only get books from the form box");
  assert.equal(companyNeedsBooks(company({ status: "inactive" })), false);
});

test("books box on the company form: ticked for a legal form, follows the type, stays a user choice", () => {
  assert.equal(booksByDefault("prospect"), false);
  assert.equal(booksByDefault("pt_pma"), true);
  assert.equal(booksByDefault("individual"), true);
  // New company: prospect → legal form ticks it, back to prospect unticks it.
  assert.equal(booksBoxAfterTypeChange(false, "prospect", "pt_pma", true), true);
  assert.equal(booksBoxAfterTypeChange(true, "pt_pma", "prospect", true), false);
  // Between two legal forms the user's choice is kept.
  assert.equal(booksBoxAfterTypeChange(false, "pt_pma", "cv", true), false);
  assert.equal(booksBoxAfterTypeChange(true, "pt_pma", "cv", true), true);
  // Edit form: never ticked by the script (ticking creates books), still unticked for a prospect.
  assert.equal(booksBoxAfterTypeChange(false, "prospect", "pt_pma", false), false);
  assert.equal(booksBoxAfterTypeChange(true, "cv", "prospect", false), false);
});

test("booksNeedReview: books younger than a week that still carry the default tax profile", () => {
  const now = Date.parse(NOW);
  const day = 864e5;
  assert.equal(booksNeedReview(entity(), now), true, "just created");
  assert.equal(booksNeedReview(entity({ createdAt: new Date(now - (BOOKS_REVIEW_DAYS - 1) * day).toISOString() }), now), true);
  assert.equal(booksNeedReview(entity({ createdAt: new Date(now - BOOKS_REVIEW_DAYS * day).toISOString() }), now), false, "a week old");
  assert.equal(booksNeedReview(entity({ tax: { ...defaultTaxProfile("pt_pma"), pkp: true } }), now), false, "profile already set");
  assert.equal(booksNeedReview(entity({ tax: { ...defaultTaxProfile("pt_pma"), regime: "final_0_5" } }), now), false);
  assert.equal(booksNeedReview(entity({ tax: { ...defaultTaxProfile("pt_pma"), pph25Monthly: 500_000 } }), now), false);
  assert.equal(booksNeedReview(entity({ type: "individual", tax: defaultTaxProfile("individual") }), now), true, "default of its own type");
  assert.equal(booksNeedReview(entity({ type: "individual", tax: defaultTaxProfile("pt_pma") }), now), false);
});

// ---------- Shared legal details ----------

test("legalDetailsPatch: what the save changed is copied, a cleared field is cleared, the rest is left alone", () => {
  const before = company();
  const e = entity();
  assert.deepEqual(legalDetailsPatch(before, e, before), {}, "nothing changed, nothing to copy");
  const after = company({ npwp: "09.876.543.2-109.000", address: undefined, region: "Lombok" });
  assert.deepEqual(legalDetailsPatch(after, e, before), { npwp: "09.876.543.2-109.000", address: undefined, region: "Lombok" });
  assert.ok("address" in legalDetailsPatch(after, e, before), "the cleared field is in the patch so db.update removes it");
});

test("legalDetailsPatch: a stale or empty value nobody touched never overwrites the other record", () => {
  // The directory record was filled in loosely, the books carry the NPWP used on tax filings.
  const loose = company({ npwp: undefined, nib: "0000000000000", address: "" });
  const e = entity();
  // Saving the company for another reason (a tag, the owner) must not wipe or replace the entity's details.
  assert.deepEqual(legalDetailsPatch(loose, e, loose), {});
  // …and what the company lacks comes back from the books.
  assert.deepEqual(missingLegalDetails(loose, e), { npwp: e.npwp, address: e.address });
  // A field the counterpart lacks is filled even when this save did not touch it.
  const bare = entity({ aktaNumber: undefined, driveFolderUrl: undefined });
  assert.deepEqual(legalDetailsPatch(loose, bare, loose), { aktaNumber: "AHU-0001", driveFolderUrl: "https://drive.example.com/alpha" });
});

test("legalDetailsPatch: a renamed company renames its entity; the legal name follows only when it was the same", () => {
  const before = company();
  const after = company({ name: "PT Sample Alpha Bali" });
  assert.deepEqual(legalDetailsPatch(after, entity(), before), { name: "PT Sample Alpha Bali", legalName: "PT Sample Alpha Bali" });
  assert.deepEqual(legalDetailsPatch(after, entity({ legalName: "PT SAMPLE ALPHA INVESTAMA" }), before), { name: "PT Sample Alpha Bali" }, "a legal name typed on its own is kept");
  // An entity that deliberately carries another short name keeps it until someone renames one of the two.
  assert.deepEqual(legalDetailsPatch(before, entity({ name: "Alpha" }), before), {});
});

test("legalDetailsPatch: an entity save reaches the company (name, never a legal name)", () => {
  const before = entity();
  const after = entity({ name: "PT Sample Alpha Bali", legalName: "PT SAMPLE ALPHA BALI", nib: "9999999999999" });
  const patch = legalDetailsPatch(after, company(), before);
  assert.deepEqual(patch, { name: "PT Sample Alpha Bali", nib: "9999999999999" });
  assert.equal("legalName" in patch, false);
  // Only the legal name changed: the company has no such field, nothing to copy.
  assert.deepEqual(legalDetailsPatch(entity({ legalName: "PT SAMPLE ALPHA TBK" }), company(), before), {});
});

test("a sync settles: after one save both records agree and the reverse direction has nothing left to do", () => {
  const before = company({ nib: undefined });
  const after = company({ nib: undefined, name: "PT Sample Alpha Bali", address: "Jl. Contoh 2, Ubud" });
  const e0 = entity({ aktaNumber: undefined });
  // What create-entity.ts syncLegalDetails does: push the save to the entity, then fill the company's blanks from it.
  const e1 = { ...e0, ...legalDetailsPatch(after, e0, before) };
  const c1 = { ...after, ...missingLegalDetails(after, e1) };
  assert.equal(e1.name, "PT Sample Alpha Bali");
  assert.equal(e1.address, "Jl. Contoh 2, Ubud");
  assert.equal(e1.aktaNumber, "AHU-0001", "blank on the entity, filled from the company");
  assert.equal(c1.nib, "1234567890123", "blank on the company, filled from the entity");
  for (const f of ["name", ...SHARED_LEGAL_FIELDS] as const) assert.equal(c1[f], e1[f], f);
  assert.deepEqual(legalDetailsPatch(e1, c1, e1), {});
  assert.deepEqual(legalDetailsPatch(c1, e1, c1), {});
  assert.deepEqual(missingLegalDetails(c1, e1), {});
});

// ---------- Nothing is created twice ----------

test("sameLegalPerson: same NPWP (15 or 16 digits, any punctuation) or same name ignoring case and punctuation", () => {
  assert.ok(sameLegalPerson({ name: "PT Sample Alpha" }, { name: "pt. sample  alpha" }));
  assert.ok(sameLegalPerson({ name: "Alpha", legalName: "PT SAMPLE ALPHA" }, { name: "PT Sample Alpha" }), "legal name counts");
  assert.ok(sameLegalPerson({ name: "One", npwp: "01.234.567.8-901.000" }, { name: "Another", npwp: "0012345678901000" }), "15-digit NPWP = 16-digit with a leading 0");
  assert.equal(sameLegalPerson({ name: "PT Sample Alpha" }, { name: "PT Sample Beta" }), false);
  assert.equal(sameLegalPerson({ name: "PT Sample Alpha", npwp: "123" }, { name: "PT Sample Beta", npwp: "123" }), false, "an incomplete NPWP proves nothing");
  assert.equal(sameLegalPerson({ name: "PT Sample Alpha", npwp: "" }, { name: "PT Sample Beta", npwp: undefined }), false);
});

test("unlinkedBooksFor / unlinkedCompaniesFor: only free records of the same legal person, never ILA's own entity", () => {
  const c = company();
  const free = entity({ id: "en-free" });
  const taken = entity({ id: "en-taken", crmCompanyId: "co-2" });
  const own = entity({ id: "en-own", isOwn: true });
  const other = entity({ id: "en-other", name: "PT Sample Beta", legalName: "PT Sample Beta", npwp: "02.345.678.9-012.000" });
  assert.deepEqual(unlinkedBooksFor(c, [free, taken, own, other]).map((e) => e.id), ["en-free"]);
  assert.deepEqual(unlinkedBooksFor(c, [taken, own, other]), [], "no candidate: new books are created");
  const dup = entity({ id: "en-dup", name: "Sample Alpha (old)", legalName: "PT SAMPLE ALPHA" });
  assert.equal(unlinkedBooksFor(c, [free, dup]).length, 2, "two candidates: the caller refuses to guess");

  const e = entity({ id: "en-new", name: "PT Sample Beta", legalName: "PT SAMPLE BETA", npwp: undefined });
  const withBooks = company({ id: "co-a", name: "PT Sample Beta", entityId: "en-x" });
  const without = company({ id: "co-b", name: "Pt Sample Beta", npwp: undefined });
  assert.deepEqual(unlinkedCompaniesFor(e, [company(), withBooks, without]).map((x) => x.id), ["co-b"]);
});
