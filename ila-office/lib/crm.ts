/**
 * Pure CRM helpers: quote arithmetic, checklist templates, renewal inference, pipeline statistics and search.
 * No Next.js and no storage imports so everything here is unit-testable with node:test.
 */
import { addDays, addMonths, daysBetween } from "./dates";
import { roundMoney, sum } from "./money";
import { COMPANY } from "./catalogue";
import {
  DEAL_STAGES, DEAL_STAGE_PROBABILITY, RENEWAL_KIND_LABELS,
  type Deal, type DealStage, type Project, type ProjectStatus, type Quote, type QuoteLine, type QuoteStatus,
  type Renewal, type RenewalKind, type ServiceCategory, type ServiceItem,
} from "./types";

// ---------- Quotes ----------

export const QUOTE_CURRENCIES = ["IDR", "USD", "EUR"] as const;

/** List price of a catalogue item in the quote currency (0 when ILA has no list price in that currency). */
export function servicePrice(item: Pick<ServiceItem, "priceIDR" | "priceUSD" | "priceEUR">, currency: string): number {
  if (currency === "USD") return item.priceUSD ?? 0;
  if (currency === "EUR") return item.priceEUR ?? 0;
  return item.priceIDR;
}

export function lineAmount(qty: number, unitPrice: number, currency = "IDR"): number {
  return roundMoney((Number(qty) || 0) * (Number(unitPrice) || 0), currency);
}

export interface QuoteTotals { subtotal: number; discount: number; total: number }

/**
 * Subtotal = positive lines; discount = quote-level discount + absolute value of negative ("discount") lines;
 * total = subtotal − discount, never below zero.
 */
export function quoteTotals(lines: Array<Pick<QuoteLine, "qty" | "unitPrice">>, currency = "IDR", discount = 0): QuoteTotals {
  const amounts = lines.map((l) => lineAmount(l.qty, l.unitPrice, currency));
  const subtotal = roundMoney(sum(amounts.filter((a) => a > 0)), currency);
  const lineDiscounts = sum(amounts.filter((a) => a < 0).map((a) => -a));
  const disc = roundMoney(lineDiscounts + Math.max(0, Number(discount) || 0), currency);
  return { subtotal, discount: disc, total: roundMoney(Math.max(0, subtotal - disc), currency) };
}

/** Recomputes `amount` on every line. */
export function normaliseLines(lines: Array<Omit<QuoteLine, "amount"> & { amount?: number }>, currency = "IDR"): QuoteLine[] {
  return lines.map((l) => ({ ...l, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0, amount: lineAmount(l.qty, l.unitPrice, currency) }));
}

export function defaultValidUntil(today: string): string {
  return addDays(today, COMPANY.quoteValidityDays);
}

/** A sent quote past its validity date is shown as expired without rewriting the stored status. */
export function effectiveQuoteStatus(q: Pick<Quote, "status" | "validUntil">, today: string): QuoteStatus {
  if (q.status === "sent" && q.validUntil < today) return "expired";
  return q.status;
}

export function isQuoteExpired(q: Pick<Quote, "status" | "validUntil">, today: string): boolean {
  return effectiveQuoteStatus(q, today) === "expired";
}

/** The category a quote belongs to: the most frequent category among its catalogue lines (by amount). */
export function inferCategoryFromLines(lines: Array<Pick<QuoteLine, "serviceId" | "amount">>, services: Map<string, Pick<ServiceItem, "category">>): ServiceCategory | undefined {
  const weights = new Map<ServiceCategory, number>();
  for (const l of lines) {
    const s = l.serviceId ? services.get(l.serviceId) : undefined;
    if (!s || s.category === "disbursement") continue;
    weights.set(s.category, (weights.get(s.category) ?? 0) + Math.max(1, l.amount));
  }
  let best: ServiceCategory | undefined;
  let bestW = -1;
  for (const [c, w] of weights) if (w > bestW) { best = c; bestW = w; }
  return best;
}

// ---------- Checklists ----------

