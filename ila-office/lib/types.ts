/**
 * Shared domain model for ILA Office. Every module (CRM, Books, Tax, Payroll) builds against these
 * types, and every record is stored as a JSON document keyed by `id` (see lib/db.ts).
 *
 * Conventions
 * - Money: integer minor units are NOT used. IDR has no cents, so amounts are plain numbers of rupiah
 *   (integers). Foreign-currency documents keep their own `currency` + `fxRate` (units of IDR per 1 unit
 *   of the foreign currency) and the ledger always posts the IDR equivalent.
 * - Dates: ISO `YYYY-MM-DD` strings. Timestamps: ISO 8601 strings. Periods: `YYYY-MM`, `YYYY-Qn`, `YYYY`.
 * - `entityId`: the set of books a record belongs to. ILA itself is an entity (`isOwn: true`); each
 *   client company whose accounting ILA manages is another entity.
 */

// ---------- Core ----------

export type Role = "admin" | "consultant" | "accountant" | "viewer";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export const ENTITY_TYPES = ["pt_pma", "pt_pmdn", "pt_perorangan", "cv", "hk_ltd", "ph_opc", "individual", "other"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  pt_pma: "PT PMA (foreign-owned)", pt_pmdn: "PT PMDN (local)", pt_perorangan: "PT Perorangan", cv: "CV",
  hk_ltd: "Hong Kong Limited", ph_opc: "Philippines OPC", individual: "Individual", other: "Other",
};

/** Corporate income tax regime applied when computing the annual return. */
export type TaxRegime = "final_0_5" | "art_31e" | "normal_22" | "hk_profits_tax" | "none";
export const TAX_REGIME_LABELS: Record<TaxRegime, string> = {
  final_0_5: "PPh Final 0.5% (PP 55/2022, turnover < 4.8 bn, grandfathered)",
  art_31e: "Art. 31E reduced rate (turnover ≤ 50 bn)",
  normal_22: "Normal CIT 22%",
  hk_profits_tax: "Hong Kong profits tax (two-tier)",
  none: "No corporate tax (individual / dormant)",
};

export interface Entity {
  id: string;
  name: string;
  legalName: string;
  type: EntityType;
  country: string; // ISO-2
  /** ILA's own books. */
  isOwn: boolean;
  npwp?: string;
  nib?: string;
  aktaNumber?: string;
  address?: string;
  city?: string;
  region?: string; // Bali, Lombok, Sumba, Jakarta…
  baseCurrency: string; // "IDR"
  fiscalYearStartMonth: number; // 1 = January
  /** Tax profile. */
  tax: {
    regime: TaxRegime;
    /** Pengusaha Kena Pajak: registered for VAT. */
    pkp: boolean;
    ppnRate: number; // 0.11 or 0.12
    /** Monthly PPh 25 instalment, if any. */
    pph25Monthly?: number;
    /** Local (regional) tax rate on turnover, e.g. 0.10 for PB1 hotel/restaurant, 0.15 spa. */
    localTaxRate?: number;
    /** Must file quarterly LKPM investment reports (every PT PMA, and PMDN above thresholds). */
    lkpm: boolean;
    /** Has employees on payroll (PPh 21 + BPJS obligations). */
    payroll: boolean;
    kppOffice?: string;
    taxRegimeStartYear?: number;
  };
  /** CRM link: the client company these books belong to. */
  crmCompanyId?: string;
  /** Portal/ops links. */
  driveFolderUrl?: string;
  qboRealmId?: string;
  status: "active" | "dormant" | "closed";
  createdAt: string;
  updatedAt?: string;
}

// ---------- CRM ----------

export const REGIONS = ["Bali", "Lombok", "Sumba", "Flores", "Jakarta", "Hong Kong", "Philippines", "Other"] as const;

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  nationality?: string; // ISO-2
  language?: string; // en, fr, es, ru, id…
  passportNumber?: string;
  passportExpiry?: string;
  dateOfBirth?: string;
  source?: string; // referral, website, instagram, partner…
  ownerUserId?: string;
  companyIds: string[];
  tags: string[];
  notes?: string;
  hubspotId?: string;
  qboCustomerId?: string;
  driveFolderUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export type CompanyStatus = "lead" | "active" | "inactive";

