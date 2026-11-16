/**
 * Store side of "Migrate a company from QuickBooks" (Settings → Import → /settings/import/quickbooks).
 *
 * 1. Upload: every export (.xlsx, .xls, .csv) is read with lib/statement-file.ts, its QuickBooks report recognised
 *    (`detectQboReport`) and its grid kept server-side, gzipped, in `settings` (`qbo_wizard_file:<user>:<id>`, listed
 *    by `qbo_wizard:<user>:<target>`) until the import, then deleted.
 * 2. Plan: one dry run over all the files in the right order (chart, journal history or opening balances, vendors,
 *    customers, invoices, bills). Each step is a planner of lib/import-services.ts, handed the state the steps before
 *    it will leave (`PlanWorld`), so the preview and the import are the same plan. Rules in lib/qbo-migration.ts.
 * 3. Run: the plan is rebuilt against the store and committed step by step (`commitImport`: one ImportBatch per
 *    file, journals through `postJournalsBulk`). Everything is keyed (QBO name, sourceId, document number), so a
 *    second run with one more year file only adds what is missing.
 * 4. Proof: the app's trial balance at the date of the QuickBooks Trial Balance file, per account, against the
 *    QuickBooks figures; kept with the migration status (`settings` row `qbo_migration:<entityId>`) together with
 *    the QuickBooks figures, so the check can be run again later.
 */
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { db } from "./db";
import { addDays } from "./dates";
import { buildAccounts } from "./coa";
import { fiscalYearStartOf } from "./ledger";
import { sheetsFromFile } from "./statement-file";
import {
  detectQboReport, parseQboAccounts, parseQboBills, parseQboInvoices, parseQboJournal, parseQboTrialBalance, parseReportPeriod, sameCompanyName, tableFromGrid,
  type DateFormat, type ParsedTable, type QboReportKind,
} from "./importers";
import { commitImport, planCount, prepareImport, type ImportKind, type ImportOptions, type ImportPlan } from "./import-services";
import { bestTrialBalanceCheck, isImportableKind, migrationRules, QBO_KIND_LABELS, QBO_KIND_ORDER, QBO_MAX_FILE_BYTES, QBO_MAX_ROWS, QBO_NOT_IMPORTED, QBO_TOO_LARGE, type MigrationRules, type TbCheck } from "./qbo-migration";
import type { Account, Bill, Company, Contact, Entity, ImportBatch, Invoice, JournalEntry, QboMigration, Vendor } from "./types";

// ---------- Uploaded files (kept between upload, preview and import) ----------

/** One uploaded export, as the wizard lists it. */
export interface WizardFile {
  id: string;
  name: string;
  size: number;
  /** What the file was recognised as, and the kind in force (the user may override the detection). */
  detected: QboReportKind;
  kind: QboReportKind;
  reason: string;
  /** Data rows under the header, and what they amount to ("412 transactions", "58 accounts"). */
  rows: number;
  content: string;
  /** Dates covered (journal, documents), or the "as of" date of a trial balance in `to`. */
  from?: string;
  to?: string;
  /** Company name and period printed above the header. */
  company?: string;
  period?: string;
  /** The printed company does not look like the company chosen in the wizard. */
  companyMismatch: boolean;
  /** SHA-256 of the file: the same file dropped twice is kept once. */
  hash: string;
  uploadedAt: string;
}

export interface WizardOptions {
  dateFormat: DateFormat;
  /** IDR per unit of foreign currency, for invoices and bills whose file has no Exchange rate column. */
  fxRates: Record<string, number>;
  /** Date of the trial balance when the file does not print one. */
  asOf?: string;
  /** Add a client company's customers to ILA's directory (always done for ILA's own books). */
  customersToDirectory?: boolean;
}
export const DEFAULT_WIZARD_OPTIONS: WizardOptions = { dateFormat: "auto", fxRates: {} };

export interface WizardDraft { target: string; files: WizardFile[]; options: WizardOptions; updatedAt: string }

const draftKey = (userId: string, target: string) => `qbo_wizard:${userId}:${target}`;
const fileKey = (userId: string, fileId: string) => `qbo_wizard_file:${userId}:${fileId}`;