const CHECKLISTS: Record<string, string[]> = {
  // Visa & immigration
  working_kitas: [
    "Documents received (passport, photo, CV, diploma, company documents)",
    "RPTKA submitted on TKA Online",
    "IMTA / DKP-TKA payment USD 1,200",
    "e-Visa (VITAS) issued",
    "Arrival / onshore conversion",
    "Biometrics at Kanim",
    "KITAS issued and sent to client",
    "Deliverables uploaded to client Drive folder",
  ],
  investor_kitas: [
    "Documents received (passport, photo, company deed, NIB)",
    "Sponsor letter signed by the company",
    "e-Visa application submitted",
    "e-Visa issued",
    "Biometrics at Kanim",
    "KITAS issued and sent to client",
    "Deliverables uploaded to client Drive folder",
  ],
  dependent_kitas: [
    "Documents received (passport, legalised marriage / birth certificate)",
    "Sponsor letter signed",
    "e-Visa application submitted",
    "e-Visa issued",
    "Biometrics at Kanim",
    "KITAS issued and sent to client",
  ],
  simple_kitas: [
    "Documents received (passport, photo, proof of income / employment)",
    "e-Visa application submitted",
    "e-Visa issued",
    "Biometrics at Kanim",
    "KITAS issued and sent to client",
  ],
  kitap: ["Documents received", "Application filed at Kanim", "Interview and biometrics at Kanim", "KITAP issued and sent to client"],
  visa: ["Documents received (passport, photo)", "Sponsor / guarantee letter prepared", "e-Visa application submitted", "e-Visa issued and sent to client"],
  erp: ["Cancellation letter signed by sponsor", "EPO / exit permit submitted at Kanim", "Exit permit issued", "Client informed of exit deadline"],
  // Corporate
  incorporation: [
    "Name reservation (AHU)",
    "KBLI and capital structure confirmed",
    "Deed draft reviewed by client",
    "Deed signing at notary",
    "SK Kemenkumham issued",
    "NPWP issued",
    "NIB / OSS registration",
    "Bank account opened",
    "Company documents uploaded to client Drive folder",
  ],
  hk_incorporation: ["KYC documents received", "Incorporation filed with Companies Registry", "Certificate of Incorporation and Business Registration issued", "Company kit delivered", "Bank account introduction"],
  commercial_address: ["Address agreement signed", "Domicile letter issued", "Address updated on NIB / OSS"],
  nominee: ["KYC of nominee and beneficial owner", "Nominee agreement signed", "Deed amendment / shareholder agreements", "AHU registration"],
  amendment: ["Circular resolution signed", "Deed amendment at notary", "AHU registration", "OSS / NIB update"],
  gms: ["Financial statements received", "GMS notice sent", "GMS held and minutes signed", "Minutes notarised", "AHU submission"],
  closure: ["GMS resolution for liquidation", "Liquidator appointed", "Newspaper announcement", "Tax clearance (NPWP revocation)", "AHU deregistration"],
  corporate: ["Documents received", "Drafting", "Signing", "Government registration", "Deliverable uploaded to client Drive folder"],
  // Legal & property
  due_diligence: [
    "Documents received (certificate, PBG/IMB, PBB, owner ID)",
    "BPN (land office) certificate check",
    "Zoning check (PUPR / RDTR)",
    "Site visit and access road check",
    "Tax (PBB) and encumbrance check",
    "Report delivered",
  ],
  contract: ["Brief received", "Draft v1 sent", "Client comments received", "Final version delivered", "Signing"],
  legal_property: ["Documents received", "Drafting / review", "Client comments received", "Final delivered"],
  // Licensing
  pbg: ["Architect drawings received", "SIMBG account created", "PKKPR obtained", "Technical review (TPA)", "Retribution paid", "PBG issued"],
  slf: ["Documents received", "Building inspection", "SLF issued"],
  pkkpr: ["Documents received", "OSS application submitted", "PKKPR issued"],
  trademark: ["Trademark search", "Class selection confirmed", "DJKI filing", "Publication period", "Certificate issued"],
  licensing: ["Documents received", "Application submitted", "Government review", "Licence issued", "Deliverable uploaded to client Drive folder"],
  // Other categories
  tax_accounting: ["Engagement letter signed", "Coretax / DJP access received", "Bank access received (maker)", "Bookkeeping set up (QuickBooks)", "First monthly report delivered"],
  payroll_eor: ["Employee data received", "BPJS registration", "Payroll schedule agreed", "First payroll run"],
  advisory: ["Brief received", "Research and drafting", "Draft presented", "Final delivered"],
  disbursement: ["Fee paid to government / vendor", "Receipt received", "Re-billed to client"],
};

