"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { bool, num, str } from "@/lib/util";
import { detectQboReport, gridToCSV, tableFromGrid } from "@/lib/importers";
import { sheetsFromFile } from "@/lib/statement-file";
import { QBO_MAX_ROWS } from "@/lib/qbo-migration";
import { FX_CURRENCIES, IMPORT_KINDS, clearImportDraft, commitImport, loadImportDraft, prepareImport, saveImportDraft, type ImportKind, type ImportOptions } from "@/lib/import-services";
import { companyNeedsBooks, createEntityFromInput, entityInputFromCompany } from "../entities/create-entity";

/**
 * Admin-only single-file imports: upload → preview (dry run) → import. The file (CSV, or an Excel export read on the
 * server) is kept server-side between the two steps. The guided, multi-file migration of a whole QuickBooks company
 * lives in ./quickbooks and POST /api/settings/import/quickbooks.
 */

const kindSchema = z.enum(IMPORT_KINDS as [ImportKind, ...ImportKind[]]);
const optionsSchema = z.object({
  dateFormat: z.enum(["auto", "dmy", "mdy", "ymd"]),
  postToLedger: z.boolean(),
  fxRates: z.record(z.string().regex(/^[A-Z]{3}$/), z.number().positive()),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  entityId: z.string().max(80).optional(),
  createBooks: z.boolean().optional(),
});

/** Server actions share the platform's 4.5 MB request limit (next.config.ts allows 5 MB, Vercel less). */
const MAX_BYTES = 4 * 1024 * 1024;

function back(message: string): never {
  redirect(`/settings/import?error=${encodeURIComponent(message)}`);
}

function readOptions(fd: FormData): ImportOptions {
  const fxRates: Record<string, number> = {};
  for (const c of FX_CURRENCIES) { const v = num(fd, `fx_${c}`, 0); if (v > 0) fxRates[c] = v; }
  // Free-form extra rates: "CHF=18500, JPY=110".
  for (const part of (str(fd, "fx_other") ?? "").split(/[,;\n]/)) {
    const m = part.trim().match(/^([A-Za-z]{3})\s*[=:]\s*([0-9.,]+)$/);
    if (m) { const v = Number(m[2].replace(/,/g, "")); if (v > 0) fxRates[m[1].toUpperCase()] = v; }
  }
  return optionsSchema.parse({ dateFormat: str(fd, "dateFormat") ?? "auto", postToLedger: bool(fd, "postToLedger"), fxRates, fromDate: str(fd, "fromDate"), entityId: str(fd, "entityId"), createBooks: bool(fd, "createBooks") });
}

/**
 * The uploaded file as CSV text. A CSV is taken as it is; an Excel export (.xlsx, .xls) is read on the server and
 * the sheet that looks like a report is serialised back to CSV, so both travel the same way to `tableFromGrid`.
 */
async function fileText(file: File): Promise<string> {
  if (!/\.(xlsx|xls)$/i.test(file.name)) return file.text();
  let sheets: ReturnType<typeof sheetsFromFile>;
  try { sheets = sheetsFromFile(file.name, Buffer.from(await file.arrayBuffer()), QBO_MAX_ROWS).filter((s) => s.grid.length > 0); } catch { back("The Excel file could not be opened. Export it again, or save it as CSV."); }
  const sheet = sheets.find((s) => detectQboReport(tableFromGrid(s.grid)).kind !== "unknown") ?? sheets[0];
  if (!sheet) back("The file is empty.");
  if (sheet.grid.length >= QBO_MAX_ROWS) back(`The sheet has ${QBO_MAX_ROWS.toLocaleString("en-US")} rows or more: export a shorter period, or save it as CSV.`);
  return gridToCSV(sheet.grid);
}

const PATHS_TOUCHED: Record<ImportKind, string[]> = {
  hubspot_contacts: ["/clients/contacts", "/clients/companies"],
  qbo_customers: ["/clients/contacts", "/clients/companies"],
  qbo_invoices: ["/books", "/"],
  qbo_accounts: ["/books", "/"],
  qbo_trial_balance: ["/books", "/"],
  qbo_journal: ["/books", "/"],
  qbo_bills: ["/books", "/"],
  qbo_vendors: ["/clients/vendors"],
};