/** The grid as stored: trailing empty cells dropped, JSON, gzip, base64 (a 4 MB workbook becomes a few hundred KB). */
export function packGrid(grid: string[][]): string {
  const trimmed = grid.map((r) => { let n = r.length; while (n > 0 && (r[n - 1] ?? "") === "") n--; return r.slice(0, n); });
  return gzipSync(JSON.stringify(trimmed)).toString("base64");
}
export function unpackGrid(packed: string): string[][] {
  return JSON.parse(gunzipSync(Buffer.from(packed, "base64")).toString("utf8")) as string[][];
}

export async function loadWizard(userId: string, target: string): Promise<WizardDraft> {
  const v = (await db.get("settings", draftKey(userId, target)))?.value as WizardDraft | undefined;
  return v && Array.isArray(v.files) ? v : { target, files: [], options: DEFAULT_WIZARD_OPTIONS, updatedAt: new Date().toISOString() };
}

async function saveWizard(userId: string, draft: WizardDraft): Promise<WizardDraft> {
  const next = { ...draft, updatedAt: new Date().toISOString() };
  await db.upsert("settings", { id: draftKey(userId, draft.target), value: next, updatedAt: next.updatedAt });
  return next;
}

async function loadGrid(userId: string, fileId: string): Promise<string[][] | null> {
  const v = (await db.get("settings", fileKey(userId, fileId)))?.value as { grid?: string } | undefined;
  return v?.grid ? unpackGrid(v.grid) : null;
}

const minMax = (dates: string[]): { from?: string; to?: string } => (dates.length ? { from: dates.reduce((a, d) => (d < a ? d : a)), to: dates.reduce((a, d) => (d > a ? d : a)) } : {});
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** What a table holds once read as `kind`: its content in words and the dates it covers. */
export function describeTable(table: ParsedTable, kind: QboReportKind, dateFormat: DateFormat = "auto"): { content: string; from?: string; to?: string } {
  const period = parseReportPeriod(table.periodLine);
  if (kind === "journal") { const r = parseQboJournal(table, { dateFormat }); return { content: plural(r.drafts.length, "transaction"), ...minMax(r.drafts.map((d) => d.date)) }; }
  if (kind === "trial_balance") { const r = parseQboTrialBalance(table); return { content: `${plural(r.drafts.length, "account")}${r.asOf ? "" : ", no date printed"}`, from: r.from, to: r.asOf }; }
  if (kind === "invoices") { const r = parseQboInvoices(table, { dateFormat }); return { content: `${plural(r.drafts.length, "invoice")}, ${r.drafts.filter((d) => d.openBalance > 0).length} open`, ...minMax(r.drafts.map((d) => d.date)) }; }
  if (kind === "bills") { const r = parseQboBills(table, { dateFormat }); return { content: `${plural(r.drafts.length, "bill")}, ${r.drafts.filter((d) => d.openBalance > 0).length} open`, ...minMax(r.drafts.map((d) => d.date)) }; }
  if (kind === "accounts") return { content: plural(parseQboAccounts(table).drafts.length, "account"), ...period };
  if (kind === "customers") return { content: plural(table.rows.length, "customer"), ...period };
  if (kind === "vendors") return { content: plural(table.rows.length, "vendor"), ...period };
  return { content: plural(table.rows.length, "row"), ...period };
}

/**
 * Reads one uploaded export: size and type checked, the sheet that looks like a QuickBooks report chosen, the report
 * recognised. Throws with the advice to give the user when the file cannot be taken.
 */