const CODE_TEMPLATES: Array<[RegExp, string]> = [
  [/^VISA-(WK|IMTA)/, "working_kitas"],
  [/^VISA-INV/, "investor_kitas"],
  [/^VISA-(DEP|CHILD|PARENT)/, "dependent_kitas"],
  [/^VISA-(REMOTE|RETIRE|YOGA)/, "simple_kitas"],
  [/^VISA-KITAP/, "kitap"],
  [/^VISA-ERP/, "erp"],
  [/^VISA-/, "visa"],
  [/^CORP-HK/, "hk_incorporation"],
  [/^CORP-(PMA|PMDN|PH-OPC)/, "incorporation"],
  [/^CORP-VO/, "commercial_address"],
  [/^CORP-(DIR|COMM|SH)$/, "nominee"],
  [/^CORP-(AMEND|ADDR|NAME|CAP|SHARES)/, "amendment"],
  [/^CORP-GMS/, "gms"],
  [/^CORP-CLOSE/, "closure"],
  [/^LEG-DD/, "due_diligence"],
  [/^LEG-(CONTRACT|OPINION|LEGALISE)/, "contract"],
  [/^LIC-PBG/, "pbg"],
  [/^LIC-SLF/, "slf"],
  [/^LIC-PKKPR/, "pkkpr"],
  [/^LIC-TM/, "trademark"],
];

/** Which template a service resolves to (by code, then category). */
export function checklistTemplateKey(category: ServiceCategory, serviceCode?: string): string {
  const code = (serviceCode ?? "").toUpperCase();
  if (code) for (const [re, key] of CODE_TEMPLATES) if (re.test(code)) return key;
  if (category === "visa") return "simple_kitas";
  return CHECKLISTS[category] ? category : "corporate";
}

/** Checklist labels for a project of this category / service. */
export function checklistTemplate(category: ServiceCategory, serviceCode?: string): string[] {
  return [...(CHECKLISTS[checklistTemplateKey(category, serviceCode)] ?? CHECKLISTS.corporate)];
}

export function checklistProgress(items: Array<{ done: boolean }>): { done: number; total: number; pct: number } {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// ---------- Projects ----------

/** Allowed status moves on the project detail page (any status can still be set via edit). */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  new: ["waiting_client", "waiting_payment", "in_progress", "cancelled"],
  waiting_client: ["in_progress", "waiting_payment", "cancelled"],
  waiting_payment: ["in_progress", "waiting_client", "cancelled"],
  in_progress: ["waiting_client", "submitted", "done", "cancelled"],
  submitted: ["in_progress", "done", "cancelled"],
  done: ["in_progress"],
  cancelled: ["new"],
};

export interface CostSummary { costIDR: number; approvedIDR: number; pendingIDR: number; costUSD: number; feeIDR: number | null; marginIDR: number | null; marginPct: number | null }

/** Cost of sales totals and margin. Margin is only computed when the fee is in IDR (no FX rate on a project). */
export function projectCostSummary(p: Pick<Project, "costOfSales" | "feeAmount" | "feeCurrency">): CostSummary {
  const costIDR = sum(p.costOfSales.map((c) => c.amountIDR));
  const approvedIDR = sum(p.costOfSales.filter((c) => c.approved).map((c) => c.amountIDR));
  const costUSD = sum(p.costOfSales.map((c) => c.amountUSD ?? 0));
  const feeIDR = p.feeCurrency === "IDR" ? p.feeAmount : null;
  const marginIDR = feeIDR === null ? null : feeIDR - costIDR;
  const marginPct = feeIDR && marginIDR !== null ? Math.round((marginIDR / feeIDR) * 1000) / 10 : null;
  return { costIDR, approvedIDR, pendingIDR: costIDR - approvedIDR, costUSD, feeIDR, marginIDR, marginPct };
}

// ---------- Renewals ----------

