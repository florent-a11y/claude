/**
 * Store side of the invoice settings (rules and vocabulary in lib/invoice-settings.ts): saving what the accounting
 * team chose, the logo file, and everything a renderer needs besides the invoice (bank accounts, logo bytes).
 *
 * The logo is kept like an attachment (lib/files.ts) under `<entityId>/invoice-logo/<entityId>/…`, so the files route
 * serves it to whoever may see the entity. It is checked by lib/image-info.ts before it is stored and again before
 * it is handed to pdfkit: see there why a damaged PNG must never reach the PDF renderer.
 */
import { db } from "./db";
import { BooksError, loadEntity } from "./books";
import { deleteAttachment, extensionOf, putAttachment, readAttachment } from "./files";
import { ImageError, readImageInfo } from "./image-info";
import { renderInvoicePdf } from "./invoice-pdf";
import { DEFAULT_NOTES_SIZE, INVOICE_LANGUAGES, LOGO_LIMIT, LOGO_SIZES, LOGO_TYPES, MAX_DUE_DAYS, NOTES_SIZES, parseHexColor, type InvoiceLanguage, type LogoSize, type NotesSize } from "./invoice-settings";
import type { BankAccount, Entity, Invoice, InvoiceSettings } from "./types";

export const LOGO_DOC_TYPE = "invoice-logo";

/**
 * What the settings page sends. A text left `undefined` goes back to its automatic value (the company details from the
 * entity, the settlement notes from the bank accounts, the usual footer); an empty string prints nothing.
 */
export interface InvoiceSettingsInput {
  mainColor?: string; accentColor?: string; tableHeader?: "tinted" | "solid";
  logoSize?: LogoSize; hideCompanyName?: boolean; companyDetails?: string;
  title?: string; language?: InvoiceLanguage;
  pricesIncludeTax?: boolean; taxLabel?: string; noTaxNote?: string;
  dueDays?: number; dueDaysKind?: "working" | "calendar"; showQty?: boolean;
  settlementNotes?: string; defaultNotes?: string; footerText?: string;
  signature?: { show: boolean; name?: string; title?: string };
  notesSize?: NotesSize;
}

const LIMITS = { title: 40, taxLabel: 24, noTaxNote: 120, companyDetails: 600, settlementNotes: 2000, defaultNotes: 2000, footerText: 300, signature: 80 } as const;

function text(value: string | undefined, max: number, label: string): string | undefined {
  if (value === undefined) return undefined;
  const v = value.replace(/\r\n?/g, "\n").trim();
  if (v.length > max) throw new BooksError(`${label} is too long (${v.length} characters, at most ${max}).`);
  return v;
}

function color(value: string | undefined, label: string): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const c = parseHexColor(value);
  if (!c) throw new BooksError(`${label}: "${value}" is not a colour. Use the picker or a code like #0f3b5e.`);
  return c;
}

async function requireEntityRow(entityId: string): Promise<Entity> {
  const entity = await loadEntity(entityId);
  if (!entity) throw new BooksError("Entity not found.");
  return entity;
}

/** Saves the settings; the logo is untouched (`setInvoiceLogo`, `removeInvoiceLogo`). */
export async function saveInvoiceSettings(entityId: string, input: InvoiceSettingsInput, userId?: string): Promise<Entity> {
  const entity = await requireEntityRow(entityId);
  const dueDays = input.dueDays === undefined ? undefined : Math.trunc(input.dueDays);
  if (dueDays !== undefined && (!Number.isFinite(dueDays) || dueDays < 0 || dueDays > MAX_DUE_DAYS)) throw new BooksError(`The payment term must be between 0 and ${MAX_DUE_DAYS} days.`);
  const now = new Date().toISOString();
  const next: InvoiceSettings = {
    mainColor: color(input.mainColor, "Main colour"), accentColor: color(input.accentColor, "Accent colour"),
    tableHeader: input.tableHeader === "solid" ? "solid" : undefined,
    logo: entity.invoiceSettings?.logo,
    logoSize: input.logoSize && LOGO_SIZES.includes(input.logoSize) ? input.logoSize : undefined,
    hideCompanyName: input.hideCompanyName || undefined,
    companyDetails: text(input.companyDetails, LIMITS.companyDetails, "Company details"),
    title: text(input.title, LIMITS.title, "Document title") || undefined,
    language: input.language && INVOICE_LANGUAGES.includes(input.language) && input.language !== "en" ? input.language : undefined,
    pricesIncludeTax: input.pricesIncludeTax || undefined,
    taxLabel: text(input.taxLabel, LIMITS.taxLabel, "Tax name") || undefined,
    noTaxNote: text(input.noTaxNote, LIMITS.noTaxNote, "Note when no tax is charged"),
    dueDays, dueDaysKind: input.dueDaysKind === "calendar" ? "calendar" : undefined,
    showQty: input.showQty === false ? false : undefined,
    settlementNotes: text(input.settlementNotes, LIMITS.settlementNotes, "Settlement notes"),
    defaultNotes: text(input.defaultNotes, LIMITS.defaultNotes, "Notes") || undefined,
    footerText: text(input.footerText, LIMITS.footerText, "Footer"),
    signature: input.signature?.show || input.signature?.name || input.signature?.title
      ? { show: Boolean(input.signature.show), name: text(input.signature.name, LIMITS.signature, "Signatory name") || undefined, title: text(input.signature.title, LIMITS.signature, "Signatory title") || undefined }
      : undefined,
    notesSize: input.notesSize && NOTES_SIZES.includes(input.notesSize) && input.notesSize !== DEFAULT_NOTES_SIZE ? input.notesSize : undefined,
    updatedAt: now, updatedByUserId: userId,
  };
  return (await db.update("entities", entityId, { invoiceSettings: next, updatedAt: now }))!;
}