export function readUpload(fileName: string, bytes: Buffer, companyNames: string[] = [], dateFormat: DateFormat = "auto"): { file: WizardFile; grid: string[][] } {
  if (bytes.length > QBO_MAX_FILE_BYTES) throw new Error(`${fileName} ${QBO_TOO_LARGE}`);
  if (!/\.(xlsx|xls|csv)$/i.test(fileName)) throw new Error(`${fileName}: only .xlsx, .xls and .csv exports are read (in QuickBooks: Export › Export to Excel).`);
  let sheets: ReturnType<typeof sheetsFromFile>;
  try { sheets = sheetsFromFile(fileName, bytes, QBO_MAX_ROWS); } catch { throw new Error(`${fileName} could not be opened as a spreadsheet. Export it again from QuickBooks (Export › Export to Excel).`); }
  const read = sheets.filter((s) => s.grid.length > 0).map((s) => { const table = tableFromGrid(s.grid); return { grid: s.grid, table, detection: detectQboReport(table) }; });
  const chosen = read.find((r) => r.detection.kind !== "unknown") ?? read[0];
  if (!chosen) throw new Error(`${fileName} has no rows.`);
  if (chosen.grid.length >= QBO_MAX_ROWS) throw new Error(`${fileName} has ${QBO_MAX_ROWS.toLocaleString("en-US")} rows or more, which is more than one file may hold: export a shorter period per file (one year, or six months for a busy company) and upload the parts together.`);
  const { table, detection } = chosen;
  const file: WizardFile = {
    id: db.newId(), name: fileName, size: bytes.length, detected: detection.kind, kind: detection.kind, reason: detection.reason, rows: table.rows.length,
    ...describeTable(table, detection.kind, dateFormat), company: table.companyName, period: table.periodLine,
    companyMismatch: Boolean(table.companyName) && companyNames.length > 0 && !companyNames.some((n) => sameCompanyName(table.companyName, n)),
    hash: createHash("sha256").update(bytes).digest("hex"), uploadedAt: new Date().toISOString(),
  };
  return { file, grid: chosen.grid };
}

/**
 * Stores an uploaded export with the pending migration of `target`. The same file dropped again replaces its earlier
 * upload; two different files stay side by side even under one name (QuickBooks names every year's export alike).
 */
export async function addWizardFile(userId: string, target: string, fileName: string, bytes: Buffer, companyNames: string[]): Promise<WizardFile> {
  const draft = await loadWizard(userId, target);
  const { file, grid } = readUpload(fileName, bytes, companyNames, draft.options.dateFormat);
  await db.upsert("settings", { id: fileKey(userId, file.id), value: { grid: packGrid(grid) }, updatedAt: file.uploadedAt });
  const same = (f: WizardFile) => f.hash === file.hash;
  for (const old of draft.files.filter(same)) await db.remove("settings", fileKey(userId, old.id));
  await saveWizard(userId, { ...draft, files: [...draft.files.filter((f) => !same(f)), file] });
  return file;
}

/** Overrides the detected kind of a pending file and describes it again as that kind. */
export async function setWizardFileKind(userId: string, target: string, fileId: string, kind: QboReportKind): Promise<WizardDraft> {
  const draft = await loadWizard(userId, target);
  const file = draft.files.find((f) => f.id === fileId);
  if (!file) return draft;
  const grid = await loadGrid(userId, fileId);
  const described = grid ? describeTable(tableFromGrid(grid), kind, draft.options.dateFormat) : { content: file.content };
  return saveWizard(userId, { ...draft, files: draft.files.map((f) => (f.id === fileId ? { ...f, from: undefined, to: undefined, ...described, kind } : f)) });
}

export async function removeWizardFile(userId: string, target: string, fileId: string): Promise<WizardDraft> {
  const draft = await loadWizard(userId, target);
  await db.remove("settings", fileKey(userId, fileId));
  return saveWizard(userId, { ...draft, files: draft.files.filter((f) => f.id !== fileId) });
}

/** Saves the options; a new date format changes the dates each file covers, so the files are described again. */
export async function setWizardOptions(userId: string, target: string, options: WizardOptions): Promise<WizardDraft> {
  const draft = await loadWizard(userId, target);
  let files = draft.files;
  if (options.dateFormat !== draft.options.dateFormat) {
    files = [];
    for (const f of draft.files) { const grid = await loadGrid(userId, f.id); files.push(grid ? { ...f, from: undefined, to: undefined, ...describeTable(tableFromGrid(grid), f.kind, options.dateFormat) } : f); }
  }
  return saveWizard(userId, { ...draft, files, options });
}

/** Deletes the pending uploads of `target` (after the import, or on "Start over"). */
export async function discardWizard(userId: string, target: string): Promise<void> {
  const draft = await loadWizard(userId, target);
  for (const f of draft.files) await db.remove("settings", fileKey(userId, f.id));
  await db.remove("settings", draftKey(userId, target));
}

