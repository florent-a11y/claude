/**
 * Runs the migration imports against the store: parses the file with lib/importers.ts, dedupes against existing
 * rows, resolves links (contacts ↔ companies, invoices ↔ customers, owners ↔ users), writes the rows and records
 * an ImportBatch. `prepareImport` is the dry run shown on the preview screen; `commitImport` writes the same plan.
 *
 * QBO invoices land in ILA's own entity (isOwn) as Invoice rows keyed by qboDocNumber. Optionally each invoice is
 * posted as Dr Accounts receivable / Cr Service revenue (IDR at the rate given per currency). An invoice whose
 * qboDocNumber already exists is never inserted or posted again.
 */
import { db } from "./db";
import { postJournal } from "./posting";
import { findByTag } from "./balances";
import { toIDR } from "./money";
import { fullName } from "./util";
import {
  parseHubspotContacts, parseQboCustomers, parseQboInvoices, dedupeBy, existingKeys, contactKeys, companyKeys, invoiceKeys, normName, normEmail,
  stripCurrencySuffix, guessEntityType, type ContactDraft, type QboCustomerDraft, type InvoiceDraft, type DateFormat,
} from "./importers";
import type { Account, Company, Contact, Entity, ImportBatch, Invoice, JournalLine, User } from "./types";

export type ImportKind = Extract<ImportBatch["kind"], "hubspot_contacts" | "qbo_customers" | "qbo_invoices">;
export const IMPORT_KINDS: ImportKind[] = ["hubspot_contacts", "qbo_customers", "qbo_invoices"];
export const IMPORT_KIND_LABELS: Record<ImportKind, string> = { hubspot_contacts: "HubSpot contacts", qbo_customers: "QuickBooks customers", qbo_invoices: "QuickBooks invoices" };

