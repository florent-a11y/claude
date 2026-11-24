/**
 * Invoice settings (accounting team request): how an entity's invoices look and what a new invoice starts from.
 * Colours, logo, document title and language, whether prices include PPN, the payment term, the settlement notes at
 * the bottom of the invoice, the footer and a signature block. The settings are stored on the entity
 * (`Entity.invoiceSettings`), every field optional; `resolveInvoiceSettings` fills in the defaults, which are the
 * layout the invoices had before the settings existed.
 *
 * `invoiceDocument` turns an invoice into the content of the printed document (texts, amounts already formatted,
 * colours). The printable page (components/InvoiceDocument.tsx), the settings preview and the PDF (lib/invoice-pdf.ts)
 * all lay out that one description, so they cannot disagree on what an invoice says.
 *
 * Pure: no database, usable in the browser. The store side is lib/invoice-settings-services.ts.
 */
import { COMPANY } from "./catalogue";
import { addDays, addWorkingDays, fmtDate } from "./dates";
import { columnDecimals, fmtMoneyAt, roundMoney } from "./money";
import type { BankAccount, Entity, Invoice, InvoiceSettings } from "./types";

// ---------- Colours ----------

export const DEFAULT_MAIN_COLOR = "#0f3b5e";
export const DEFAULT_ACCENT_COLOR = "#c8912a";
const INK = "#15202b";
const GREY = "#65727f";
const WHITE = "#ffffff";

/** Ready-made pairs offered on the settings page: main colour, accent colour. */
export const INVOICE_COLOR_PRESETS: ReadonlyArray<{ name: string; main: string; accent: string }> = [
  { name: "Navy and gold", main: DEFAULT_MAIN_COLOR, accent: DEFAULT_ACCENT_COLOR },
  { name: "Charcoal", main: "#1f2937", accent: "#6b7280" },
  { name: "Forest", main: "#14532d", accent: "#b45309" },
  { name: "Teal", main: "#0f766e", accent: "#0e7490" },
  { name: "Burgundy", main: "#7f1d1d", accent: "#a16207" },
  { name: "Royal blue", main: "#1d4ed8", accent: "#f59e0b" },
  { name: "Plum", main: "#581c87", accent: "#be185d" },
  { name: "Black", main: "#111111", accent: "#111111" },
];

/** "#1a2b3c" from "#1A2B3C", "1a2b3c" or the short "#abc"; undefined when the text is not a colour. */
export function parseHexColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  if (/^[0-9a-f]{3}$/.test(v)) return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
  return undefined;
}

type RGB = [number, number, number];
const toRgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const toHex = (c: RGB) => `#${c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("")}`;

/** `a` moved towards `b`: 0 is `a`, 1 is `b`. */
export function mixColor(a: string, b: string, t: number): string {
  const x = toRgb(a), y = toRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The colour itself when it reads on white paper, else the same hue darkened until it does (a pale yellow becomes olive). */
export function textOnWhite(hex: string, min = 3): string {
  let c = hex;
  for (let i = 0; i < 20 && contrastRatio(c, WHITE) < min; i++) c = mixColor(c, "#000000", 0.12);
  return c;
}

/** White or dark ink, whichever reads better on a fill of this colour. */
export function textOnColor(hex: string): string {
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, INK) ? WHITE : INK;
}

// ---------- Settings ----------

export const LOGO_SIZES = ["small", "medium", "large"] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];
/** Largest box the logo is fitted into, in PDF points (the page uses the same numbers as pixels). */
export const LOGO_BOX: Record<LogoSize, { width: number; height: number }> = { small: { width: 110, height: 42 }, medium: { width: 170, height: 62 }, large: { width: 230, height: 86 } };
/** A logo is at most this big, so the PDF attached to an email stays small. */
export const LOGO_LIMIT = 1024 * 1024;
export const LOGO_TYPES: Readonly<Record<string, string>> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
export const LOGO_HINT = "PNG or JPG, up to 1 MB. A PNG with a transparent background prints best.";