/** The pending uploads follow the company once its books exist (`company:<id>` → `entity:<id>`). */
export async function moveWizard(userId: string, from: string, to: string): Promise<void> {
  if (from === to) return;
  const draft = await loadWizard(userId, from);
  await saveWizard(userId, { ...draft, target: to });
  await db.remove("settings", draftKey(userId, from));
}

export interface WizardTable { file: WizardFile; table: ParsedTable }

/** The pending files with their tables, ready to plan. Files whose stored grid is gone are dropped. */
export async function loadWizardTables(userId: string, draft: WizardDraft): Promise<WizardTable[]> {
  const out: WizardTable[] = [];
  for (const file of draft.files) { const grid = await loadGrid(userId, file.id); if (grid) out.push({ file, table: tableFromGrid(grid) }); }
  return out;
}

// ---------- The combined plan ----------

/** Everything the plan reads from the store. `virtual`: the company has no books yet, the standard chart stands in. */
export interface MigrationWorld {
  entity: Entity;
  virtual: boolean;
  accounts: Account[];
  entries: JournalEntry[];
  invoices: Invoice[];
  bills: Bill[];
  vendors: Vendor[];
  companies: Company[];
  contacts: Contact[];
}

export async function loadMigrationWorld(entity: Entity, virtual = false): Promise<MigrationWorld> {
  const [vendors, companies, contacts] = await Promise.all([db.list("vendors"), db.list("companies"), db.list("contacts")]);
  if (virtual) return { entity, virtual, accounts: buildAccounts(entity.id, () => db.newId(), { country: entity.country }), entries: [], invoices: [], bills: [], vendors, companies, contacts };
  const where = { entityId: entity.id };
  const [accounts, entries, invoices, bills] = await Promise.all([db.list("accounts", { where }), db.list("journal_entries", { where }), db.list("invoices", { where }), db.list("bills", { where })]);
  return { entity, virtual, accounts, entries, invoices, bills, vendors, companies, contacts };
}

export type MigrationStepKey = "accounts" | "journal" | "opening" | "vendors" | "customers" | "invoices" | "bills";
export interface MigrationStep { key: MigrationStepKey; file: WizardFile; importKind: ImportKind; plan: ImportPlan }

export interface MigrationPlan {
  entityName: string;
  createsBooks: boolean;
  rules: MigrationRules;
  steps: MigrationStep[];
  notImported: Array<{ fileName: string; kind: QboReportKind; reason: string }>;
  /** The QuickBooks trial balance the books will be checked against. */
  trialBalance?: NonNullable<QboMigration["trialBalance"]>;
  /** The check as it will come out once every step is written (computed on the dry run). */
  expectedCheck?: TbCheck;
  warnings: string[];
  blocking?: string;
}

const STEP_OF: Partial<Record<QboReportKind, { key: MigrationStepKey; importKind: ImportKind }>> = {
  accounts: { key: "accounts", importKind: "qbo_accounts" }, journal: { key: "journal", importKind: "qbo_journal" }, vendors: { key: "vendors", importKind: "qbo_vendors" },
  customers: { key: "customers", importKind: "qbo_customers" }, invoices: { key: "invoices", importKind: "qbo_invoices" }, bills: { key: "bills", importKind: "qbo_bills" },
};

/** First days the income and expense accounts may be summed from in QuickBooks' trial balance, most likely first. */
function plFromCandidates(entity: Entity, tb: { asOf: string; from?: string }): Array<string | undefined> {
  return [tb.from, fiscalYearStartOf(tb.asOf, entity.fiscalYearStartMonth), undefined].filter((c, i) => i > 0 || c !== undefined);
}

/**
 * The combined dry run. Files are applied in `QBO_KIND_ORDER` (journal files oldest first); after each step the
 * world is advanced by what the step will write, so the next step plans against it. With a Journal the Trial Balance
 * is only the check; without one it is posted as the opening entry. Invoices and bills never post. Accounts the
 * Journal or the Trial Balance use but the chart lacks are created from their name (listed on each plan's
 * `guessedAccounts`). What earlier runs posted is respected: a Trial Balance is never posted on top of a migrated
 * ledger, and a Journal added after opening balances only posts what is dated after them.
 */