const RENEWAL_BY_CODE: Array<[RegExp, RenewalKind]> = [
  [/^VISA-PASSPORT/, "passport"],
  [/^VISA-(WK|INV|DEP|CHILD|PARENT|REMOTE|RETIRE|KITAP|YOGA|IMTA)/, "kitas"],
  [/^VISA-(D1|D2|D12|C1|C7|C10|C18|C22|BRIDGE)/, "visa"],
  [/^CORP-VO/, "commercial_address"],
  [/^CORP-DIR/, "resident_director"],
  [/^CORP-COMM/, "commissioner"],
  [/^CORP-SH$/, "local_shareholder"],
  [/^CORP-GMS/, "gms"],
  [/^CORP-HK-BR/, "licence"],
  [/^TAX-LKPM/, "lkpm"],
  [/^LIC-/, "licence"],
];

/** Which renewal a finished project of this service produces. */
export function inferRenewalKind(category: ServiceCategory, serviceCode?: string): RenewalKind {
  const code = (serviceCode ?? "").toUpperCase();
  if (code) for (const [re, kind] of RENEWAL_BY_CODE) if (re.test(code)) return kind;
  if (category === "visa") return "kitas";
  if (category === "licensing") return "licence";
  return "other";
}

export const RENEWAL_REMINDER_DAYS: Record<RenewalKind, number> = {
  kitas: 60, visa: 30, passport: 180, commercial_address: 60, resident_director: 60, commissioner: 60, local_shareholder: 60,
  licence: 90, gms: 60, lkpm: 14, other: 60,
};

/** Expiry of a deliverable: explicit date, else completion + the service's renewal period. */
export function inferExpiry(p: Pick<Project, "expiresAt" | "completedAt">, service?: Pick<ServiceItem, "renewalMonths">, fallbackDate?: string): string | undefined {
  if (p.expiresAt) return p.expiresAt;
  const base = p.completedAt?.slice(0, 10) ?? fallbackDate;
  if (!base || !service?.renewalMonths) return undefined;
  return addMonths(base, service.renewalMonths);
}

/** Builds the Renewal row for a completed project. Returns null when the project has no expiry date. */
export function renewalFromProject(
  p: Pick<Project, "id" | "title" | "category" | "serviceId" | "companyId" | "contactId" | "ownerUserId" | "subject" | "expiresAt">,
  opts: { id: string; now: string; serviceCode?: string },
): Renewal | null {
  if (!p.expiresAt) return null;
  const kind = inferRenewalKind(p.category, opts.serviceCode);
  const who = p.subject?.name?.trim();
  const label = `${RENEWAL_KIND_LABELS[kind]} - ${who || p.title}`;
  return {
    id: opts.id, kind, label, companyId: p.companyId, contactId: p.contactId, projectId: p.id, serviceId: p.serviceId,
    expiresAt: p.expiresAt, reminderDays: RENEWAL_REMINDER_DAYS[kind], status: "upcoming", ownerUserId: p.ownerUserId, createdAt: opts.now,
  };
}

/** Done projects with an expiry date that have no renewal row yet. */
export function projectsNeedingRenewal(projects: Project[], renewals: Array<Pick<Renewal, "projectId">>): Project[] {
  const have = new Set(renewals.map((r) => r.projectId).filter(Boolean));
  return projects.filter((p) => p.status === "done" && p.expiresAt && !have.has(p.id));
}

export function daysLeft(expiresAt: string, today: string): number {
  return daysBetween(today, expiresAt);
}

export type Urgency = "red" | "amber" | "green" | "slate";
/** ≤ 30 days (or past) red, ≤ 60 amber, otherwise green. */
export function expiryUrgency(days: number): Urgency {
  if (days <= 30) return "red";
  if (days <= 60) return "amber";
  return "green";
}

export const OPEN_RENEWAL_STATUSES: ReadonlyArray<Renewal["status"]> = ["upcoming", "reminded", "quoted"];

export function sortByExpiry<T extends { expiresAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : a.expiresAt > b.expiresAt ? 1 : 0));
}

// ---------- Deals & pipeline ----------

export const OPEN_DEAL_STAGES: ReadonlyArray<DealStage> = ["prospect", "qualified", "quotation_sent", "review", "invoice_sent"];

export function isClosedStage(stage: DealStage): boolean {
  return stage === "closed_won" || stage === "closed_lost";
}