export const INVOICE_LANGUAGES = ["en", "id"] as const;
export type InvoiceLanguage = (typeof INVOICE_LANGUAGES)[number];
export const INVOICE_LANGUAGE_LABELS: Record<InvoiceLanguage, string> = { en: "English", id: "Bahasa Indonesia" };

export const MAX_DUE_DAYS = 365;

/** The settings with every default filled in. */
export interface ResolvedInvoiceSettings {
  mainColor: string;
  accentColor: string;
  tableHeader: "tinted" | "solid";
  logo?: InvoiceSettings["logo"];
  logoSize: LogoSize;
  /** Only ever true with a logo: an invoice always names its issuer. */
  hideCompanyName: boolean;
  companyDetails: string;
  /** The tagline under ILA's own name, kept while the company details are the automatic ones. */
  tagline?: string;
  title: string;
  language: InvoiceLanguage;
  pricesIncludeTax: boolean;
  taxLabel: string;
  noTaxNote: string;
  dueDays: number;
  dueDaysKind: "working" | "calendar";
  showQty: boolean;
  /** Undefined: the automatic notes built from the bank accounts (`automaticSettlementNotes`). */
  settlementNotes?: string;
  defaultNotes: string;
  footerText: string;
  signature: { show: boolean; name: string; title: string };
}

type SettingsEntity = Pick<Entity, "name" | "legalName" | "isOwn" | "tax"> & Partial<Pick<Entity, "address" | "city" | "npwp" | "invoiceSettings">>;

const issuerName = (e: Pick<Entity, "name" | "legalName">) => e.legalName || e.name;

/** The lines printed under the company name when the settings give none: address with the city, then the NPWP. */
export function defaultCompanyDetails(entity: SettingsEntity): string {
  const address = [entity.address?.trim(), entity.city?.trim()].filter(Boolean).join(", ");
  return [address, entity.npwp ? `NPWP ${entity.npwp}` : ""].filter(Boolean).join("\n");
}

export function defaultFooterText(entity: SettingsEntity): string {
  if (entity.isOwn) return `${COMPANY.name} · ${COMPANY.baliOffice} · ${COMPANY.email} · ${COMPANY.phone}`;
  return [issuerName(entity), entity.address?.replace(/\s*\n\s*/g, ", ")].filter(Boolean).join(" · ");
}

const TEXT = (v: string | undefined, fallback: string) => (v === undefined ? fallback : v.trim());

export function resolveInvoiceSettings(entity: SettingsEntity): ResolvedInvoiceSettings {
  const s = entity.invoiceSettings ?? {};
  const language: InvoiceLanguage = s.language === "id" ? "id" : "en";
  const L = INVOICE_LABELS[language];
  const dueDays = Number.isFinite(s.dueDays) ? Math.min(Math.max(Math.trunc(s.dueDays as number), 0), MAX_DUE_DAYS) : COMPANY.invoiceDueWorkingDays;
  return {
    mainColor: parseHexColor(s.mainColor) ?? DEFAULT_MAIN_COLOR,
    accentColor: parseHexColor(s.accentColor) ?? DEFAULT_ACCENT_COLOR,
    tableHeader: s.tableHeader === "solid" ? "solid" : "tinted",
    logo: s.logo?.path ? s.logo : undefined,
    logoSize: LOGO_SIZES.includes(s.logoSize as LogoSize) ? (s.logoSize as LogoSize) : "medium",
    hideCompanyName: Boolean(s.hideCompanyName && s.logo?.path),
    companyDetails: TEXT(s.companyDetails, defaultCompanyDetails(entity)),
    tagline: entity.isOwn && s.companyDetails === undefined ? COMPANY.tagline : undefined,
    title: s.title?.trim() || L.title,
    language,
    pricesIncludeTax: Boolean(s.pricesIncludeTax),
    taxLabel: s.taxLabel?.trim() || "PPN",
    noTaxNote: TEXT(s.noTaxNote, entity.tax.pkp ? "" : L.noTax),
    dueDays,
    dueDaysKind: s.dueDaysKind === "calendar" ? "calendar" : "working",
    showQty: s.showQty !== false,
    settlementNotes: s.settlementNotes === undefined ? undefined : s.settlementNotes.trim(),
    defaultNotes: s.defaultNotes?.trim() ?? "",
    footerText: TEXT(s.footerText, defaultFooterText(entity)),
    signature: { show: Boolean(s.signature?.show), name: s.signature?.name?.trim() ?? "", title: s.signature?.title?.trim() ?? "" },
  };
}