export async function buildMigrationPlan(world: MigrationWorld, tables: WizardTable[], options: WizardOptions = DEFAULT_WIZARD_OPTIONS): Promise<MigrationPlan> {
  const { entity } = world;
  const ordered = [...tables].sort((a, b) => QBO_KIND_ORDER.indexOf(a.file.kind) - QBO_KIND_ORDER.indexOf(b.file.kind) || (a.file.from ?? "").localeCompare(b.file.from ?? "") || a.file.uploadedAt.localeCompare(b.file.uploadedAt));
  // Only one trial balance counts: the latest.
  const tbs = ordered.filter((t) => t.file.kind === "trial_balance").map((t) => ({ t, parsed: parseQboTrialBalance(t.table) }));
  const tb = tbs.reduce<typeof tbs[number] | undefined>((best, x) => (!best || (x.parsed.asOf ?? options.asOf ?? "") >= (best.parsed.asOf ?? options.asOf ?? "") ? x : best), undefined);
  const tbDate = options.asOf ?? tb?.parsed.asOf;
  // What earlier imports left in the ledger decides what may still be posted without counting anything twice.
  const live = world.entries.filter((e) => e.status !== "void" && e.sourceId?.startsWith("qbo:"));
  const openingDate = live.filter((e) => e.source === "opening" && e.sourceId!.startsWith("qbo:tb:")).map((e) => e.date).sort().pop();
  const historyPosted = live.some((e) => !e.sourceId!.startsWith("qbo:tb:"));
  const rules = migrationRules(tables.map((t) => t.file.kind), { ledgerMigrated: historyPosted || (openingDate !== undefined && openingDate !== tbDate) });
  const plan: MigrationPlan = { entityName: entity.name, createsBooks: world.virtual, rules, steps: [], notImported: [], warnings: [] };
  // Opening balances already stand for everything up to their date: a journal file only adds what comes after.
  const journalFrom = openingDate && rules.postJournal ? addDays(openingDate, 1) : undefined;
  if (journalFrom) plan.warnings.push(`Opening balances from a QuickBooks trial balance are already posted as of ${openingDate}: journal entries up to that date are skipped (the opening balances include them), later ones are posted.`);
  const base: ImportOptions = { dateFormat: options.dateFormat, fxRates: options.fxRates, postToLedger: false, entityId: entity.id, createMissingAccounts: true };
  let accounts = [...world.accounts];
  let companies = world.companies, contacts = world.contacts;
  const entries: JournalEntry[] = [...world.entries];
  const invoices = [...world.invoices], bills = [...world.bills], vendors = [...world.vendors];
  /** Advances the world by one planned step. */
  const advance = (p: ImportPlan) => {
    const patches = new Map(p.accountPatches.map((x) => [x.id, x.patch] as const));
    accounts = [...accounts.map((a) => (patches.has(a.id) ? { ...a, ...patches.get(a.id) } : a)), ...p.accounts];
    for (const j of p.journals) entries.push({ id: "", entityId: entity.id, number: "(new)", date: j.date, period: j.date.slice(0, 7), memo: j.memo, source: j.source, sourceId: j.sourceId, lines: j.lines, status: "posted", createdAt: "" });
    invoices.push(...p.invoices); bills.push(...p.bills); vendors.push(...p.vendors);
    if (p.companies.length || p.companyPatches.length) { const cp = new Map(p.companyPatches.map((x) => [x.id, x.patch] as const)); companies = [...companies.map((c) => (cp.has(c.id) ? { ...c, ...cp.get(c.id) } : c)), ...p.companies]; }
    if (p.contacts.length || p.contactPatches.length) { const cp = new Map(p.contactPatches.map((x) => [x.id, x.patch] as const)); contacts = [...contacts.map((c) => (cp.has(c.id) ? { ...c, ...cp.get(c.id) } : c)), ...p.contacts]; }
  };
  const step = async (t: WizardTable, key: MigrationStepKey, importKind: ImportKind, extra: Partial<ImportOptions> = {}) => {
    const p = await prepareImport(importKind, t.table, { ...base, ...extra }, { entity, accounts, entries, invoices, bills, vendors, companies, contacts });
    plan.steps.push({ key, file: t.file, importKind, plan: p });
    if (p.blocking && !plan.blocking) plan.blocking = `${t.file.name}: ${p.blocking}`;
    advance(p);
  };
  for (const t of ordered) {
    const kind = t.file.kind;
    if (!isImportableKind(kind)) { plan.notImported.push({ fileName: t.file.name, kind, reason: QBO_NOT_IMPORTED[kind] ?? "Not imported." }); continue; }
    if (kind === "trial_balance") {
      if (t !== tb?.t) { plan.notImported.push({ fileName: t.file.name, kind, reason: `Only the latest trial balance is used (${tb?.t.file.name}).` }); continue; }
      const asOf = tbDate;
      if (rules.postOpening) await step(t, "opening", "qbo_trial_balance", { fromDate: asOf });
      if (asOf) plan.trialBalance = { fileName: t.file.name, asOf, from: tb.parsed.from, rows: tb.parsed.drafts.map((r) => ({ account: r.account, debit: r.debit, credit: r.credit })) };
      else plan.warnings.push(`${t.file.name} does not print its date ("As of …"): enter the trial balance date in the options to run the check.`);
      for (const w of tb.parsed.warnings) plan.warnings.push(`${t.file.name}: ${w}`);
      continue;
    }
    if (kind === "customers" && !entity.isOwn && !options.customersToDirectory) {
      plan.notImported.push({ fileName: t.file.name, kind, reason: `Not added to the directory: it lists ${entity.name}'s customers, and the directory holds ILA's clients. Their names stay on the invoices and journal lines. Tick "Add this company's customers to the directory" to import them anyway.` });
      continue;
    }
    const s = STEP_OF[kind]!;
    await step(t, s.key, s.importKind, kind === "journal" ? { fromDate: journalFrom } : {});
  }
  if (plan.trialBalance) plan.expectedCheck = bestTrialBalanceCheck({ rows: plan.trialBalance.rows, accounts, entries, asOf: plan.trialBalance.asOf }, plFromCandidates(entity, plan.trialBalance));
  return plan;
}

