"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { bool, num, str } from "@/lib/util";
import { FX_CURRENCIES, clearImportDraft, commitImport, loadImportDraft, prepareImport, saveImportDraft, type ImportKind, type ImportOptions } from "@/lib/import-services";

/** Admin-only: upload → preview (dry run) → import. The file is kept server-side between the two steps. */

const kindSchema = z.enum(["hubspot_contacts", "qbo_customers", "qbo_invoices"]);
const optionsSchema = z.object({
  dateFormat: z.enum(["auto", "dmy", "mdy", "ymd"]),
  postToLedger: z.boolean(),
  fxRates: z.record(z.string().regex(/^[A-Z]{3}$/), z.number().positive()),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const MAX_BYTES = 8 * 1024 * 1024;

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
  return optionsSchema.parse({ dateFormat: str(fd, "dateFormat") ?? "auto", postToLedger: bool(fd, "postToLedger"), fxRates, fromDate: str(fd, "fromDate") });
}

const PATHS_TOUCHED: Record<ImportKind, string[]> = {
  hubspot_contacts: ["/clients/contacts", "/clients/companies"],
  qbo_customers: ["/clients/contacts", "/clients/companies"],
  qbo_invoices: ["/books", "/"],
};

/** Step 1: read the uploaded CSV, store it with the chosen options and show the dry run. */
export async function previewImport(fd: FormData) {
  const user = await requirePermission("admin");
  const parsedKind = kindSchema.safeParse(str(fd, "kind"));
  if (!parsedKind.success) back("Unknown import type.");
  const kind = parsedKind.data;
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back("Choose a CSV file first.");
  if (file.size > MAX_BYTES) back("The file is larger than 8 MB. Export fewer columns or split it by year.");
  let options: ImportOptions;
  try { options = readOptions(fd); } catch { back("Check the options: rates must be positive numbers and dates YYYY-MM-DD."); }
  const text = await file.text();
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
  await clearImportDraft(user.id, kind);
  for (const p of ["/settings/import", ...PATHS_TOUCHED[kind]]) revalidatePath(p);
  redirect(`/settings/import?done=${batch.id}`);
}

export async function discardPendingImport(fd: FormData) {
  const user = await requirePermission("admin");
  const parsedKind = kindSchema.safeParse(str(fd, "kind"));
  if (parsedKind.success) await clearImportDraft(user.id, parsedKind.data);
  revalidatePath("/settings/import");
  redirect("/settings/import");
}