/** Due date of an invoice dated `date` under the entity's payment term. */
export function dueDateFor(date: string, s: Pick<ResolvedInvoiceSettings, "dueDays" | "dueDaysKind">): string {
  return s.dueDaysKind === "calendar" ? addDays(date, s.dueDays) : addWorkingDays(date, s.dueDays);
}

/** "3 working days", "30 days", "1 hari kerja": the payment term in words. */
export function paymentTermText(s: Pick<ResolvedInvoiceSettings, "dueDays" | "dueDaysKind">, language: InvoiceLanguage = "en"): string {
  if (language === "id") return `${s.dueDays} hari${s.dueDaysKind === "working" ? " kerja" : ""}`;
  return `${s.dueDays} ${s.dueDaysKind === "working" ? "working " : ""}day${s.dueDays === 1 ? "" : "s"}`;
}

// ---------- Labels ----------

export interface InvoiceLabels {
  title: string; date: string; dueDate: string; currency: string; taxInvoice: string; billTo: string;
  description: string; qty: string; unitPrice: string; amount: string;
  subtotal: string; discount: string; total: string; paid: string; balance: string;
  /** "Includes PPN 11%": the tax contained in a total whose prices include it. */
  includes: (tax: string) => string;
  taxBase: string; rate: string; settlement: string; notes: string; signature: string; noTax: string;
  void: string; draft: string; dateLocale: string;
}

export const INVOICE_LABELS: Record<InvoiceLanguage, InvoiceLabels> = {
  en: {
    title: "INVOICE", date: "Invoice date", dueDate: "Due date", currency: "Currency", taxInvoice: "e-Faktur", billTo: "Bill to",
    description: "Description", qty: "Qty", unitPrice: "Unit price", amount: "Amount",
    subtotal: "Subtotal", discount: "Discount", total: "Total", paid: "Paid", balance: "Balance due",
    includes: (tax) => `Includes ${tax}`, taxBase: "Tax base (DPP)", rate: "Rate", settlement: "Payment", notes: "Notes", signature: "Authorised signature",
    noTax: "Not applicable (non-PKP)", void: "VOID", draft: "DRAFT", dateLocale: "en-GB",
  },
  id: {
    title: "FAKTUR", date: "Tanggal", dueDate: "Jatuh tempo", currency: "Mata uang", taxInvoice: "e-Faktur", billTo: "Kepada",
    description: "Keterangan", qty: "Jml", unitPrice: "Harga satuan", amount: "Jumlah",
    subtotal: "Subtotal", discount: "Diskon", total: "Total", paid: "Dibayar", balance: "Sisa tagihan",
    includes: (tax) => `Termasuk ${tax}`, taxBase: "Dasar pengenaan pajak (DPP)", rate: "Kurs", settlement: "Pembayaran", notes: "Catatan", signature: "Hormat kami",
    noTax: "Tidak dikenakan (non-PKP)", void: "BATAL", draft: "DRAF", dateLocale: "id-ID",
  },
};

// ---------- Settlement notes ----------

type BankLine = Pick<BankAccount, "name" | "currency"> & Partial<Pick<BankAccount, "bankName" | "accountNumber">>;