// ---------- What the browser shows ----------

export interface StepView {
  key: MigrationStepKey;
  title: string;
  fileName: string;
  /** What the step writes, in words ("412 journal entries", "3 new accounts"). */
  writes: string[];
  toWrite: number;
  duplicates: number;
  skipped: number;
  errorCount: number;
  errors: string[];
  warnings: string[];
  blocking?: string;
}

export interface PlanView {
  entityName: string;
  createsBooks: boolean;
  mode: MigrationRules["mode"];
  notes: string[];
  steps: StepView[];
  /** Accounts created from a name in the journal or the trial balance: the type is a guess. */
  guessedAccounts: Array<{ qboName: string; code: string; name: string; type: string; fileName: string }>;
  notImported: MigrationPlan["notImported"];
  warnings: string[];
  blocking?: string;
  totalWrites: number;
  check?: TbCheck;
}

const STEP_TITLES: Record<MigrationStepKey, string> = {
  accounts: "Chart of accounts", journal: "Journal history", opening: "Opening balances", vendors: "Vendors", customers: "Customers", invoices: "Invoices (documents, no posting)", bills: "Bills (documents, no posting)",
};
const MAX_LISTED = 40;
/** A check as sent to the browser: every differing account, and the matching ones up to a limit. */
export function trimCheck(check: TbCheck, max = 400): TbCheck {
  const differing = check.rows.filter((r) => r.difference !== 0);
  return { ...check, rows: [...differing, ...check.rows.filter((r) => r.difference === 0)].slice(0, Math.max(max, differing.length)) };
}