/** Back to the layout invoices have without settings; the logo is kept (remove it on its own). */
export async function resetInvoiceSettings(entityId: string, userId?: string): Promise<Entity> {
  const entity = await requireEntityRow(entityId);
  const now = new Date().toISOString();
  const logo = entity.invoiceSettings?.logo;
  return (await db.update("entities", entityId, { invoiceSettings: logo ? { logo, updatedAt: now, updatedByUserId: userId } : undefined, updatedAt: now }))!;
}

/** Why a file cannot be the logo, or null. Format and content are checked by `setInvoiceLogo`. */
export function checkLogoFile(file: { name: string; size: number }): string | null {
  if (!LOGO_TYPES[extensionOf(file.name)]) return "The logo must be a PNG or JPG image.";
  if (!(file.size > 0)) return "The logo file is empty.";
  if (file.size > LOGO_LIMIT) return `The logo is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${LOGO_LIMIT / 1024 / 1024} MB. Export it smaller and upload it again.`;
  return null;
}

/** Stores a new logo and removes the file it replaces. */
export async function setInvoiceLogo(entityId: string, file: File, by?: { id?: string; name?: string }): Promise<Entity> {
  const entity = await requireEntityRow(entityId);
  const refused = checkLogoFile(file);
  if (refused) throw new BooksError(refused);
  let info;
  try { info = readImageInfo(Buffer.from(await file.arrayBuffer())); } catch (e) { throw new BooksError(e instanceof ImageError ? e.message : "The logo could not be read."); }
  // The extension decides the type that is stored and served: it must say what the file is.
  if (LOGO_TYPES[extensionOf(file.name)] !== (info.type === "png" ? "image/png" : "image/jpeg")) throw new BooksError(`This file is a ${info.type === "png" ? "PNG" : "JPG"} image: rename it to .${info.type === "png" ? "png" : "jpg"} and upload it again.`);
  const stored = await putAttachment({ entityId, docType: LOGO_DOC_TYPE, docId: entityId, file, byUserId: by?.id, byName: by?.name });
  const previous = entity.invoiceSettings?.logo;
  const now = new Date().toISOString();
  const updated = (await db.update("entities", entityId, { invoiceSettings: { ...(entity.invoiceSettings ?? {}), logo: { ...stored, width: info.width, height: info.height }, updatedAt: now, updatedByUserId: by?.id }, updatedAt: now }))!;
  if (previous?.path && previous.path !== stored.path) await deleteAttachment(previous.path).catch(() => undefined);
  return updated;
}

export async function removeInvoiceLogo(entityId: string, userId?: string): Promise<Entity> {
  const entity = await requireEntityRow(entityId);
  const previous = entity.invoiceSettings?.logo;
  if (!previous) return entity;
  const now = new Date().toISOString();
  const updated = (await db.update("entities", entityId, { invoiceSettings: { ...(entity.invoiceSettings ?? {}), logo: undefined, hideCompanyName: undefined, updatedAt: now, updatedByUserId: userId }, updatedAt: now }))!;
  await deleteAttachment(previous.path).catch(() => undefined);
  return updated;
}

/** The logo bytes for the PDF: undefined when there is none, when the file is missing, or when it no longer passes the check. */
export async function invoiceLogo(entity: Pick<Entity, "invoiceSettings">): Promise<Buffer | undefined> {
  const path = entity.invoiceSettings?.logo?.path;
  if (!path) return undefined;
  try {
    const file = await readAttachment(path);
    if (!file) return undefined;
    readImageInfo(file.buffer);
    return file.buffer;
  } catch (e) {
    console.error(`[invoice-settings] logo ${path} not used: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

/** The entity's active bank accounts, in the order they are listed in the automatic settlement notes. */
export async function invoiceBanks(entityId: string): Promise<BankAccount[]> {
  return db.list("bank_accounts", { where: { entityId, active: true } });
}

/** The PDF of an invoice as the entity's settings lay it out: what "Download PDF" serves and "Send to client" attaches. */
export async function invoicePdf(entity: Entity, invoice: Invoice): Promise<Buffer> {
  const [banks, logo] = await Promise.all([invoiceBanks(entity.id), invoiceLogo(entity)]);
  return renderInvoicePdf(invoice, entity, { banks, logo });
}

/** URL of the logo for the printable page and the settings preview. */
export function invoiceLogoUrl(entity: Pick<Entity, "id" | "invoiceSettings">): string | undefined {
  const path = entity.invoiceSettings?.logo?.path;
  return path ? `/api/books/${entity.id}/files/${path}` : undefined;
}
