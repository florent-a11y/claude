/**
 * Runs the migration imports against the store: parses the file with lib/importers.ts, dedupes against existing
 * rows, resolves links (contacts ↔ companies, invoices ↔ customers, owners ↔ users, QBO accounts ↔ our chart),
 * writes the rows and records an ImportBatch. `prepareImport` is the dry run shown on the preview screen;
 * `commitImport` writes the same plan. The input is a CSV text or a table read from an Excel sheet.
 *
 * Books imports (invoices, account list, trial balance, journal, bills) target one entity: `options.entityId`,
 * defaulting to ILA's own entity (isOwn). Invoices and bills are keyed by qboDocNumber and optionally posted
 * (Dr AR / Cr revenue, Dr expense / Cr AP, IDR at the rate given per currency). QBO accounts are matched to ours by
 * number, then by name, and remembered on `Account.qboName`; the trial balance becomes one "opening" journal and
 * the journal report one "manual" entry per transaction, both keyed by `sourceId` so a file can be re-run safely.
 * Journals are stored with `postJournalsBulk` (a full history is thousands of entries).
 *
 * Every planner reads the store unless it is handed a `PlanWorld`: the migration wizard (lib/qbo-migration-services.ts)
 * plans several files in one dry run and passes each step the state the previous one will leave (accounts created
 * by the account list, entries posted by an earlier journal file…).
 */
import { db } from "./db";
import { postJournal, postJournalsBulk } from "./posting";
import { findByCode, findByTag } from "./balances";
import { billJournalLines } from "./ledger";
import { normalBalanceOf } from "./coa";
import { roundMoney, toIDR } from "./money";
import { fullName } from "./util";
import {
  parseHubspotContacts, parseQboCustomers, parseQboInvoices, parseQboAccounts, parseQboTrialBalance, parseQboJournal, parseQboBills, parseQboVendors, openingLinesFromTrialBalance,
  allocateAccountCode, qboNumberToCode, journalLabel, dedupeBy, existingKeys, contactKeys, companyKeys, invoiceKeys, billKeys, journalKeys, normName, normEmail,
  stripCurrencySuffix, guessEntityType, accountResolver, cleanAccountName, guessAccountFromName, journalSourceIds,
  type ContactDraft, type QboCustomerDraft, type InvoiceDraft, type DateFormat, type AccountDraft, type TableInput,
} from "./importers";
import type { Account, Bill, Company, Contact, Entity, ImportBatch, ImportCounts, Invoice, JournalEntry, JournalLine, JournalSource, User, Vendor } from "./types";

export type ImportKind = Extract<ImportBatch["kind"], "hubspot_contacts" | "qbo_customers" | "qbo_invoices" | "qbo_accounts" | "qbo_trial_balance" | "qbo_journal" | "qbo_bills" | "qbo_vendors">;
export const IMPORT_KINDS: ImportKind[] = ["hubspot_contacts", "qbo_customers", "qbo_invoices", "qbo_accounts", "qbo_trial_balance", "qbo_journal", "qbo_bills", "qbo_vendors"];
export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  hubspot_contacts: "HubSpot contacts", qbo_customers: "QuickBooks customers", qbo_invoices: "QuickBooks invoices",
  qbo_accounts: "QuickBooks account list", qbo_trial_balance: "QuickBooks trial balance", qbo_journal: "QuickBooks journal", qbo_bills: "QuickBooks bills", qbo_vendors: "QuickBooks vendors",
};
/** Imports that write into one entity's books (the others feed the CRM and the vendor directory). */
export const BOOKS_IMPORT_KINDS: ImportKind[] = ["qbo_invoices", "qbo_accounts", "qbo_trial_balance", "qbo_journal", "qbo_bills"];
export const isBooksImport = (kind: ImportKind): boolean => BOOKS_IMPORT_KINDS.includes(kind);

export interface ImportOptions {
  dateFormat: DateFormat;
  /** QBO invoices / bills: post Dr AR / Cr revenue (Dr expense / Cr AP) for every imported document. */
  postToLedger: boolean;
  /** QBO invoices / bills: IDR per unit of each foreign currency, e.g. { USD: 16500, EUR: 18000 }. */
  fxRates: Record<string, number>;
  /**
   * Cut-over date (ISO). Invoices, bills and journal entries dated before it are ignored; for the trial balance it is
   * the "as of" date of the opening journal (read from the report title when empty).
   */
  fromDate?: string;
  /** Books imports: the entity written to; empty = ILA's own entity. */
  entityId?: string;
  /** QBO customers: after the import, create a set of books for every imported company that needs one. */
  createBooks?: boolean;
  /**
   * QBO journal / trial balance: accounts the file uses but the chart lacks are created from their name with a
   * guessed type (listed in `guessedAccounts`) instead of rejecting the entries. The migration wizard sets it.
   */
  createMissingAccounts?: boolean;
}