/** One line per bank account: "Bank OCBC NISP 123456789 (IDR) · PT EXAMPLE". */
export function bankAccountLines(banks: readonly BankLine[], holder: string): string[] {
  return banks.map((b) => [`${b.bankName?.trim() || b.name} ${b.accountNumber?.trim() ?? ""}`.trim(), `(${b.currency})`, holder ? `· ${holder}` : ""].filter(Boolean).join(" "));
}

/**
 * The settlement notes an entity gets without writing any: the payment term, its bank accounts, and the reference to
 * quote. `{number}` is filled in on each invoice (`fillPlaceholders`).
 */
export function automaticSettlementNotes(entity: SettingsEntity, banks: readonly BankLine[], settings: ResolvedInvoiceSettings = resolveInvoiceSettings(entity)): string {
  const term = paymentTermText(settings, settings.language);
  const lines = bankAccountLines(banks, issuerName(entity));
  if (settings.language === "id") {
    return [lines.length ? `Pembayaran melalui transfer bank dalam ${term} ke:` : `Pembayaran melalui transfer bank dalam ${term}.`, ...lines, "Mohon cantumkan {number} sebagai referensi transfer. Biaya bank ditanggung oleh pembayar."].join("\n");
  }
  return [lines.length ? `Payment by bank transfer within ${term} to:` : `Payment by bank transfer within ${term}.`, ...lines, "Please quote {number} as the transfer reference. Bank charges are borne by the payer."].join("\n");
}

/** What a new invoice starts with: the entity's own settlement notes, else the automatic ones. */
export function defaultSettlementNotes(entity: SettingsEntity, banks: readonly BankLine[]): string {
  const settings = resolveInvoiceSettings(entity);
  return settings.settlementNotes ?? automaticSettlementNotes(entity, banks, settings);
}

export const INVOICE_PLACEHOLDERS: ReadonlyArray<{ token: string; meaning: string }> = [
  { token: "{number}", meaning: "invoice number" },
  { token: "{date}", meaning: "invoice date" },
  { token: "{due_date}", meaning: "due date" },
  { token: "{total}", meaning: "total of the invoice" },
  { token: "{customer}", meaning: "customer name" },
];

type PlaceholderInvoice = Pick<Invoice, "number" | "date" | "dueDate" | "total" | "currency" | "customer">;

/** Replaces `{number}`, `{date}`, `{due_date}`, `{total}` and `{customer}` in a text with the invoice's own; anything else is left as written. */
export function fillPlaceholders(text: string, invoice: PlaceholderInvoice, language: InvoiceLanguage = "en"): string {
  const locale = INVOICE_LABELS[language].dateLocale;
  const values: Record<string, string> = {
    number: invoice.number, date: fmtDate(invoice.date, locale), due_date: fmtDate(invoice.dueDate, locale),
    total: fmtMoneyAt(invoice.total, columnDecimals(invoice.currency, [invoice.total]), invoice.currency), customer: invoice.customer.name,
  };
  return text.replace(/\{([a-z_]+)\}/gi, (whole, key: string) => values[key.toLowerCase()] ?? whole);
}

// ---------- The document ----------

export interface InvoiceDocRow { label: string; value: string; kind: "normal" | "total" | "muted" }

/** What is printed on an invoice, in reading order; amounts are already formatted. */
export interface InvoiceDoc {
  language: InvoiceLanguage;
  colors: {
    /** Fill colours as chosen, and the same colours made dark enough to be read as text on white. */
    main: string; mainText: string; accent: string; accentText: string;
    headerFill: string; headerText: string; rule: string; ink: string; grey: string;
  };
  /** Storage key of the logo and the box it is fitted into. */
  logo?: { path: string; boxWidth: number; boxHeight: number; width?: number; height?: number };
  company: { name: string; showName: boolean; tagline?: string; details: string[] };
  title: string;
  number: string;
  /** "VOID" or "DRAFT". */
  stamp?: string;
  meta: Array<{ label: string; value: string; strong?: boolean }>;
  billTo: { label: string; name: string; lines: string[] };
  showQty: boolean;
  columns: { description: string; qty: string; unitPrice: string; amount: string };
  lines: Array<{ description: string; qty: string; unitPrice: string; amount: string }>;
  totals: InvoiceDocRow[];
  /** Under the totals: the exchange rate of a foreign-currency invoice. */
  totalsNote?: string;
  /** Settlement notes, then the invoice's own notes. */
  blocks: Array<{ label: string; text: string }>;
  signature?: { label: string; issuer: string; name: string; title: string };
  footer: string;
}