/** Step 1: read the uploaded CSV or Excel file, store it with the chosen options and show the dry run. */
export async function previewImport(fd: FormData) {
  const user = await requirePermission("admin");
  const parsedKind = kindSchema.safeParse(str(fd, "kind"));
  if (!parsedKind.success) back("Unknown import type.");
  const kind = parsedKind.data;
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back("Choose a CSV or Excel file first.");
  if (file.size > MAX_BYTES) back("The file is larger than 4 MB. Export one year at a time, or save it as CSV.");
  let options: ImportOptions;
  try { options = readOptions(fd); } catch { back("Check the options: rates must be positive numbers and dates YYYY-MM-DD."); }
  const text = await fileText(file);
  if (!text.trim()) back("The file is empty.");
  await saveImportDraft({ kind, fileName: file.name || "upload.csv", text, options, byUserId: user.id, createdAt: new Date().toISOString() });
  revalidatePath("/settings/import");
  redirect(`/settings/import?preview=${kind}`);
}

/** Change options (date format, rates, posting) on a pending upload without uploading again. */
export async function updateImportOptions(fd: FormData) {
  const user = await requirePermission("admin");
  const parsedKind = kindSchema.safeParse(str(fd, "kind"));
  if (!parsedKind.success) back("Unknown import type.");
  const kind = parsedKind.data;
  const draft = await loadImportDraft(user.id, kind);
  if (!draft) back("Nothing is pending. Upload the file again.");
  let options: ImportOptions;
  try { options = readOptions(fd); } catch { back("Check the options: rates must be positive numbers and dates YYYY-MM-DD."); }
  await saveImportDraft({ ...draft, options });
  revalidatePath("/settings/import");
  redirect(`/settings/import?preview=${kind}`);
}

/** Step 2: write the pending upload. The plan is rebuilt from the stored file so the preview and the import match. */
export async function runPendingImport(fd: FormData) {
  const user = await requirePermission("admin");
  const parsedKind = kindSchema.safeParse(str(fd, "kind"));
  if (!parsedKind.success) back("Unknown import type.");
  const kind = parsedKind.data;
  const draft = await loadImportDraft(user.id, kind);
  if (!draft) back("Nothing is pending. Upload the file again.");
  const plan = await prepareImport(kind, draft.text, draft.options);
  if (plan.blocking) back(plan.blocking);
  const batch = await commitImport(plan, draft.fileName, user.id);
  const touched = [...PATHS_TOUCHED[kind]];
  if (kind === "qbo_customers" && draft.options.createBooks) {
    // "Create books for the imported companies": one entity per company this import inserted that needs books.
    // Individuals are contacts and never get books; prospects and inactive customers do not either.
    let books = 0;
    const errors = [...batch.errors];
    for (const company of plan.companies) {
      if (!companyNeedsBooks(company)) continue;
      try { await createEntityFromInput(entityInputFromCompany(company)); books++; }
      catch (e) { errors.push(`${company.name}: books not created (${e instanceof Error ? e.message : String(e)})`); }
    }
    await db.update("import_batches", batch.id, { counts: { ...batch.counts, books }, errors });
    touched.push("/settings/entities", "/books", "/");
  }
  await clearImportDraft(user.id, kind);
  for (const p of ["/settings/import", ...touched, ...(plan.entityId ? [`/books/${plan.entityId}`] : [])]) revalidatePath(p);
  redirect(`/settings/import?done=${batch.id}`);
}

export async function discardPendingImport(fd: FormData) {
  const user = await requirePermission("admin");
  const parsedKind = kindSchema.safeParse(str(fd, "kind"));
  if (parsedKind.success) await clearImportDraft(user.id, parsedKind.data);
  revalidatePath("/settings/import");
  redirect("/settings/import");
}