export function dealAgeDays(deal: Pick<Deal, "createdAt" | "closedAt">, now: string): number {
  const end = (deal.closedAt ?? now).slice(0, 10);
  return Math.max(0, daysBetween(deal.createdAt.slice(0, 10), end));
}

export type AmountByCurrency = Record<string, number>;
export interface StageStats { count: number; amount: AmountByCurrency; weighted: AmountByCurrency }
export interface PipelineStats { stages: Record<DealStage, StageStats>; open: StageStats; wonThisYear: StageStats }

function add(target: AmountByCurrency, currency: string, amount: number) {
  target[currency] = roundMoney((target[currency] ?? 0) + amount, currency);
}
const emptyStats = (): StageStats => ({ count: 0, amount: {}, weighted: {} });

/**
 * Per-stage and open-pipeline totals, grouped by currency (no FX conversion). Weighted = amount × stage probability.
 * `fx` (IDR per unit) folds foreign currencies into IDR when given, e.g. { USD: 16500 }.
 */
export function pipelineStats(deals: Deal[], opts: { fx?: Record<string, number>; year?: number } = {}): PipelineStats {
  const stages = Object.fromEntries(DEAL_STAGES.map((s) => [s, emptyStats()])) as Record<DealStage, StageStats>;
  const open = emptyStats();
  const wonThisYear = emptyStats();
  for (const d of deals) {
    const stage = stages[d.stage] ?? (stages[d.stage] = emptyStats());
    const rate = opts.fx?.[d.currency];
    const currency = rate && d.currency !== "IDR" ? "IDR" : d.currency;
    const amount = rate && d.currency !== "IDR" ? roundMoney(d.amount * rate, "IDR") : d.amount;
    const weighted = roundMoney(amount * (DEAL_STAGE_PROBABILITY[d.stage] ?? 0), currency);
    stage.count += 1; add(stage.amount, currency, amount); add(stage.weighted, currency, weighted);
    if (!isClosedStage(d.stage)) { open.count += 1; add(open.amount, currency, amount); add(open.weighted, currency, weighted); }
    if (d.stage === "closed_won" && opts.year && (d.closedAt ?? d.updatedAt ?? d.createdAt).startsWith(String(opts.year))) {
      wonThisYear.count += 1; add(wonThisYear.amount, currency, amount); add(wonThisYear.weighted, currency, amount);
    }
  }
  return { stages, open, wonThisYear };
}

/** Deal stage a quote event implies (sent → quotation_sent, accepted → review); never moves a closed deal. */
export function stageAfterQuote(current: DealStage, event: "sent" | "accepted" | "declined"): DealStage {
  if (isClosedStage(current)) return current;
  if (event === "sent") return DEAL_STAGES.indexOf(current) < DEAL_STAGES.indexOf("quotation_sent") ? "quotation_sent" : current;
  if (event === "accepted") return DEAL_STAGES.indexOf(current) < DEAL_STAGES.indexOf("review") ? "review" : current;
  return current;
}

// ---------- Search ----------

export function normaliseText(s: string | undefined | null): string {
  return (s ?? "").toString().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Every whitespace-separated token of `q` must appear in at least one of the fields (case/diacritic-insensitive). */
export function matchesSearch(fields: Array<string | undefined | null>, q: string | undefined): boolean {
  const tokens = normaliseText(q).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = fields.map(normaliseText).join(" \u0001 ");
  return tokens.every((t) => hay.includes(t));
}

/** Phone numbers compared on digits only so "+62 822" finds "0822". */
export function phoneDigits(s: string | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

// ---------- Tasks ----------

export function isOverdue(t: { done: boolean; dueDate?: string }, today: string): boolean {
  return !t.done && !!t.dueDate && t.dueDate < today;
}

/** Overdue first, then by due date (undated last), then by creation. */
export function sortTasks<T extends { done: boolean; dueDate?: string; createdAt: string }>(tasks: T[], today: string): T[] {
  return [...tasks].sort((a, b) => {
    const oa = isOverdue(a, today) ? 0 : 1;
    const ob = isOverdue(b, today) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    const da = a.dueDate ?? "9999-12-31";
    const dbb = b.dueDate ?? "9999-12-31";
    if (da !== dbb) return da < dbb ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}