export interface Company {
  id: string;
  name: string;
  type: EntityType | "prospect";
  country: string;
  region?: (typeof REGIONS)[number] | string;
  npwp?: string;
  nib?: string;
  aktaNumber?: string;
  address?: string;
  primaryContactId?: string;
  /** Books managed by ILA live in this entity. */
  entityId?: string;
  status: CompanyStatus;
  /** Recurring engagements billed to this client (monthly tax, bookkeeping, payroll…). */
  subscriptions: Array<{ serviceId: string; label: string; amount: number; currency: string; cadence: "monthly" | "quarterly" | "annual"; startedAt: string; endedAt?: string }>;
  ownerUserId?: string;
  driveFolderUrl?: string;
  qboCustomerId?: string;
  hubspotId?: string;
  tags: string[];
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Deal stages mirror ILA's HubSpot pipeline (probabilities 20/40/60/80/90/100/0). */
export const DEAL_STAGES = ["prospect", "qualified", "quotation_sent", "review", "invoice_sent", "closed_won", "closed_lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  prospect: "Prospect", qualified: "Qualified", quotation_sent: "Quotation sent", review: "Review",
  invoice_sent: "Invoice sent", closed_won: "Closed won", closed_lost: "Closed lost",
};
export const DEAL_STAGE_PROBABILITY: Record<DealStage, number> = {
  prospect: 0.2, qualified: 0.4, quotation_sent: 0.6, review: 0.8, invoice_sent: 0.9, closed_won: 1, closed_lost: 0,
};

export const SERVICE_CATEGORIES = ["corporate", "visa", "tax_accounting", "payroll_eor", "legal_property", "licensing", "advisory", "disbursement"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  corporate: "Corporate & company secretarial", visa: "Visa & immigration", tax_accounting: "Tax & accounting",
  payroll_eor: "Payroll & employer of record", legal_property: "Legal & property", licensing: "Licensing & permits",
  advisory: "Advisory & consulting", disbursement: "Government fees & disbursements",
};

export interface Deal {
  id: string;
  title: string;
  companyId?: string;
  contactId?: string;
  stage: DealStage;
  amount: number;
  currency: string;
  category?: ServiceCategory;
  ownerUserId?: string;
  expectedCloseDate?: string;
  quoteId?: string;
  projectId?: string;
  lostReason?: string;
  source?: string;
  nextStep?: string;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string;
}

export type Cadence = "none" | "monthly" | "quarterly" | "annual" | "biennial";

/** Catalogue item. Prices are list prices in IDR; quotes can override and can be issued in USD/EUR. */
export interface ServiceItem {
  id: string;
  code: string;
  category: ServiceCategory;
  name: string;
  description?: string;
  unit: string; // each, per year, per month, per person, per agreement, per class…
  priceIDR: number;
  priceUSD?: number;
  priceEUR?: number;
  cadence: Cadence;
  /** Months until this service must be renewed (commercial address 12, investor KITAS 24, working KITAS 12). */
  renewalMonths?: number;
  /** "out_of_scope" (ILA bills without PPN, QBO tax code 4) or "ppn". */
  taxTreatment: "out_of_scope" | "ppn";
  /** Government fee or third-party cost typically embedded (e.g. USD 1,200 IMTA inside a working KITAS). */
  includesNote?: string;
  active: boolean;
  sortOrder?: number;
}

export interface QuoteLine {
  id: string;
  serviceId?: string;
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
  note?: string;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";

export interface Quote {
  id: string;
  number: string; // Q-2026-0001
  title: string;
  companyId?: string;
  contactId?: string;
  dealId?: string;
  currency: string;
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  total: number;
  validUntil: string; // ILA quotes are valid 7 days
  terms: string;
  scopeNotes?: string;
  documentsNeeded?: string;
  status: QuoteStatus;
  preparedByUserId?: string;
  createdAt: string;
  sentAt?: string;
  acceptedAt?: string;
  updatedAt?: string;
}

export const PROJECT_STATUSES = ["new", "waiting_client", "waiting_payment", "in_progress", "submitted", "done", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  new: "New", waiting_client: "Waiting for client", waiting_payment: "Waiting for payment", in_progress: "In progress",
  submitted: "Submitted to authority", done: "Done", cancelled: "Cancelled",
};

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  doneAt?: string;
  doneBy?: string;
  dueDate?: string;
}

/** One line of the project's cost of sales (government fee, notary, Kanim agent…), per ILA's Cost of Sales SOP. */
export interface CostLine {
  id: string;
  description: string;
  vendorId?: string;
  vendorName?: string;
  amountIDR: number;
  amountUSD?: number;
  approved: boolean;
  approvedByUserId?: string;
  approvedAt?: string;
  paidAt?: string;
  billId?: string;
  note?: string;
}

/** A matter / job: a visa application, an incorporation, a due diligence, a licence… */
export interface Project {
  id: string;
  number: string; // P-2026-0001
  title: string;
  category: ServiceCategory;
  serviceId?: string;
  companyId?: string;
  contactId?: string;
  dealId?: string;
  quoteId?: string;
  status: ProjectStatus;
  /** "Project owner" in the SOP: approves cost lines. */
  ownerUserId?: string;
  assigneeUserId?: string;
  /** Person the service is for (visa holder, director…). */
  subject?: { name: string; passportNumber?: string; nationality?: string; dateOfBirth?: string };
  feeAmount: number;
  feeCurrency: string;
  invoiceRef?: string; // internal invoice id or QBO doc number
  checklist: ChecklistItem[];
  costOfSales: CostLine[];
  startedAt?: string;
  dueDate?: string;
  submittedAt?: string;
  completedAt?: string;
  /** When the deliverable expires (KITAS validity, licence validity); feeds the renewal tracker. */
  expiresAt?: string;
  driveFolderUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export const VENDOR_CATEGORIES = ["notary", "kanim", "bkpm", "oss", "pbg", "pupr", "sktt", "sim", "dora", "agent", "bank", "government", "other"] as const;
export interface Vendor {
  id: string;
  name: string;
  category: (typeof VENDOR_CATEGORIES)[number];
  region?: string;
  phone?: string;
  email?: string;
  npwp?: string;
  bankAccount?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
}

export const RENEWAL_KINDS = ["kitas", "visa", "passport", "commercial_address", "resident_director", "commissioner", "local_shareholder", "licence", "gms", "lkpm", "other"] as const;
export type RenewalKind = (typeof RENEWAL_KINDS)[number];
export const RENEWAL_KIND_LABELS: Record<RenewalKind, string> = {
  kitas: "KITAS / stay permit", visa: "Visa", passport: "Passport", commercial_address: "Commercial address / virtual office",
  resident_director: "Resident director", commissioner: "Commissioner", local_shareholder: "Local shareholder",
  licence: "Licence / certificate", gms: "Annual GMS (RUPS)", lkpm: "LKPM", other: "Other",
};

export interface Renewal {
  id: string;
  kind: RenewalKind;
  label: string;
  companyId?: string;
  contactId?: string;
  projectId?: string;
  serviceId?: string;
  expiresAt: string;
  reminderDays: number; // e.g. 60
  status: "upcoming" | "reminded" | "quoted" | "renewed" | "lapsed" | "cancelled";
  renewalProjectId?: string;
  ownerUserId?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type ActivityKind = "note" | "call" | "email" | "whatsapp" | "meeting" | "status" | "system";
export interface Activity {
  id: string;
  kind: ActivityKind;
  subject: string;
  body?: string;
  at: string;
  byUserId?: string;
  byName?: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
  projectId?: string;
  quoteId?: string;
  entityId?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  dueDate?: string;
  done: boolean;
  doneAt?: string;
  assigneeUserId?: string;
  related?: { type: "contact" | "company" | "deal" | "project" | "quote" | "entity" | "obligation"; id: string };
  createdAt: string;
}

// ---------- Books (double-entry, per entity) ----------

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export const ACCOUNT_SUBTYPES = [
  "cash", "bank", "ar", "other_receivable", "inventory", "prepaid", "prepaid_tax", "fixed_asset", "accum_depr", "other_asset",
  "ap", "tax_payable", "accrued", "customer_deposit", "loan", "other_liability",
  "share_capital", "retained_earnings", "current_earnings", "dividend",
  "sales", "other_income", "fx_gain",
  "cogs", "opex", "payroll", "depreciation", "tax_expense", "fx_loss", "other_expense",
] as const;
export type AccountSubtype = (typeof ACCOUNT_SUBTYPES)[number];

/** Tags that let the tax module find the right accounts without hard-coding codes. */
export type TaxTag =
  | "ppn_output" | "ppn_input" | "pph21_payable" | "pph23_payable" | "pph26_payable" | "pph4_2_payable" | "pph25_prepaid"
  | "pph23_prepaid" | "pph22_prepaid" | "cit_payable" | "bpjs_payable" | "local_tax_payable" | "ar_trade" | "ap_trade"
  | "bank_default" | "sales_default" | "salary_expense" | "bpjs_expense" | "cit_expense" | "retained_earnings" | "current_earnings"
  | "fx_gain" | "fx_loss" | "suspense";

export interface Account {
  id: string;
  entityId: string;
  code: string; // "1-1100"
  name: string;
  nameId?: string; // Bahasa Indonesia
  type: AccountType;
  subtype: AccountSubtype;
  normalBalance: "debit" | "credit";
  taxTag?: TaxTag;
  parentCode?: string;
  /** Deductible for corporate income tax (fiscal reconciliation). */
  deductible?: boolean;
  isSystem: boolean;
  active: boolean;
}

export type JournalSource = "manual" | "invoice" | "bill" | "receipt" | "disbursement" | "bank" | "payroll" | "depreciation" | "withholding" | "opening" | "closing" | "adjustment" | "fx";

export interface JournalLine {
  accountId: string;
  accountCode: string;
  description?: string;
  /** IDR (base currency) amounts; exactly one of debit/credit is non-zero. */
  debit: number;
  credit: number;
  /** Original-currency information when the source document was not in IDR. */
  currency?: string;
  fxAmount?: number;
  fxRate?: number;
  counterpartyId?: string; // contact, company or vendor id
  counterpartyName?: string;
  taxCode?: "ppn" | "none" | "out_of_scope";
  projectId?: string;
}

export interface JournalEntry {
  id: string;
  entityId: string;
  number: string; // JE-2026-0001
  date: string;
  period: string; // YYYY-MM
  memo: string;
  source: JournalSource;
  sourceId?: string;
  lines: JournalLine[];
  status: "draft" | "posted" | "void";
  postedAt?: string;
  voidedAt?: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AccountingPeriod {
  id: string; // `${entityId}:${period}`
  entityId: string;
  period: string; // YYYY-MM
  locked: boolean;
  lockedByUserId?: string;
  lockedAt?: string;
}

export interface BankAccount {
  id: string;
  entityId: string;
  accountId: string; // GL account (subtype bank/cash)
  name: string;
  bankName?: string;
  accountNumber?: string;
  currency: string;
  openingBalance?: number;
  openingDate?: string;
  active: boolean;
}

export interface BankTransaction {
  id: string;
  entityId: string;
  bankAccountId: string;
  date: string;
  description: string;
  /** Signed: positive = money in. In the bank account's currency. */
  amount: number;
  balance?: number;
  reference?: string;
  /** sha-256 of bankAccountId+date+amount+description, used to skip duplicates on re-import. */
  hash: string;
  importBatchId?: string;
  status: "unmatched" | "matched" | "excluded";
  matchedJournalId?: string;
  matchedDocument?: { type: "invoice" | "bill" | "journal" | "transfer"; id: string };
  createdAt: string;
}

export type DocStatus = "draft" | "sent" | "partial" | "paid" | "void";
export type TaxCode = "none" | "ppn" | "out_of_scope";

export interface InvoiceLine {
  id: string;
  serviceId?: string;
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
  accountId: string; // revenue account
  taxCode: TaxCode;
  projectId?: string;
}

export interface Invoice {
  id: string;
  entityId: string;
  number: string; // INV-2026-0001
  customer: { type: "company" | "contact" | "other"; id?: string; name: string; email?: string; npwp?: string; address?: string };
  date: string;
  dueDate: string;
  currency: string;
  fxRate: number; // IDR per unit; 1 for IDR
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  ppnAmount: number;
  total: number;
  amountPaid: number;
  status: DocStatus;
  journalId?: string;
  projectId?: string;
  quoteId?: string;
  dealId?: string;
  /** e-Faktur number when PKP. */
  fakturNumber?: string;
  qboDocNumber?: string;
  notes?: string;
  paymentInstructions?: string;
  createdAt: string;
  updatedAt?: string;
  sentAt?: string;
}

export type WithholdingType = "none" | "pph21" | "pph23" | "pph26" | "pph4_2" | "pph15" | "pph22";

export interface BillLine {
  id: string;
  description: string;
  amount: number;
  accountId: string; // expense / asset account
  taxCode: TaxCode;
  withholding: WithholdingType;
  withholdingRate?: number; // 0.02 for PPh 23 services
  withholdingAmount?: number;
  projectId?: string;
  assetId?: string;
}

export interface Bill {
  id: string;
  entityId: string;
  number: string; // BILL-2026-0001
  vendor: { type: "vendor" | "contact" | "company" | "other"; id?: string; name: string; npwp?: string; country?: string };
  vendorInvoiceNumber?: string;
  date: string;
  dueDate: string;
  currency: string;
  fxRate: number;
  lines: BillLine[];
  subtotal: number;
  ppnInput: number;
  withholdingTotal: number;
  total: number; // subtotal + ppnInput
  amountPayable: number; // total - withholdingTotal
  amountPaid: number;
  status: DocStatus;
  journalId?: string;
  projectId?: string;
  fakturNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Payment {
  id: string;
  entityId: string;
  kind: "receipt" | "disbursement" | "transfer";
  date: string;
  amount: number; // in `currency`
  currency: string;
  fxRate: number;
  bankAccountId: string;
  toBankAccountId?: string; // transfers
  invoiceId?: string;
  billId?: string;
  journalId?: string;
  bankTransactionId?: string;
  reference?: string;
  method?: "transfer" | "cash" | "card" | "other";
  notes?: string;
  createdAt: string;
}

/** Indonesian fiscal depreciation groups (UU PPh art. 11). */
export type FiscalAssetGroup = "group1" | "group2" | "group3" | "group4" | "building_permanent" | "building_non_permanent" | "land";
export const FISCAL_ASSET_GROUPS: Record<FiscalAssetGroup, { label: string; usefulLifeYears: number; straightLineRate: number; decliningRate: number }> = {
  group1: { label: "Group I (computers, phones, furniture) 4 y", usefulLifeYears: 4, straightLineRate: 0.25, decliningRate: 0.5 },
  group2: { label: "Group II (vehicles, machinery) 8 y", usefulLifeYears: 8, straightLineRate: 0.125, decliningRate: 0.25 },
  group3: { label: "Group III 16 y", usefulLifeYears: 16, straightLineRate: 0.0625, decliningRate: 0.125 },
  group4: { label: "Group IV 20 y", usefulLifeYears: 20, straightLineRate: 0.05, decliningRate: 0.1 },
  building_permanent: { label: "Permanent building 20 y", usefulLifeYears: 20, straightLineRate: 0.05, decliningRate: 0 },
  building_non_permanent: { label: "Non-permanent building 10 y", usefulLifeYears: 10, straightLineRate: 0.1, decliningRate: 0 },
  land: { label: "Land (not depreciated)", usefulLifeYears: 0, straightLineRate: 0, decliningRate: 0 },
};

export interface FixedAsset {
  id: string;
  entityId: string;
  name: string;
  assetAccountId: string;
  accumDeprAccountId: string;
  deprExpenseAccountId: string;
  acquisitionDate: string;
  cost: number;
  salvageValue: number;
  fiscalGroup: FiscalAssetGroup;
  method: "straight_line" | "declining_balance";
  usefulLifeMonths: number;
  accumulatedDepreciation: number;
  /** Last period (YYYY-MM) for which depreciation was posted. */
  depreciatedThrough?: string;
  disposedAt?: string;
  disposalProceeds?: number;
  status: "active" | "fully_depreciated" | "disposed";
  billId?: string;
  createdAt: string;
}

// ---------- Tax & payroll (per entity) ----------

export const PTKP_STATUSES = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"] as const;
export type PtkpStatus = (typeof PTKP_STATUSES)[number];

export interface Employee {
  id: string;
  entityId: string;
  name: string;
  nik?: string;
  npwp?: string;
  email?: string;
  position?: string;
  ptkpStatus: PtkpStatus;
  isForeign: boolean;
  passportNumber?: string;
  bpjsKesehatanNumber?: string;
  bpjsKetenagakerjaanNumber?: string;
  bpjs: { kesehatan: boolean; jht: boolean; jp: boolean; jkk: boolean; jkm: boolean; jkkRiskClass: 1 | 2 | 3 | 4 | 5 };
  basicSalary: number;
  allowances: Array<{ name: string; amount: number; taxable: boolean }>;
  /** Fixed monthly deductions (loan repayment, etc.). */
  deductions: Array<{ name: string; amount: number }>;
  bankName?: string;
  bankAccountNumber?: string;
  joinDate: string;
  endDate?: string;
  contractType: "pkwtt" | "pkwt" | "freelance";
  active: boolean;
  createdAt: string;
}

export interface PayslipLine {
  employeeId: string;
  employeeName: string;
  ptkpStatus: PtkpStatus;
  basicSalary: number;
  allowances: number;
  overtime: number;
  bonus: number;
  gross: number;
  /** Employer contributions (cost to company, part of PPh 21 gross-up base where applicable). */
  employer: { bpjsKesehatan: number; jht: number; jp: number; jkk: number; jkm: number };
  /** Employee contributions (deducted from pay). */
  employee: { bpjsKesehatan: number; jht: number; jp: number };
  /** PPh 21: monthly TER (PP 58/2023) Jan–Nov, annual progressive true-up in December / on termination. */
  pph21: { method: "ter" | "annual"; terCategory?: "A" | "B" | "C"; rate?: number; base: number; amount: number };
  otherDeductions: number;
  netPay: number;
  notes?: string;
}

export interface PayrollRun {
  id: string;
  entityId: string;
  period: string; // YYYY-MM
  payDate: string;
  lines: PayslipLine[];
  totals: { gross: number; pph21: number; employerBpjs: number; employeeBpjs: number; netPay: number; costToCompany: number };
  status: "draft" | "approved" | "paid";
  journalId?: string;
  approvedByUserId?: string;
  approvedAt?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export type WithholdingSlipType = "pph21" | "pph23" | "pph26" | "pph4_2" | "pph15" | "pph22";

/** Bukti potong: a withholding certificate issued to a counterparty (unified e-Bupot). */
export interface WithholdingSlip {
  id: string;
  entityId: string;
  type: WithholdingSlipType;
  number: string; // BP-2026-0001
  period: string; // YYYY-MM
  date: string;
  counterparty: { name: string; npwp?: string; nik?: string; country?: string; address?: string; id?: string };
  objectCode: string; // DJP income type code, e.g. 24-104-02 (jasa manajemen)
  objectLabel: string;
  description?: string;
  baseAmount: number; // DPP
  rate: number;
  taxAmount: number;
  /** Treaty relief applied (PPh 26) with DGT form on file. */
  treatyApplied?: boolean;
  billId?: string;
  payrollRunId?: string;
  status: "draft" | "issued" | "reported";
  ntpn?: string;
  createdAt: string;
}

export interface VatTransaction {
  id: string;
  entityId: string;
  direction: "output" | "input";
  date: string;
  period: string;
  counterparty: { name: string; npwp?: string; id?: string };
  fakturNumber?: string;
  dpp: number;
  ppn: number;
  rate: number;
  creditable: boolean;
  invoiceId?: string;
  billId?: string;
  notes?: string;
  createdAt: string;
}

export const OBLIGATION_TYPES = [
  "bookkeeping", "pph21", "pph23", "pph26", "pph4_2", "pph25", "ppn", "local_tax", "bpjs", "payroll",
  "lkpm", "spt_badan", "spt_op", "gms", "annual_report", "pph_final_umkm", "other",
] as const;
export type ObligationType = (typeof OBLIGATION_TYPES)[number];
export const OBLIGATION_LABELS: Record<ObligationType, string> = {
  bookkeeping: "Monthly bookkeeping", pph21: "PPh 21 (employee withholding)", pph23: "PPh 23 (services withholding)",
  pph26: "PPh 26 (non-resident withholding)", pph4_2: "PPh 4(2) final (rent, construction, UMKM)", pph25: "PPh 25 instalment",
  ppn: "PPN (VAT) return", local_tax: "Regional tax (PB1 / PBJT)", bpjs: "BPJS contributions", payroll: "Payroll",
  lkpm: "LKPM investment report (BKPM/OSS)", spt_badan: "Annual corporate income tax return (SPT Badan)",
  spt_op: "Annual personal income tax return (SPT OP)", gms: "Annual general meeting (RUPS)", annual_report: "Annual financial statement submission",
  pph_final_umkm: "PPh final 0.5% (PP 55) monthly", other: "Other",
};

export const OBLIGATION_STATUSES = ["not_started", "data_requested", "data_received", "in_preparation", "awaiting_approval", "paid", "reported", "nil", "late"] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];
export const OBLIGATION_STATUS_LABELS: Record<ObligationStatus, string> = {
  not_started: "Not started", data_requested: "Data requested", data_received: "Data received", in_preparation: "In preparation",
  awaiting_approval: "Awaiting client approval", paid: "Paid", reported: "Reported", nil: "Nil return", late: "Late",
};

/** One row of the compliance calendar (replaces the monthly tabs of the "Client List Tax and Accounting" sheet). */
export interface TaxObligation {
  id: string; // `${entityId}:${type}:${period}`
  entityId: string;
  type: ObligationType;
  period: string; // YYYY-MM, YYYY-Qn or YYYY
  label: string;
  dataDue?: string; // client must send data (ILA: by the 3rd/5th)
  paymentDue?: string;
  reportDue: string;
  status: ObligationStatus;
  amount?: number;
  assigneeUserId?: string;
  ntpn?: string;
  paidAt?: string;
  reportedAt?: string;
  notes?: string;
  generated: boolean;
  updatedAt?: string;
}

// ---------- Imports & misc ----------

export interface ImportBatch {
  id: string;
  kind: "hubspot_contacts" | "qbo_customers" | "qbo_invoices" | "bank_csv" | "other";
  entityId?: string;
  fileName: string;
  rows: number;
  inserted: number;
  skipped: number;
  errors: string[];
  byUserId?: string;
  createdAt: string;
}

export interface Counter {
  id: string; // `${scope}:${prefix}:${year}`
  value: number;
}

export interface Setting {
  id: string; // key
  value: unknown;
  updatedAt: string;
}

/** Table registry: every collection stored by lib/db.ts. */
export type TableMap = {
  users: User;
  entities: Entity;
  contacts: Contact;
  companies: Company;
  deals: Deal;
  services: ServiceItem;
  quotes: Quote;
  projects: Project;
  vendors: Vendor;
  renewals: Renewal;
  activities: Activity;
  tasks: TaskItem;
  accounts: Account;
  journal_entries: JournalEntry;
  periods: AccountingPeriod;
  bank_accounts: BankAccount;
  bank_transactions: BankTransaction;
  invoices: Invoice;
  bills: Bill;
  payments: Payment;
  fixed_assets: FixedAsset;
  employees: Employee;
  payroll_runs: PayrollRun;
  withholding_slips: WithholdingSlip;
  vat_transactions: VatTransaction;
  tax_obligations: TaxObligation;
  import_batches: ImportBatch;
  counters: Counter;
  settings: Setting;
};
export type Table = keyof TableMap;
export const TABLES = [
  "users", "entities", "contacts", "companies", "deals", "services", "quotes", "projects", "vendors", "renewals", "activities", "tasks",
  "accounts", "journal_entries", "periods", "bank_accounts", "bank_transactions", "invoices", "bills", "payments", "fixed_assets",
  "employees", "payroll_runs", "withholding_slips", "vat_transactions", "tax_obligations", "import_batches", "counters", "settings",
] as const satisfies readonly Table[];