/**
 * The store as a planner sees it. Every field is optional: what is missing is read from the database. The wizard
 * fills it so a step sees what the previous steps of the same dry run will have written.
 */
export interface PlanWorld {
  entity?: Entity;
  accounts?: Account[];
  /** The entity's journal entries (any status); only `sourceId`, `status`, `source` and `number` are read. */
  entries?: Array<Pick<JournalEntry, "sourceId" | "status" | "source" | "number">>;
  invoices?: Invoice[];
  bills?: Bill[];
  vendors?: Vendor[];
  companies?: Company[];
  contacts?: Contact[];
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
  /** QBO invoices / bills: currencies in the file and those still lacking an IDR rate. */
  currencies: string[];
  missingRates: string[];
  /** When set, the import cannot run at all (no own entity, missing accounts…). */
  blocking?: string;
  /** Books imports: the entity written to. */
  entityName?: string;
  /** Rows to write. */
  contacts: Contact[];
  companies: Company[];
  contactPatches: Array<{ id: string; patch: Partial<Contact> }>;
  companyPatches: Array<{ id: string; patch: Partial<Company> }>;
  invoices: Invoice[];
  /** Invoices to post (subset of `invoices`), with the AR and revenue accounts. */
  posting?: { ar: Account; sales: Account; invoices: Invoice[] };
  /** QBO account list: accounts to create and existing accounts to tag with their QBO name. */
  accounts: Account[];
  accountPatches: Array<{ id: string; patch: Partial<Account> }>;
  /** Subset of `accounts` created from a name found in the journal or the trial balance: the type is a guess to check. */
  guessedAccounts: Array<{ qboName: string; code: string; name: string; type: Account["type"]; subtype: Account["subtype"] }>;
  /** QBO vendors to add to the vendor directory. */
  vendors: Vendor[];
  /** QBO trial balance / journal: entries to post (`label` names them in messages). */
  journals: Array<{ label: string; date: string; memo: string; source: JournalSource; sourceId: string; lines: JournalLine[] }>;
  /** QBO bills, and those to post (Dr expense / Cr AP) with the entity's accounts. */
  bills: Bill[];
  billPosting?: { ap: Account; accounts: Account[]; bills: Bill[] };
}

const SAMPLE = 20;

function emptyPlan(kind: ImportKind): ImportPlan {
  return { kind, headers: [], rows: 0, toInsert: 0, duplicates: [], skipped: [], errors: [], warnings: [], columns: [], sample: [], currencies: [], missingRates: [], contacts: [], companies: [], contactPatches: [], companyPatches: [], invoices: [], accounts: [], accountPatches: [], guessedAccounts: [], vendors: [], journals: [], bills: [] };
}

/** Number of records a plan writes or posts (what the Import button announces). */
export function planCount(plan: ImportPlan): number {
  return plan.toInsert + plan.companyPatches.length + plan.contactPatches.length + plan.accountPatches.length;
}

/** The entity a books import writes to: the world's, else `options.entityId`, else ILA's own entity. Null when none exists. */
async function booksEntity(options: ImportOptions, world?: PlanWorld): Promise<Entity | null> {
  if (world?.entity) return world.entity;
  if (options.entityId) return db.get("entities", options.entityId);
  return ((await db.list("entities", { where: { isOwn: true } }))[0] as Entity | undefined) ?? null;
}

const NO_ENTITY = "Choose the entity to import into (none selected and ILA's own entity does not exist yet: Settings → Entities, tick \"ILA's own books\").";

/** A new account for a QuickBooks name the chart lacks (journal / trial balance), with the type guessed from the name. */
function guessedAccount(plan: ImportPlan, entityId: string, qboName: string, taken: Set<string>): Account {
  const { type, subtype } = guessAccountFromName(qboName);
  const code = allocateAccountCode(type, subtype, taken);
  taken.add(code);
  const account: Account = {
    id: db.newId(), entityId, code, name: cleanAccountName(qboName).split(":").pop() || qboName, type, subtype, normalBalance: normalBalanceOf(type),
    deductible: type === "expense" ? true : undefined, qboName, isSystem: false, active: true,
  };
  plan.accounts.push(account);
  plan.guessedAccounts.push({ qboName, code, name: account.name, type, subtype });
  return account;
}