export interface InvoiceDocInput {
  invoice: Invoice;
  entity: SettingsEntity;
  /** The entity's active bank accounts, for the automatic settlement notes. */
  banks?: readonly BankLine[];
}

const pct = (rate: number) => `${Number((rate * 100).toFixed(1))}%`;
const paragraphs = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** The rate the invoice was charged at: PPN over its base when it carries both, else the entity's rate. */
function chargedRate(invoice: Invoice, entityRate: number): number {
  const base = invoice.taxableBase ?? invoice.lines.filter((l) => l.taxCode === "ppn").reduce((s, l) => s + l.amount, 0) * (invoice.subtotal > 0 ? 1 - invoice.discount / invoice.subtotal : 0);
  if (!(base > 0) || !(invoice.ppnAmount > 0)) return entityRate;
  const rate = invoice.ppnAmount / base;
  return Math.abs(rate - entityRate) < 0.0005 ? entityRate : rate;
}

export function invoiceDocument({ invoice, entity, banks = [] }: InvoiceDocInput): InvoiceDoc {
  const s = resolveInvoiceSettings(entity);
  const L = INVOICE_LABELS[s.language];
  const ccy = invoice.currency;
  const inclusive = Boolean(invoice.pricesIncludeTax);
  const lineAmount = (l: Invoice["lines"][number]) => (inclusive ? l.grossAmount ?? roundMoney(l.qty * l.unitPrice, ccy) : l.amount);
  const subtotal = inclusive ? invoice.grossSubtotal ?? invoice.subtotal : invoice.subtotal;
  const discount = inclusive ? invoice.grossDiscount ?? invoice.discount : invoice.discount;
  const balance = roundMoney(invoice.total - invoice.amountPaid, ccy);
  // One number of decimals for the whole document, so the columns line up: rupiah show cents only when some amount has them.
  const dec = columnDecimals(ccy, [...invoice.lines.flatMap((l) => [l.unitPrice, lineAmount(l)]), subtotal, discount, invoice.ppnAmount, invoice.total, invoice.amountPaid, invoice.taxableBase]);
  const money = (x: number) => fmtMoneyAt(x, dec, ccy);
  const day = (d: string) => fmtDate(d, L.dateLocale);
  const tax = `${s.taxLabel} ${pct(chargedRate(invoice, entity.tax.ppnRate))}`;

  const totals: InvoiceDocRow[] = [{ label: L.subtotal, value: money(subtotal), kind: "normal" }];
  if (discount > 0) totals.push({ label: L.discount, value: `\u2212${money(discount)}`, kind: "normal" });
  if (!inclusive && invoice.ppnAmount > 0) totals.push({ label: tax, value: money(invoice.ppnAmount), kind: "normal" });
  if (!(invoice.ppnAmount > 0) && s.noTaxNote) totals.push({ label: s.taxLabel, value: s.noTaxNote, kind: "muted" });
  totals.push({ label: L.total, value: money(invoice.total), kind: "total" });
  if (inclusive && invoice.ppnAmount > 0) {
    totals.push({ label: L.taxBase, value: money(invoice.taxableBase ?? roundMoney(invoice.subtotal - invoice.discount, ccy)), kind: "muted" });
    totals.push({ label: L.includes(tax), value: money(invoice.ppnAmount), kind: "muted" });
  }
  if (invoice.amountPaid > 0) {
    totals.push({ label: L.paid, value: money(invoice.amountPaid), kind: "normal" });
    totals.push({ label: L.balance, value: money(balance), kind: "total" });
  }

  const meta: InvoiceDoc["meta"] = [{ label: L.date, value: day(invoice.date) }, { label: L.dueDate, value: day(invoice.dueDate), strong: true }];
  if (ccy !== "IDR") meta.push({ label: L.currency, value: ccy });
  if (invoice.fakturNumber) meta.push({ label: L.taxInvoice, value: invoice.fakturNumber });

  // A text typed in a form arrives with CRLF line ends: the PDF fonts have no glyph for the carriage return.
  const clean = (text: string) => text.replace(/\r\n?/g, "\n").trim();
  const settlement = fillPlaceholders(clean(invoice.paymentInstructions ?? s.settlementNotes ?? automaticSettlementNotes(entity, banks, s)), invoice, s.language);
  const notes = fillPlaceholders(clean(invoice.notes ?? ""), invoice, s.language);
  const blocks: InvoiceDoc["blocks"] = [];
  if (settlement) blocks.push({ label: L.settlement, text: settlement });
  if (notes) blocks.push({ label: L.notes, text: notes });

  const box = LOGO_BOX[s.logoSize];
  const solid = s.tableHeader === "solid";
  const mainText = textOnWhite(s.mainColor);
  return {
    language: s.language,
    colors: {
      main: s.mainColor, mainText, accent: s.accentColor, accentText: textOnWhite(s.accentColor),
      headerFill: solid ? s.mainColor : mixColor(s.mainColor, WHITE, 0.9), headerText: solid ? textOnColor(s.mainColor) : mainText,
      rule: mixColor(s.accentColor, WHITE, 0.55), ink: INK, grey: GREY,
    },
    logo: s.logo ? { path: s.logo.path, boxWidth: box.width, boxHeight: box.height, width: s.logo.width, height: s.logo.height } : undefined,
    company: { name: issuerName(entity), showName: !s.hideCompanyName, tagline: s.tagline, details: paragraphs(s.companyDetails) },
    title: s.title,
    number: invoice.number,
    stamp: invoice.status === "void" ? L.void : invoice.status === "draft" ? L.draft : undefined,
    meta,
    billTo: { label: L.billTo, name: invoice.customer.name, lines: [...paragraphs(invoice.customer.address ?? ""), invoice.customer.npwp ? `NPWP ${invoice.customer.npwp}` : "", invoice.customer.email ?? ""].filter(Boolean) },
    showQty: s.showQty,
    columns: { description: L.description, qty: L.qty, unitPrice: L.unitPrice, amount: L.amount },
    lines: invoice.lines.map((l) => ({ description: l.description, qty: String(l.qty), unitPrice: money(l.unitPrice), amount: money(lineAmount(l)) })),
    totals,
    totalsNote: ccy !== "IDR" && invoice.fxRate > 1 ? `${L.rate}: 1 ${ccy} = ${fmtMoneyAt(invoice.fxRate, columnDecimals("IDR", [invoice.fxRate]), "IDR")}` : undefined,
    blocks,
    signature: s.signature.show ? { label: L.signature, issuer: issuerName(entity), name: s.signature.name, title: s.signature.title } : undefined,
    footer: s.footerText,
  };
}

/** Size the logo is drawn at: fitted into its box, never enlarged beyond it. Undefined dimensions fill the box height. */
export function logoDrawSize(logo: NonNullable<InvoiceDoc["logo"]>): { width: number; height: number } {
  const { width: w, height: h, boxWidth, boxHeight } = logo;
  if (!w || !h) return { width: boxWidth, height: boxHeight };
  const scale = Math.min(boxWidth / w, boxHeight / h);
  return { width: Math.round(w * scale * 100) / 100, height: Math.round(h * scale * 100) / 100 };
}