export function planView(plan: MigrationPlan): PlanView {
  const steps: StepView[] = plan.steps.map(({ key, file, plan: p }) => {
    const writes: string[] = [];
    const guessed = p.guessedAccounts.length;
    if (key === "accounts") { if (p.accounts.length) writes.push(plural(p.accounts.length, "new account")); if (p.accountPatches.length) writes.push(`${plural(p.accountPatches.length, "existing account")} mapped`); }
    if (key === "journal") writes.push(plural(p.journals.length, "journal entry", "journal entries"));
    if (key === "opening" && p.journals.length) writes.push(`1 opening entry dated ${p.journals[0].date} (${p.journals[0].lines.length} lines)`);
    if ((key === "journal" || key === "opening") && guessed) writes.push(`${plural(guessed, "account")} created from the name`);
    if (key === "vendors") writes.push(plural(p.vendors.length, "vendor"));
    if (key === "customers") { writes.push(plural(p.companies.length, "company", "companies"), plural(p.contacts.length, "contact")); if (p.companyPatches.length + p.contactPatches.length) writes.push(`${p.companyPatches.length + p.contactPatches.length} existing linked`); }
    if (key === "invoices") writes.push(`${plural(p.invoices.length, "invoice")} (${p.invoices.filter((i) => i.status !== "paid").length} open)`);
    if (key === "bills") writes.push(`${plural(p.bills.length, "bill")} (${p.bills.filter((b) => b.status !== "paid").length} open)`);
    return {
      key, title: STEP_TITLES[key], fileName: file.name, writes, toWrite: planCount(p), duplicates: p.duplicates.length, skipped: p.skipped.length, errorCount: p.errors.length,
      errors: p.errors.slice(0, MAX_LISTED).map((e) => `line ${e.line}: ${e.message}`), warnings: p.warnings, blocking: p.blocking,
    };
  });
  return {
    entityName: plan.entityName, createsBooks: plan.createsBooks, mode: plan.rules.mode, notes: plan.rules.notes, steps,
    guessedAccounts: plan.steps.flatMap((s) => s.plan.guessedAccounts.map((g) => ({ qboName: g.qboName, code: g.code, name: g.name, type: `${g.type} / ${g.subtype}`, fileName: s.file.name }))),
    notImported: plan.notImported, warnings: plan.warnings, blocking: plan.blocking, totalWrites: steps.reduce((s, x) => s + x.toWrite, 0), check: plan.expectedCheck ? trimCheck(plan.expectedCheck) : undefined,
  };
}

// ---------- Status per company ----------

const migrationKey = (entityId: string) => `qbo_migration:${entityId}`;
const EMPTY_COUNTS: QboMigration["counts"] = { accountsCreated: 0, accountsMapped: 0, journalEntries: 0, openingEntries: 0, invoices: 0, bills: 0, vendors: 0, customers: 0 };

export async function loadMigration(entityId: string): Promise<QboMigration | null> {
  const v = (await db.get("settings", migrationKey(entityId)))?.value as QboMigration | undefined;
  return v && v.entityId === entityId ? v : null;
}

/** Migration status of several entities in one read. */
export async function loadMigrations(entityIds: string[]): Promise<Map<string, QboMigration>> {
  const rows = await db.getMany("settings", entityIds.map(migrationKey));
  const out = new Map<string, QboMigration>();
  for (const row of rows.values()) { const v = row.value as QboMigration | undefined; if (v?.entityId) out.set(v.entityId, v); }
  return out;
}

async function saveMigration(m: QboMigration): Promise<QboMigration> {
  const next = { ...m, updatedAt: new Date().toISOString() };
  await db.upsert("settings", { id: migrationKey(m.entityId), value: next, updatedAt: next.updatedAt });
  return next;
}

/** Compares the books as they are now with the stored QuickBooks trial balance and records the result. Null when no trial balance was ever given. */
export async function checkMigration(entity: Entity, byUserId?: string): Promise<{ migration: QboMigration; check: TbCheck } | null> {
  const migration = await loadMigration(entity.id);
  if (!migration?.trialBalance) return null;
  const where = { entityId: entity.id };
  const [accounts, entries] = await Promise.all([db.list("accounts", { where }), db.list("journal_entries", { where: { ...where, status: "posted" } })]);
  const tb = migration.trialBalance;
  const check = bestTrialBalanceCheck({ rows: tb.rows, accounts, entries, asOf: tb.asOf }, plFromCandidates(entity, tb));
  const saved = await saveMigration({
    ...migration, status: check.matches ? "checked_ok" : "differences",
    lastCheck: { at: new Date().toISOString(), byUserId, asOf: check.asOf, plFrom: check.plFrom, accounts: check.accounts, differences: check.differences, qboDebit: check.qboDebit, qboCredit: check.qboCredit, appDebit: check.appDebit, appCredit: check.appCredit },
  });
  return { migration: saved, check };
}