/** Creates (in the plan) every account among `names` that `accounts` cannot resolve; returns the resolver over both. */
function resolverCreatingMissing(plan: ImportPlan, entityId: string, accounts: Account[], names: Iterable<string>, create: boolean): (qboName: string, number?: string) => Account | undefined {
  const resolve = accountResolver(accounts);
  if (!create) return resolve;
  const taken = new Set(accounts.map((a) => a.code));
  const added: Account[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = normName(cleanAccountName(name));
    if (!key || seen.has(key) || resolve(name)) continue;
    seen.add(key);
    added.push(guessedAccount(plan, entityId, name, taken));
  }
  return added.length ? accountResolver([...accounts, ...added]) : resolve;
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

async function planHubspotContacts(input: TableInput, options: ImportOptions): Promise<ImportPlan> {
  const plan = emptyPlan("hubspot_contacts");
  const parsed = parseHubspotContacts(input, { dateFormat: options.dateFormat });
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

async function planQboCustomers(input: TableInput, world?: PlanWorld): Promise<ImportPlan> {
  const plan = emptyPlan("qbo_customers");
  const parsed = parseQboCustomers(input);
  plan.headers = parsed.headers; plan.rows = parsed.rowCount; plan.errors = parsed.errors; plan.skipped = parsed.skipped; plan.warnings = parsed.warnings;
  const [contacts, companies] = await Promise.all([world?.contacts ?? db.list("contacts"), world?.companies ?? db.list("companies")]);
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

async function planQboInvoices(input: TableInput, options: ImportOptions, world?: PlanWorld): Promise<ImportPlan> {
  const plan = emptyPlan("qbo_invoices");
  const own = await booksEntity(options, world);
  if (!own) { plan.blocking = NO_ENTITY; return plan; }
  plan.entityId = own.id; plan.entityName = own.name;
  const parsed = parseQboInvoices(input, { dateFormat: options.dateFormat });
  plan.headers = parsed.headers; plan.rows = parsed.rowCount; plan.errors = [...parsed.errors]; plan.skipped = [...parsed.skipped]; plan.warnings = [...parsed.warnings]; plan.currencies = parsed.currencies;
  const [accounts, invoices, companies, contacts] = await Promise.all([
    world?.accounts ?? db.list("accounts", { where: { entityId: own.id } }), world?.invoices ?? db.list("invoices", { where: { entityId: own.id } }), world?.companies ?? db.list("companies"), world?.contacts ?? db.list("contacts"),
  ]);
  const ar = findByTag(accounts, "ar_trade");
  const sales = findByTag(accounts, "sales_default");
  if (options.postToLedger && (!ar || !sales)) { plan.blocking = `${own.name}'s chart of accounts has no account tagged ar_trade / sales_default; posting is not possible.`; return plan; }
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

// ---------- QuickBooks account list ----------

async function planQboAccounts(input: TableInput, options: ImportOptions, world?: PlanWorld): Promise<ImportPlan> {
  const plan = emptyPlan("qbo_accounts");
  const entity = await booksEntity(options, world);
  if (!entity) { plan.blocking = NO_ENTITY; return plan; }
  plan.entityId = entity.id; plan.entityName = entity.name;
  const parsed = parseQboAccounts(input);
  plan.headers = parsed.headers; plan.rows = parsed.rowCount; plan.errors = [...parsed.errors]; plan.skipped = [...parsed.skipped]; plan.warnings = [...parsed.warnings];
  const accounts = world?.accounts ?? await db.list("accounts", { where: { entityId: entity.id } });
  const resolve = accountResolver(accounts);
  const taken = new Set(accounts.map((a) => a.code));
  const created = new Map<string, Account>(); // by normalised QBO name, so children can find a parent created above
  let existingCount = 0;
  const qboSeen = new Set<string>();
  // QuickBooks' own receivable and payable accounts ("Accounts Receivable (A/R)") go to the accounts our invoices,
  // bills and payments post to, so what is open in QuickBooks is collected and paid here on the same account.
  const control: Partial<Record<Account["subtype"], Account | undefined>> = { ar: findByTag(accounts, "ar_trade"), ap: findByTag(accounts, "ap_trade") };
  const controlFor = (d: AccountDraft): Account | undefined => {
    const ours = control[d.subtype];
    const currency = stripCurrencySuffix(d.name).currency;
    if (!ours || ours.qboName || (currency && currency !== entity.baseCurrency)) return undefined;
    control[d.subtype] = undefined; // one QuickBooks account each: the first in the list (the home-currency one)
    d.warnings.push(`mapped to our trade ${d.subtype === "ar" ? "receivables" : "payables"} account`);
    return ours;
  };
  for (const d of parsed.drafts) {
    const key = normName(d.qboName);
    if (qboSeen.has(key)) { plan.duplicates.push({ line: d.line, label: d.qboName, reason: "repeated in the file" }); continue; }
    qboSeen.add(key);
    const known = resolve(d.qboName, d.number) ?? created.get(key);
    if (known) for (const k of ["ar", "ap"] as const) if (control[k]?.id === known.id) control[k] = undefined;
    const match = known ?? controlFor(d);
    const typeLabel = `${d.type} / ${d.subtype}`;
    if (match) {
      let action = "existing";
      if (match.qboName && normName(match.qboName) !== key) d.warnings.push(`our account is already mapped to QBO "${match.qboName}"`);
      if (!match.qboName) plan.accountPatches.push({ id: match.id, patch: { qboName: d.qboName } });
      else if (!plan.accounts.includes(match)) { action = "already mapped"; plan.duplicates.push({ line: d.line, label: d.qboName, reason: `already mapped to ${match.code} ${match.name}` }); }
      if (match.type !== d.type) d.warnings.push(`QBO type ${d.qboType} but ours is ${match.type}`);
      created.set(key, match);
      existingCount++;
      if (plan.sample.length < SAMPLE) plan.sample.push({ line: d.line, cells: [d.qboName, d.qboType, d.detailType ?? "", match.code, match.name, `${match.type} / ${match.subtype}`, action], warnings: d.warnings });
      continue;
    }
    let code = qboNumberToCode(d.number, d.type, d.subtype);
    if (code && taken.has(code)) { d.warnings.push(`QBO number ${d.number} is already used by another account: next free code allocated`); code = undefined; }
    if (d.number && !code && !d.warnings.length) d.warnings.push(`QBO number "${d.number}" does not fit the 1-1100 format: next free code allocated`);
    code = code ?? allocateAccountCode(d.type, d.subtype, taken);
    taken.add(code);
    const parent = d.parentQboName ? resolve(d.parentQboName) ?? created.get(normName(d.parentQboName)) : undefined;
    const account: Account = {
      id: db.newId(), entityId: entity.id, code, name: d.name, type: d.type, subtype: d.subtype, normalBalance: normalBalanceOf(d.type), parentCode: parent?.code,
      deductible: d.type === "expense" ? true : undefined, qboName: d.qboName, isSystem: false, active: true,
    };
    plan.accounts.push(account);
    created.set(key, account);
    if (plan.sample.length < SAMPLE) plan.sample.push({ line: d.line, cells: [d.qboName, d.qboType, d.detailType ?? "", code, account.name, typeLabel, "new"], warnings: d.warnings });
  }
  plan.columns = ["QBO account", "QBO type", "Detail type", "Code", "Our account", "Type / subtype", "Action"];
  plan.toInsert = plan.accounts.length;
  if (existingCount) plan.warnings.push(`${existingCount} QBO account${existingCount === 1 ? "" : "s"} matched existing accounts (${plan.accountPatches.length} will be tagged with their QBO name)`);
  if (plan.accounts.length) plan.warnings.push(`${plan.accounts.length} new account${plan.accounts.length === 1 ? "" : "s"} will be created in ${entity.name} with the next free code in their group; rename or renumber them in Books → Accounts afterwards`);
  return plan;
}

// ---------- QuickBooks trial balance → opening journal ----------

async function planQboTrialBalance(input: TableInput, options: ImportOptions, world?: PlanWorld): Promise<ImportPlan> {
  const plan = emptyPlan("qbo_trial_balance");
  const entity = await booksEntity(options, world);
  if (!entity) { plan.blocking = NO_ENTITY; return plan; }
  plan.entityId = entity.id; plan.entityName = entity.name;
  const parsed = parseQboTrialBalance(input);
  plan.headers = parsed.headers; plan.rows = parsed.rowCount; plan.errors = [...parsed.errors]; plan.skipped = [...parsed.skipped]; plan.warnings = [...parsed.warnings];
  const asOf = options.fromDate ?? parsed.asOf;
  if (!asOf) { plan.blocking = "Set the cut-over date in the options: it is the \"as of\" date of the trial balance and the date of the opening journal."; return plan; }
  if (parsed.asOf && options.fromDate && parsed.asOf !== options.fromDate) plan.warnings.push(`the report says "as of ${parsed.asOf}" but the cut-over date is ${options.fromDate}: the journal is dated ${options.fromDate}`);
  const [accounts, allEntries] = await Promise.all([world?.accounts ?? db.list("accounts", { where: { entityId: entity.id } }), world?.entries ?? db.list("journal_entries", { where: { entityId: entity.id, source: "opening" } })]);
  const entries = allEntries.filter((e) => e.source === "opening");
  const sourceId = `qbo:tb:${asOf}`;
  const resolve = resolverCreatingMissing(plan, entity.id, accounts, parsed.drafts.map((r) => r.account), !!options.createMissingAccounts);
  const { lines, unmatched, difference } = openingLinesFromTrialBalance(parsed.drafts, (n) => resolve(n), { balanceTo: findByTag(accounts, "retained_earnings"), description: `Opening balance (QuickBooks trial balance as of ${asOf})` });
  for (const r of unmatched) plan.errors.push({ line: r.line, message: `account "${r.account}" is not mapped to ${entity.name}'s chart of accounts` });
  for (const r of parsed.drafts) {
    const a = resolve(r.account);
    if (plan.sample.length < SAMPLE) plan.sample.push({ line: r.line, cells: [r.account, a?.code ?? "", a?.name ?? "", r.debit ? String(r.debit) : "", r.credit ? String(r.credit) : ""], warnings: a ? [] : ["not mapped"] });
  }
  plan.columns = ["QBO account", "Code", "Our account", "Debit", "Credit"];
  if (unmatched.length) { plan.blocking = `${unmatched.length} account${unmatched.length === 1 ? "" : "s"} in the trial balance ${unmatched.length === 1 ? "is" : "are"} not in ${entity.name}'s chart of accounts. Import the QuickBooks account list first (card 4), or create the missing accounts in Books → Accounts, then upload again.`; return plan; }
  if (difference !== 0) { plan.blocking = `The trial balance does not balance (debits − credits = ${difference}) and no retained-earnings account exists to absorb a rounding difference.`; return plan; }
  if (lines.some((l) => l.description?.startsWith("Rounding"))) plan.warnings.push("a rounding difference is booked to retained earnings");
  const nothingToPost = () => { plan.accounts = []; plan.guessedAccounts = []; return plan; }; // no entry, so no account is created for it either
  if (entries.some((e) => e.sourceId === sourceId && e.status !== "void")) { plan.duplicates.push({ line: parsed.headerLine, label: `Opening balances as of ${asOf}`, reason: `already imported (journal ${entries.find((e) => e.sourceId === sourceId)!.number})` }); return nothingToPost(); }
  if (lines.length < 2) { if (parsed.drafts.length) plan.warnings.push("fewer than two non-zero lines: nothing to post"); return nothingToPost(); }
  plan.journals.push({ label: `Opening balances as of ${asOf}`, date: asOf, memo: `Opening balances from QuickBooks as of ${asOf}`, source: "opening", sourceId, lines });
  plan.toInsert = 1 + plan.accounts.length;
  if (plan.guessedAccounts.length) plan.warnings.push(`${plan.guessedAccounts.length} account${plan.guessedAccounts.length === 1 ? "" : "s"} of the trial balance ${plan.guessedAccounts.length === 1 ? "is" : "are"} not in the chart and will be created from the name with a guessed type: check the type in Books → Accounts`);
  const debit = roundMoney(lines.reduce((s, l) => s + l.debit, 0));
  plan.warnings.push(`one opening journal dated ${asOf} with ${lines.length} lines (${debit.toLocaleString("en-US")} IDR each side) will be posted; P&L balances are carried as they are, so a mid-year cut-over keeps the year-to-date result`);
  return plan;
}

// ---------- QuickBooks journal → manual entries ----------

async function planQboJournal(input: TableInput, options: ImportOptions, world?: PlanWorld): Promise<ImportPlan> {
  const plan = emptyPlan("qbo_journal");
  const entity = await booksEntity(options, world);
  if (!entity) { plan.blocking = NO_ENTITY; return plan; }
  plan.entityId = entity.id; plan.entityName = entity.name;
  const parsed = parseQboJournal(input, { dateFormat: options.dateFormat });
  plan.headers = parsed.headers; plan.rows = parsed.rowCount; plan.errors = [...parsed.errors]; plan.skipped = [...parsed.skipped]; plan.warnings = [...parsed.warnings];
  const [accounts, entries] = await Promise.all([world?.accounts ?? db.list("accounts", { where: { entityId: entity.id } }), world?.entries ?? db.list("journal_entries", { where: { entityId: entity.id } })]);
  let drafts = parsed.drafts;
  if (options.fromDate) {
    for (const d of drafts.filter((d) => d.date < options.fromDate!)) plan.skipped.push({ line: d.line, reason: `dated ${d.date}, before ${options.fromDate}` });
    drafts = drafts.filter((d) => d.date >= options.fromDate!);
  }
  const resolve = resolverCreatingMissing(plan, entity.id, accounts, drafts.flatMap((d) => d.lines.map((l) => l.account)), !!options.createMissingAccounts);
  // One sourceId per transaction of the file (unnumbered same-day transactions are told apart by their lines). An
  // older import stored the plain key for the first of such a group: that one is skipped, the others are posted.
  const existing = existingKeys(entries.filter((e) => e.status !== "void"), journalKeys);
  const ids = journalSourceIds(drafts);
  const legacy = new Set<string>();
  const keyed: Array<{ d: typeof drafts[number]; sourceId: string }> = [];
  drafts.forEach((d, i) => {
    const { base, sourceId } = ids[i];
    if (sourceId !== base && existing.has(`source:${base}`) && !existing.has(`source:${sourceId}`) && !legacy.has(base)) { legacy.add(base); plan.duplicates.push({ line: d.line, label: journalLabel(d), reason: "already imported" }); return; }
    keyed.push({ d, sourceId });
  });
  const { fresh, duplicates } = dedupeBy(keyed, (k) => journalKeys({ sourceId: k.sourceId }), existing);
  for (const { draft, reason } of duplicates) plan.duplicates.push({ line: draft.d.line, label: journalLabel(draft.d), reason: reason.startsWith("already") ? "already imported" : reason });
  const unmatched = new Set<string>();
  for (const { d, sourceId } of fresh) {
    const lines: JournalLine[] = [];
    let missing = false;
    for (const l of d.lines) {
      const a = resolve(l.account);
      if (!a) { unmatched.add(l.account); missing = true; continue; }
      lines.push({ accountId: a.id, accountCode: a.code, description: l.description, debit: roundMoney(l.debit), credit: roundMoney(l.credit), counterpartyName: l.name || d.name || undefined });
    }
    if (missing) { plan.errors.push({ line: d.line, message: `${journalLabel(d)}: account not mapped (${d.lines.filter((l) => !resolve(l.account)).map((l) => l.account).join(", ")})` }); continue; }
    const td = roundMoney(lines.reduce((s, l) => s + l.debit, 0)), tc = roundMoney(lines.reduce((s, l) => s + l.credit, 0));
    if (td !== tc) { plan.errors.push({ line: d.line, message: `${journalLabel(d)}: debits ${td} ≠ credits ${tc} after rounding` }); continue; }
    const memo = `QBO ${journalLabel(d)}${d.memo ? ` · ${d.memo}` : ""}`;
    plan.journals.push({ label: journalLabel(d), date: d.date, memo: memo.length > 300 ? `${memo.slice(0, 299)}…` : memo, source: "manual", sourceId, lines });
    if (plan.sample.length < SAMPLE) plan.sample.push({ line: d.line, cells: [d.date, d.type, d.num, d.name, d.memo ?? "", String(lines.length), String(td), String(tc)], warnings: d.warnings });
  }
  // Posted in date order, so the JE numbers follow the history (the sort is stable: file order within a day).
  plan.journals.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  plan.columns = ["Date", "Type", "Num", "Name", "Memo", "Lines", "Debit", "Credit"];
  plan.toInsert = plan.journals.length + plan.accounts.length;
  if (unmatched.size) plan.warnings.push(`${unmatched.size} QBO account${unmatched.size === 1 ? "" : "s"} not mapped to ${entity.name}'s chart (${[...unmatched].slice(0, 8).join(", ")}${unmatched.size > 8 ? "…" : ""}): import the account list first (card 4) or create them in Books → Accounts; the entries using them are rejected`);
  if (plan.guessedAccounts.length) plan.warnings.push(`${plan.guessedAccounts.length} account${plan.guessedAccounts.length === 1 ? "" : "s"} used in the journal ${plan.guessedAccounts.length === 1 ? "is" : "are"} not in the chart and will be created from the name with a guessed type: check the type in Books → Accounts`);
  if (plan.journals.length) plan.warnings.push(`${plan.journals.length} journal entries will be posted as manual entries (memo "QBO <type> <num> <name> · <memo>"); locked periods reject their entries`);
  return plan;
}

// ---------- QuickBooks bills ----------

async function planQboBills(input: TableInput, options: ImportOptions, world?: PlanWorld): Promise<ImportPlan> {
  const plan = emptyPlan("qbo_bills");
  const entity = await booksEntity(options, world);
  if (!entity) { plan.blocking = NO_ENTITY; return plan; }
  plan.entityId = entity.id; plan.entityName = entity.name;
  const parsed = parseQboBills(input, { dateFormat: options.dateFormat });
  plan.headers = parsed.headers; plan.rows = parsed.rowCount; plan.errors = [...parsed.errors]; plan.skipped = [...parsed.skipped]; plan.warnings = [...parsed.warnings]; plan.currencies = parsed.currencies;
  const [accounts, bills, vendors, companies] = await Promise.all([
    world?.accounts ?? db.list("accounts", { where: { entityId: entity.id } }), world?.bills ?? db.list("bills", { where: { entityId: entity.id } }), world?.vendors ?? db.list("vendors"), world?.companies ?? db.list("companies"),
  ]);
  const ap = findByTag(accounts, "ap_trade");
  const expense = findByCode(accounts, "6-9000") ?? accounts.find((a) => a.active && a.type === "expense" && a.subtype === "opex");
  if (!expense) { plan.blocking = `${entity.name}'s chart of accounts has no operating-expense account (6-9000 or any opex account) to receive the bill lines.`; return plan; }
  if (options.postToLedger && !ap) { plan.blocking = `${entity.name}'s chart of accounts has no account tagged ap_trade; posting is not possible.`; return plan; }
  let drafts = parsed.drafts;
  if (options.fromDate) {
    for (const d of drafts.filter((d) => d.date < options.fromDate!)) plan.skipped.push({ line: d.line, reason: `dated ${d.date}, before ${options.fromDate}` });
    drafts = drafts.filter((d) => d.date >= options.fromDate!);
  }
  const { fresh, duplicates } = dedupeBy(drafts, billKeys, existingKeys(bills, billKeys));
  plan.duplicates = duplicates.map(({ draft, reason }) => ({ line: draft.line, label: `Bill ${draft.qboDocNumber} ${draft.vendorName}`, reason }));
  const vendorsByName = new Map(vendors.map((v) => [normName(v.name), v] as const));
  const companiesByName = new Map(companies.map((c) => [normName(c.name), c] as const));
  const missing = new Set<string>();
  const now = new Date().toISOString();
  let unresolved = 0;
  for (const d of fresh) {
    const rate = d.currency === "IDR" ? 1 : d.fxRate ?? options.fxRates[d.currency];
    if (!rate || rate <= 0) { missing.add(d.currency); plan.errors.push({ line: d.line, message: `bill ${d.qboDocNumber}: no IDR rate for ${d.currency}` }); continue; }
    const key = normName(d.vendorName);
    const vendor = vendorsByName.get(key);
    const company = vendor ? undefined : companiesByName.get(key);
    const party: Bill["vendor"] = vendor ? { type: "vendor", id: vendor.id, name: vendor.name, npwp: vendor.npwp } : company ? { type: "company", id: company.id, name: company.name, npwp: company.npwp, country: company.country } : { type: "other", name: d.vendorName };
    if (party.type === "other") { unresolved++; d.warnings.push("vendor not in the directory"); }
    const bill: Bill = {
      id: db.newId(), entityId: entity.id, number: d.qboDocNumber, vendor: party, vendorInvoiceNumber: d.qboDocNumber, date: d.date, dueDate: d.dueDate, currency: d.currency, fxRate: rate,
      lines: d.lines.map((l) => ({ id: db.newId(), description: l.description, amount: l.amount, accountId: expense.id, taxCode: "out_of_scope" as const, withholding: "none" as const })),
      subtotal: d.total, ppnInput: 0, withholdingTotal: 0, total: d.total, amountPayable: d.total, amountPaid: d.amountPaid, status: d.status, qboDocNumber: d.qboDocNumber,
      notes: [d.memo, "Imported from QuickBooks Online."].filter(Boolean).join("\n"), createdAt: now,
    };
    plan.bills.push(bill);
    if (plan.sample.length < SAMPLE) plan.sample.push({ line: d.line, cells: [d.qboDocNumber, d.date, party.name + (party.type === "other" ? " (new)" : ""), d.currency, String(d.total), String(d.openBalance), d.status, rate === 1 ? "" : String(rate), d.lines[0]?.description ?? ""], warnings: d.warnings });
  }
  plan.columns = ["Num", "Date", "Vendor", "Currency", "Total", "Open balance", "Status", "IDR rate", "Description"];
  plan.missingRates = [...missing].sort();
  plan.toInsert = plan.bills.length;
  if (plan.bills.length) plan.warnings.push(`bill lines go to ${expense.code} ${expense.name}; reclassify them in Books → Purchases when needed`);
  if (unresolved) plan.warnings.push(`${unresolved} bill${unresolved === 1 ? "" : "s"} reference a vendor that is not in the directory (Clients → Vendors) and keep the name only`);
  if (options.postToLedger && ap) {
    const postable = plan.bills.filter((b) => b.total > 0);
    plan.billPosting = { ap, accounts, bills: postable };
    plan.warnings.push(`${postable.length} journal entries will be posted (Dr ${expense.code} ${expense.name} / Cr ${ap.code} ${ap.name}); payments are not posted, reconcile them from the bank import`);
  }
  return plan;
}

// ---------- QuickBooks vendors ----------

/** Vendor (Supplier) Contact List → the vendor directory (shared by every set of books), deduplicated by name. */
async function planQboVendors(input: TableInput, world?: PlanWorld): Promise<ImportPlan> {
  const plan = emptyPlan("qbo_vendors");
  const parsed = parseQboVendors(input);
  plan.headers = parsed.headers; plan.rows = parsed.rowCount; plan.errors = [...parsed.errors]; plan.skipped = [...parsed.skipped]; plan.warnings = [...parsed.warnings];
  const vendors = world?.vendors ?? await db.list("vendors");
  const seen = new Set(vendors.map((v) => normName(v.name)));
  const now = new Date().toISOString();
  const source = world?.entity ? `Imported from QuickBooks (${world.entity.name}).` : "Imported from QuickBooks.";
  for (const d of parsed.drafts) {
    const key = normName(d.name);
    if (!key) { plan.skipped.push({ line: d.line, reason: "no vendor name" }); continue; }
    if (seen.has(key)) { plan.duplicates.push({ line: d.line, label: d.name, reason: "already in the vendor directory (same name)" }); continue; }
    seen.add(key);
    const vendor: Vendor = { id: db.newId(), name: d.name, category: "other", phone: d.phone, email: d.email, npwp: d.npwp, notes: [d.notes, source].filter(Boolean).join("\n"), active: !d.inactive, createdAt: now };
    plan.vendors.push(vendor);
    if (plan.sample.length < SAMPLE) plan.sample.push({ line: d.line, cells: [vendor.name, vendor.email ?? "", vendor.phone ?? "", vendor.npwp ?? "", vendor.active ? "active" : "inactive"], warnings: d.warnings });
  }
  plan.columns = ["Vendor", "Email", "Phone", "Tax ID", "Status"];
  plan.toInsert = plan.vendors.length;
  return plan;
}

// ---------- Public API ----------

/** Dry run: parses, dedupes and resolves links without writing anything. `world` replaces what would be read from the store. */
export async function prepareImport(kind: ImportKind, input: TableInput, options: ImportOptions = DEFAULT_IMPORT_OPTIONS, world?: PlanWorld): Promise<ImportPlan> {
  if (kind === "hubspot_contacts") return planHubspotContacts(input, options);
  if (kind === "qbo_customers") return planQboCustomers(input, world);
  if (kind === "qbo_accounts") return planQboAccounts(input, options, world);
  if (kind === "qbo_trial_balance") return planQboTrialBalance(input, options, world);
  if (kind === "qbo_journal") return planQboJournal(input, options, world);
  if (kind === "qbo_bills") return planQboBills(input, options, world);
  if (kind === "qbo_vendors") return planQboVendors(input, world);
  return planQboInvoices(input, options, world);
}

/** Writes a plan and records the batch. Posting errors (locked period, unbalanced) are captured per document or entry. */
export async function commitImport(plan: ImportPlan, fileName: string, byUserId?: string): Promise<ImportBatch> {
  if (plan.blocking) throw new Error(plan.blocking);
  const errors = plan.errors.map((e) => `line ${e.line}: ${e.message}`);
  const counts: ImportCounts = {};
  const add = (key: keyof ImportCounts, n: number) => { if (n) counts[key] = (counts[key] ?? 0) + n; return n; };
  let inserted = 0;
  if (plan.companies.length) inserted += add("companies", await db.insertMany("companies", plan.companies));
  if (plan.contacts.length) inserted += add("contacts", await db.insertMany("contacts", plan.contacts));
  for (const p of plan.companyPatches) await db.update("companies", p.id, p.patch);
  for (const p of plan.contactPatches) await db.update("contacts", p.id, p.patch);
  if (plan.vendors.length) inserted += add("vendors", await db.insertMany("vendors", plan.vendors));
  if (plan.accounts.length) inserted += add("accounts", await db.insertMany("accounts", plan.accounts));
  for (const p of plan.accountPatches) await db.update("accounts", p.id, p.patch);
  add("accountsMapped", plan.accountPatches.length);
  if (plan.journals.length) {
    // One bulk post for the whole file: validation, period locks and numbering as postJournal, a few round trips in all.
    const r = await postJournalsBulk(plan.entityId!, plan.journals.map((j) => ({ date: j.date, memo: j.memo, source: j.source, sourceId: j.sourceId, lines: j.lines })), { createdByUserId: byUserId });
    inserted += add("journals", r.posted);
    for (const e of r.errors) errors.push(`${plan.journals[e.index].label}: not posted (${e.message})`);
  }
  if (plan.bills.length) inserted += add("bills", await db.insertMany("bills", plan.bills));
  if (plan.billPosting) {
    const { accounts } = plan.billPosting;
    for (const bill of plan.billPosting.bills) {
      try {
        const je = await postJournal(bill.entityId, { date: bill.date, memo: `QBO bill ${bill.number} - ${bill.vendor.name}`, source: "bill", sourceId: bill.id, lines: billJournalLines(bill, accounts, { ppnCreditable: false }), createdByUserId: byUserId });
        await db.update("bills", bill.id, { journalId: je.id, updatedAt: new Date().toISOString() });
      } catch (e) {
        errors.push(`bill ${bill.number}: not posted (${e instanceof Error ? e.message : String(e)})`);
      }
    }
  }
  if (plan.invoices.length) inserted += add("invoices", await db.insertMany("invoices", plan.invoices));
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
    skipped: plan.duplicates.length + plan.skipped.length + plan.errors.length, errors, counts, byUserId, createdAt: new Date().toISOString(),
  };
  await db.insert("import_batches", batch);
  return batch;
}

/** Parse + write in one go (scripts, API). */
export async function runImport(kind: ImportKind, input: TableInput, fileName: string, options: ImportOptions = DEFAULT_IMPORT_OPTIONS, byUserId?: string): Promise<{ plan: ImportPlan; batch: ImportBatch }> {
  const plan = await prepareImport(kind, input, options);
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

export { type ContactDraft, type QboCustomerDraft, type InvoiceDraft, type AccountDraft };