export interface ImportOptions {
  dateFormat: DateFormat;
  /** QBO invoices: post Dr AR / Cr revenue for every imported invoice. */
  postToLedger: boolean;
  /** QBO invoices: IDR per unit of each foreign currency, e.g. { USD: 16500, EUR: 18000 }. */
  fxRates: Record<string, number>;
  /** QBO invoices: ignore invoices dated before this ISO date (migration cut-over). */
  fromDate?: string;
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = { dateFormat: "auto", postToLedger: false, fxRates: {} };
/** Currencies ILA actually invoices in; the import form asks for an IDR rate for each one found in the file. */
export const FX_CURRENCIES = ["USD", "EUR", "HKD", "SGD", "AUD", "GBP"] as const;

export interface PreviewRow { line: number; cells: string[]; warnings: string[] }

/** Everything the preview screen shows, plus the rows `commitImport` will write. */
export interface ImportPlan {
  kind: ImportKind;
  entityId?: string;
  /** Column headers detected in the file. */
  headers: string[];
  /** Data rows read from the file. */
  rows: number;
  toInsert: number;
  duplicates: Array<{ line: number; label: string; reason: string }>;
  skipped: Array<{ line: number; reason: string }>;
  errors: Array<{ line: number; message: string }>;
  warnings: string[];
  /** Preview table: column labels and the first rows that will be inserted. */
  columns: string[];
  sample: PreviewRow[];
  /** QBO invoices: currencies in the file and those still lacking an IDR rate. */
  currencies: string[];
  missingRates: string[];
  /** When set, the import cannot run at all (no own entity, missing accounts…). */
  blocking?: string;
  /** Rows to write. */
  contacts: Contact[];
  companies: Company[];
  contactPatches: Array<{ id: string; patch: Partial<Contact> }>;
  companyPatches: Array<{ id: string; patch: Partial<Company> }>;
  invoices: Invoice[];
  /** Invoices to post (subset of `invoices`), with the AR and revenue accounts. */
  posting?: { ar: Account; sales: Account; invoices: Invoice[] };
}

const SAMPLE = 20;

function emptyPlan(kind: ImportKind): ImportPlan {
  return { kind, headers: [], rows: 0, toInsert: 0, duplicates: [], skipped: [], errors: [], warnings: [], columns: [], sample: [], currencies: [], missingRates: [], contacts: [], companies: [], contactPatches: [], companyPatches: [], invoices: [] };
}

function resolveOwner(users: User[], ownerName: string | undefined): string | undefined {
  if (!ownerName) return undefined;
  const key = ownerName.trim().toLowerCase();
  return users.find((u) => u.email.toLowerCase() === key || u.name.toLowerCase() === key)?.id;
}

/** Finds or creates (within the plan) the company a contact belongs to. */
function companyFor(plan: ImportPlan, byName: Map<string, Company>, name: string, source: "hubspot" | "qbo", now: string, hint = ""): Company {
  const key = normName(name);
  const found = byName.get(key);
  if (found) return found;
  const guess = guessEntityType(name, hint);
  const company: Company = {
    id: db.newId(), name: name.trim(), type: guess.type === "other" ? "prospect" : guess.type, country: guess.country, status: source === "qbo" ? "active" : "lead",
    subscriptions: [], tags: [source], notes: `Created by the ${source === "qbo" ? "QuickBooks" : "HubSpot"} import from a contact's company name.`, createdAt: now,
  };
  plan.companies.push(company);
  byName.set(key, company);
  return company;
}

// ---------- HubSpot contacts ----------

async function planHubspotContacts(text: string, options: ImportOptions): Promise<ImportPlan> {
  const plan = emptyPlan("hubspot_contacts");
  const parsed = parseHubspotContacts(text, { dateFormat: options.dateFormat });
  plan.headers = parsed.headers; plan.rows = parsed.rowCount; plan.errors = parsed.errors; plan.skipped = parsed.skipped; plan.warnings = parsed.warnings;
  const [contacts, companies, users] = await Promise.all([db.list("contacts"), db.list("companies"), db.list("users")]);
  const { fresh, duplicates } = dedupeBy(parsed.drafts, contactKeys, existingKeys(contacts, contactKeys));
  plan.duplicates = duplicates.map(({ draft, reason }) => ({ line: draft.line, label: `${fullName(draft)} ${draft.email ?? ""}`.trim(), reason }));
  const byName = new Map(companies.map((c) => [normName(c.name), c] as const));
  const now = new Date().toISOString();
  for (const d of fresh) {
    const company = d.companyName ? companyFor(plan, byName, d.companyName, "hubspot", now) : undefined;
    const contact: Contact = {
      id: db.newId(), firstName: d.firstName, lastName: d.lastName, email: d.email, phone: d.phone, whatsapp: d.whatsapp, nationality: d.nationality, language: d.language,
      source: d.source, ownerUserId: resolveOwner(users, d.ownerName), companyIds: company ? [company.id] : [], tags: d.tags, notes: d.notes, hubspotId: d.hubspotId,
      createdAt: d.createdAt ?? now, updatedAt: now,
    };
    if (d.ownerName && !contact.ownerUserId) d.warnings.push(`owner "${d.ownerName}" is not a user here`);
    plan.contacts.push(contact);
    if (company && !company.primaryContactId && plan.companies.includes(company)) company.primaryContactId = contact.id;
    if (plan.sample.length < SAMPLE) plan.sample.push({ line: d.line, cells: [fullName(contact), contact.email ?? "", contact.phone ?? "", company?.name ?? "", contact.nationality ?? "", d.tags.filter((t) => t !== "hubspot").join(", "), contact.createdAt.slice(0, 10)], warnings: d.warnings });
  }
  plan.columns = ["Name", "Email", "Phone", "Company", "Nationality", "Tags", "Created"];
  plan.toInsert = plan.contacts.length;
  if (plan.companies.length) plan.warnings.push(`${plan.companies.length} compan${plan.companies.length === 1 ? "y" : "ies"} will be created from the Associated Company column`);
  return plan;
}

// ---------- QuickBooks customers ----------

async function planQboCustomers(text: string): Promise<ImportPlan> {
  const plan = emptyPlan("qbo_customers");
  const parsed = parseQboCustomers(text);
  plan.headers = parsed.headers; plan.rows = parsed.rowCount; plan.errors = parsed.errors; plan.skipped = parsed.skipped; plan.warnings = parsed.warnings;
  const [contacts, companies] = await Promise.all([db.list("contacts"), db.list("companies")]);
  const companyDrafts = parsed.drafts.filter((d) => d.kind === "company");
  const contactDrafts = parsed.drafts.filter((d) => d.kind === "contact");
  const companyKeyOf = (d: QboCustomerDraft) => companyKeys({ name: d.name, qboCustomerId: d.qboCustomerId });
  const contactKeyOf = (d: QboCustomerDraft) => contactKeys({ email: d.email, qboCustomerId: d.qboCustomerId });
  const companyDedupe = dedupeBy(companyDrafts, companyKeyOf, existingKeys(companies, companyKeys));
  const contactDedupe = dedupeBy(contactDrafts, contactKeyOf, existingKeys(contacts, contactKeys));
  const byName = new Map(companies.map((c) => [normName(c.name), c] as const));
  const contactsByName = new Map(contacts.map((c) => [normName(fullName(c)), c] as const));
  const contactsByEmail = new Map(contacts.flatMap((c) => (normEmail(c.email) ? [[normEmail(c.email)!, c] as const] : [])));
  const now = new Date().toISOString();
  const label = (d: QboCustomerDraft) => d.displayName;

  // Existing companies matched by name get the QBO id so invoices can find them.
  for (const { draft, reason } of companyDedupe.duplicates) {
    plan.duplicates.push({ line: draft.line, label: label(draft), reason });
    const existing = byName.get(normName(draft.name));
    if (existing && !existing.qboCustomerId && !reason.startsWith("repeated")) plan.companyPatches.push({ id: existing.id, patch: { qboCustomerId: draft.qboCustomerId, updatedAt: now } });
  }
  for (const { draft, reason } of contactDedupe.duplicates) {
    plan.duplicates.push({ line: draft.line, label: label(draft), reason });
    const existing = (draft.email && contactsByEmail.get(draft.email)) || undefined;
    if (existing && !existing.qboCustomerId && !reason.startsWith("repeated")) plan.contactPatches.push({ id: existing.id, patch: { qboCustomerId: draft.qboCustomerId, updatedAt: now } });
  }

  const tagsFor = (d: QboCustomerDraft) => ["qbo", ...(d.currency && d.currency !== "IDR" ? [`currency:${d.currency}`] : [])];
  for (const d of companyDedupe.fresh) {
    const company: Company = {
      id: db.newId(), name: d.name, type: d.entityType ?? "other", country: d.country ?? "ID", npwp: d.npwp, address: d.address,
      status: d.inactive ? "inactive" : "active", subscriptions: [], qboCustomerId: d.qboCustomerId, tags: tagsFor(d), notes: d.notes, createdAt: now,
    };
    if (d.firstName || d.lastName) {
      const key = normName(`${d.firstName ?? ""} ${d.lastName ?? ""}`);
      const existing = (d.email && contactsByEmail.get(d.email)) || contactsByName.get(key);
      if (existing) {
        company.primaryContactId = existing.id;
        if (!existing.companyIds.includes(company.id)) plan.contactPatches.push({ id: existing.id, patch: { companyIds: [...existing.companyIds, company.id], updatedAt: now } });
      } else {
        const contact: Contact = { id: db.newId(), firstName: d.firstName ?? "", lastName: d.lastName ?? "", email: d.email, phone: d.phone, companyIds: [company.id], tags: ["qbo"], createdAt: now };
        plan.contacts.push(contact);
        contactsByName.set(key, contact);
        if (contact.email) contactsByEmail.set(contact.email, contact);
        company.primaryContactId = contact.id;
      }
    }
    plan.companies.push(company);
    byName.set(normName(company.name), company);
    if (plan.sample.length < SAMPLE) plan.sample.push({ line: d.line, cells: ["Company", company.name, d.displayName, d.currency ?? "", company.type, d.email ?? "", d.phone ?? "", d.openBalance !== undefined ? String(d.openBalance) : ""], warnings: d.warnings });
  }
  for (const d of contactDedupe.fresh) {
    const key = normName(`${d.firstName ?? ""} ${d.lastName ?? ""}`);
    const sameName = !d.email ? contactsByName.get(key) : undefined;
    if (sameName && !plan.contacts.includes(sameName)) {
      plan.duplicates.push({ line: d.line, label: label(d), reason: `already exists (name ${fullName(sameName)})` });
      if (!sameName.qboCustomerId) plan.contactPatches.push({ id: sameName.id, patch: { qboCustomerId: d.qboCustomerId, updatedAt: now } });
      continue;
    }
    const company = d.companyName ? companyFor(plan, byName, d.companyName, "qbo", now, d.address ?? "") : undefined;
    const contact: Contact = {
      id: db.newId(), firstName: d.firstName ?? "", lastName: d.lastName ?? "", email: d.email, phone: d.phone, nationality: d.country, companyIds: company ? [company.id] : [],
      tags: tagsFor(d), notes: [d.address ? `Address: ${d.address}` : "", d.notes ?? ""].filter(Boolean).join("\n") || undefined, qboCustomerId: d.qboCustomerId, createdAt: now,
    };
    plan.contacts.push(contact);
    contactsByName.set(key, contact);
    if (contact.email) contactsByEmail.set(contact.email, contact);
    if (company && plan.companies.includes(company) && !company.primaryContactId) company.primaryContactId = contact.id;
    if (plan.sample.length < SAMPLE) plan.sample.push({ line: d.line, cells: ["Contact", fullName(contact), d.displayName, d.currency ?? "", company?.name ?? "", d.email ?? "", d.phone ?? "", d.openBalance !== undefined ? String(d.openBalance) : ""], warnings: d.warnings });
  }
  plan.columns = ["Kind", "Name", "QBO name", "Currency", "Type / company", "Email", "Phone", "Open balance"];
  plan.toInsert = plan.companies.length + plan.contacts.length;
  if (plan.companyPatches.length || plan.contactPatches.length) plan.warnings.push(`${plan.companyPatches.length + plan.contactPatches.length} existing records will be linked to their QuickBooks customer`);
  return plan;
}

// ---------- QuickBooks invoices ----------

async function planQboInvoices(text: string, options: ImportOptions): Promise<ImportPlan> {
  const plan = emptyPlan("qbo_invoices");
  const own = (await db.list("entities", { where: { isOwn: true } }))[0] as Entity | undefined;
  if (!own) { plan.blocking = "Create ILA's own entity first (Settings → Entities, tick \"ILA's own books\")."; return plan; }
  plan.entityId = own.id;
  const parsed = parseQboInvoices(text, { dateFormat: options.dateFormat });
  plan.headers = parsed.headers; plan.rows = parsed.rowCount; plan.errors = [...parsed.errors]; plan.skipped = [...parsed.skipped]; plan.warnings = [...parsed.warnings]; plan.currencies = parsed.currencies;
  const [accounts, invoices, companies, contacts] = await Promise.all([
    db.list("accounts", { where: { entityId: own.id } }), db.list("invoices", { where: { entityId: own.id } }), db.list("companies"), db.list("contacts"),
  ]);
  const ar = findByTag(accounts, "ar_trade");
  const sales = findByTag(accounts, "sales_default");
  if (options.postToLedger && (!ar || !sales)) { plan.blocking = "The own entity's chart of accounts has no account tagged ar_trade / sales_default; posting is not possible."; return plan; }
  if (!sales) plan.warnings.push("no revenue account tagged sales_default: invoice lines are imported without an account");
  let drafts = parsed.drafts;
  if (options.fromDate) {
    const before = drafts.filter((d) => d.date < options.fromDate!);
    for (const d of before) plan.skipped.push({ line: d.line, reason: `dated ${d.date}, before ${options.fromDate}` });
    drafts = drafts.filter((d) => d.date >= options.fromDate!);
  }
  const { fresh, duplicates } = dedupeBy(drafts, invoiceKeys, existingKeys(invoices, invoiceKeys));
  plan.duplicates = duplicates.map(({ draft, reason }) => ({ line: draft.line, label: `Invoice ${draft.qboDocNumber} ${draft.customerName}`, reason }));
  const companiesByQbo = new Map(companies.flatMap((c) => (c.qboCustomerId ? [[c.qboCustomerId.trim().toLowerCase(), c] as const] : [])));
  const contactsByQbo = new Map(contacts.flatMap((c) => (c.qboCustomerId ? [[c.qboCustomerId.trim().toLowerCase(), c] as const] : [])));
  const companiesByName = new Map(companies.map((c) => [normName(c.name), c] as const));
  const contactsByName = new Map(contacts.map((c) => [normName(fullName(c)), c] as const));
  const missing = new Set<string>();
  const now = new Date().toISOString();
  let unresolved = 0;
  for (const d of fresh) {
    const rate = d.currency === "IDR" ? 1 : d.fxRate ?? options.fxRates[d.currency];
    if (!rate || rate <= 0) { missing.add(d.currency); plan.errors.push({ line: d.line, message: `invoice ${d.qboDocNumber}: no IDR rate for ${d.currency}` }); continue; }
    const stripped = stripCurrencySuffix(d.customerName).name;
    const qboKey = d.customerName.trim().toLowerCase();
    const company = companiesByQbo.get(qboKey) ?? companiesByName.get(normName(stripped));
    const contact = company ? undefined : contactsByQbo.get(qboKey) ?? contactsByName.get(normName(stripped));
    const customer: Invoice["customer"] = company
      ? { type: "company", id: company.id, name: company.name, email: d.email, npwp: company.npwp, address: company.address }
      : contact ? { type: "contact", id: contact.id, name: fullName(contact), email: d.email ?? contact.email } : { type: "other", name: stripped, email: d.email };
    if (customer.type === "other") { unresolved++; d.warnings.push("customer not found in the CRM"); }
    const invoice: Invoice = {
      id: db.newId(), entityId: own.id, number: d.qboDocNumber, customer, date: d.date, dueDate: d.dueDate, currency: d.currency, fxRate: rate,
      lines: d.lines.map((l) => ({ id: db.newId(), description: l.description, qty: l.qty, unitPrice: l.unitPrice, amount: l.amount, accountId: sales?.id ?? "", taxCode: "out_of_scope" as const })),
      subtotal: d.total, discount: 0, ppnAmount: 0, total: d.total, amountPaid: d.amountPaid, status: d.status, qboDocNumber: d.qboDocNumber,
      notes: [d.memo, "Imported from QuickBooks Online."].filter(Boolean).join("\n"), createdAt: now, sentAt: d.date,
    };
    plan.invoices.push(invoice);
    if (plan.sample.length < SAMPLE) plan.sample.push({ line: d.line, cells: [d.qboDocNumber, d.date, customer.name + (customer.type === "other" ? " (new)" : ""), d.currency, String(d.total), String(d.openBalance), d.status, rate === 1 ? "" : String(rate), d.lines[0]?.description ?? ""], warnings: d.warnings });
  }
  plan.columns = ["Num", "Date", "Customer", "Currency", "Total", "Open balance", "Status", "IDR rate", "Description"];
  plan.missingRates = [...missing].sort();
  plan.toInsert = plan.invoices.length;
  if (unresolved) plan.warnings.push(`${unresolved} invoice${unresolved === 1 ? "" : "s"} reference a customer that is not in the CRM yet (import QuickBooks customers first to link them)`);
  if (options.postToLedger && ar && sales) {
    const postable = plan.invoices.filter((i) => i.total > 0);
    plan.posting = { ar, sales, invoices: postable };
    plan.warnings.push(`${postable.length} journal entries will be posted (Dr ${ar.code} ${ar.name} / Cr ${sales.code} ${sales.name}); receipts are not posted, reconcile them from the bank import`);
  }
  return plan;
}

// ---------- Public API ----------

/** Dry run: parses, dedupes and resolves links without writing anything. */
export async function prepareImport(kind: ImportKind, text: string, options: ImportOptions = DEFAULT_IMPORT_OPTIONS): Promise<ImportPlan> {
  if (kind === "hubspot_contacts") return planHubspotContacts(text, options);
  if (kind === "qbo_customers") return planQboCustomers(text);
  return planQboInvoices(text, options);
}

/** Writes a plan and records the batch. Posting errors (locked period, unbalanced) are captured per invoice. */
export async function commitImport(plan: ImportPlan, fileName: string, byUserId?: string): Promise<ImportBatch> {
  if (plan.blocking) throw new Error(plan.blocking);
  const errors = plan.errors.map((e) => `line ${e.line}: ${e.message}`);
  let inserted = 0;
  if (plan.companies.length) inserted += await db.insertMany("companies", plan.companies);
  if (plan.contacts.length) inserted += await db.insertMany("contacts", plan.contacts);
  for (const p of plan.companyPatches) await db.update("companies", p.id, p.patch);
  for (const p of plan.contactPatches) await db.update("contacts", p.id, p.patch);
  if (plan.invoices.length) inserted += await db.insertMany("invoices", plan.invoices);
  if (plan.posting) {
    const { ar, sales } = plan.posting;
    for (const inv of plan.posting.invoices) {
      const idr = toIDR(inv.total, inv.currency, inv.fxRate);
      const fx = inv.currency === "IDR" ? {} : { currency: inv.currency, fxAmount: inv.total, fxRate: inv.fxRate };
      const lines: JournalLine[] = [
        { accountId: ar.id, accountCode: ar.code, description: `Invoice ${inv.number} ${inv.customer.name}`, debit: idr, credit: 0, counterpartyId: inv.customer.id, counterpartyName: inv.customer.name, taxCode: "out_of_scope", ...fx },
        { accountId: sales.id, accountCode: sales.code, description: inv.lines[0]?.description ?? "Services", debit: 0, credit: idr, counterpartyId: inv.customer.id, counterpartyName: inv.customer.name, taxCode: "out_of_scope", ...fx },
      ];
      try {
        const je = await postJournal(inv.entityId, { date: inv.date, memo: `QBO invoice ${inv.number} - ${inv.customer.name}`, source: "invoice", sourceId: inv.id, lines, createdByUserId: byUserId });
        await db.update("invoices", inv.id, { journalId: je.id, updatedAt: new Date().toISOString() });
      } catch (e) {
        errors.push(`invoice ${inv.number}: not posted (${e instanceof Error ? e.message : String(e)})`);
      }
    }
  }
  const batch: ImportBatch = {
    id: db.newId(), kind: plan.kind, entityId: plan.entityId, fileName, rows: plan.rows, inserted,
    skipped: plan.duplicates.length + plan.skipped.length + plan.errors.length, errors, byUserId, createdAt: new Date().toISOString(),
  };
  await db.insert("import_batches", batch);
  return batch;
}

/** Parse + write in one go (scripts, API). */
export async function runImport(kind: ImportKind, text: string, fileName: string, options: ImportOptions = DEFAULT_IMPORT_OPTIONS, byUserId?: string): Promise<{ plan: ImportPlan; batch: ImportBatch }> {
  const plan = await prepareImport(kind, text, options);
  const batch = await commitImport(plan, fileName, byUserId);
  return { plan, batch };
}

// ---------- Pending upload (between preview and import) ----------

export interface ImportDraft { kind: ImportKind; fileName: string; text: string; options: ImportOptions; byUserId: string; createdAt: string }

const draftId = (userId: string, kind: ImportKind) => `import_draft:${userId}:${kind}`;

/** The uploaded file is kept server-side (settings table) so the preview and the import see the same bytes. */
export async function saveImportDraft(draft: ImportDraft): Promise<void> {
  await db.upsert("settings", { id: draftId(draft.byUserId, draft.kind), value: draft, updatedAt: new Date().toISOString() });
}

export async function loadImportDraft(userId: string, kind: ImportKind): Promise<ImportDraft | null> {
  const row = await db.get("settings", draftId(userId, kind));
  const v = row?.value as ImportDraft | undefined;
  return v && typeof v.text === "string" ? v : null;
}

export async function clearImportDraft(userId: string, kind: ImportKind): Promise<void> {
  await db.remove("settings", draftId(userId, kind));
}

export async function listImportBatches(limit = 30): Promise<ImportBatch[]> {
  return db.list("import_batches", { orderBy: "createdAt", desc: true, limit });
}

export { type ContactDraft, type QboCustomerDraft, type InvoiceDraft };