// ---------- Run ----------

export interface MigrationResult {
  entityId: string;
  entityName: string;
  steps: Array<{ key: MigrationStepKey; title: string; fileName: string; inserted: number; skipped: number; errors: string[]; errorCount: number; failed?: string }>;
  /** A step threw (database error): the steps after it were not run and the uploads are kept for a retry. */
  failed: boolean;
  check?: TbCheck;
  migration: QboMigration;
}

/**
 * Writes the pending migration of `target` into `entity` (which exists: the caller creates the books of a company
 * without books first). The plan is rebuilt from the stored files against the store, committed step by step, then
 * checked against the trial balance; the status is saved and, when every step ran, the uploads are deleted.
 */
export async function runMigration(user: { id: string; name?: string }, target: string, entity: Entity): Promise<MigrationResult> {
  const draft = await loadWizard(user.id, target);
  const tables = await loadWizardTables(user.id, draft);
  if (tables.length === 0) throw new Error("Nothing is pending: upload the QuickBooks exports first.");
  const plan = await buildMigrationPlan(await loadMigrationWorld(entity), tables, draft.options);
  if (plan.blocking) throw new Error(plan.blocking);
  const previous = await loadMigration(entity.id);
  const counts = { ...EMPTY_COUNTS, ...previous?.counts };
  const files = [...(previous?.files ?? [])];
  const steps: MigrationResult["steps"] = [];
  let failed = false;
  for (const s of plan.steps) {
    let batch: ImportBatch;
    try { batch = await commitImport(s.plan, s.file.name, user.id); }
    catch (e) { steps.push({ key: s.key, title: STEP_TITLES[s.key], fileName: s.file.name, inserted: 0, skipped: 0, errors: [], errorCount: 0, failed: e instanceof Error ? e.message : String(e) }); failed = true; break; }
    const c = batch.counts ?? {};
    counts.accountsCreated += c.accounts ?? 0; counts.accountsMapped += c.accountsMapped ?? 0; counts.invoices += c.invoices ?? 0; counts.bills += c.bills ?? 0; counts.vendors += c.vendors ?? 0;
    counts.customers += (c.companies ?? 0) + (c.contacts ?? 0);
    if (s.key === "opening") counts.openingEntries += c.journals ?? 0; else counts.journalEntries += c.journals ?? 0;
    steps.push({ key: s.key, title: STEP_TITLES[s.key], fileName: s.file.name, inserted: batch.inserted, skipped: batch.skipped, errors: batch.errors.slice(0, MAX_LISTED), errorCount: batch.errors.length });
    files.push({ name: s.file.name, kind: QBO_KIND_LABELS[s.file.kind], rows: s.file.rows, from: s.file.from, to: s.file.to, at: batch.createdAt, byUserId: user.id, byName: user.name });
  }
  const tbFile = plan.trialBalance ? tables.find((t) => t.file.name === plan.trialBalance!.fileName)?.file : undefined;
  if (tbFile && !failed && !plan.rules.postOpening) files.push({ name: tbFile.name, kind: `${QBO_KIND_LABELS.trial_balance} (check)`, rows: tbFile.rows, from: tbFile.from, to: tbFile.to, at: new Date().toISOString(), byUserId: user.id, byName: user.name });
  let migration = await saveMigration({
    entityId: entity.id, status: "in_progress", files: files.slice(-200), counts,
    trialBalance: plan.trialBalance ?? previous?.trialBalance, lastCheck: previous?.lastCheck, updatedAt: "",
  });
  let check: TbCheck | undefined;
  if (!failed && migration.trialBalance) { const r = await checkMigration(entity, user.id); if (r) { migration = r.migration; check = trimCheck(r.check); } }
  if (!failed) await discardWizard(user.id, target);
  return { entityId: entity.id, entityName: entity.name, steps, failed, check, migration };
}
