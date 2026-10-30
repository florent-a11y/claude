"use server";
import { db } from "@/lib/db";
import { requirePermission, type Permission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { checkAttachment, deleteAttachment, putAttachment } from "@/lib/files";
import type { Attachment } from "@/lib/types";
import { CRM_SCOPE, type AttachmentDocType } from "@/components/Attachments";
import { act, base, withFlash } from "../shared";

/**
 * Upload / delete supporting documents on a books record. The files live in lib/files.ts storage; the record keeps
 * the metadata in its `attachments` array. Every action checks the record belongs to the entity and that the user may
 * write the books, then redirects back to the page it came from with a flash message (or `?error=`).
 */

type AttachmentTable = "invoices" | "bills" | "journal_entries" | "payments" | "fixed_assets" | "import_batches" | "withholding_slips" | "tax_obligations" | "payroll_runs" | "employees" | "entities" | "companies" | "contacts" | "vendors";
const TABLES: Record<AttachmentDocType, AttachmentTable> = {
  invoice: "invoices", bill: "bills", journal: "journal_entries", payment: "payments", asset: "fixed_assets", import: "import_batches",
  slip: "withholding_slips", obligation: "tax_obligations", payroll_run: "payroll_runs", employee: "employees", entity: "entities",
  company: "companies", contact: "contacts", vendor: "vendors",
};
/** Who may attach to each kind of record. */
const PERMISSION: Record<AttachmentDocType, Permission> = {
  invoice: "books:write", bill: "books:write", journal: "books:write", payment: "books:write", asset: "books:write", import: "books:write",
  slip: "tax:write", obligation: "tax:write", payroll_run: "tax:write", employee: "tax:write", entity: "admin",
  company: "crm:write", contact: "crm:write", vendor: "crm:write",
};
const CRM_TYPES: ReadonlySet<string> = new Set(["company", "contact", "vendor"]);

function tableFor(docType: string): AttachmentTable {
  const table = TABLES[docType as AttachmentDocType];
  if (!table) throw new Error("Unknown document type");
  return table;
}

/**
 * The record must sit in the scope the files are stored under: books, tax, payroll and entity records under their
 * entity id; directory records (no entity) under the "crm" scope, which only team members can read.
 */
async function loadRecord(entityId: string, docType: string, docId: string) {
  const table = tableFor(docType);
  const row = await db.get(table, docId);
  if (!row) throw new Error("Document not found");
  if (CRM_TYPES.has(docType)) { if (entityId !== CRM_SCOPE) throw new Error("Document not found"); }
  else if (docType === "entity") { if (row.id !== entityId) throw new Error("Document not found"); }
  else if ((row as { entityId?: string }).entityId !== entityId) throw new Error("Document not found");
  return { table, row };
}

/** Only redirect within the app (the target is a bound argument, but keep the redirect closed anyway). */
function returnPath(entityId: string, backTo: string | undefined): string {
  if (backTo && backTo.startsWith("/") && !backTo.startsWith("//")) return backTo;
  return entityId === CRM_SCOPE ? "/clients" : base(entityId);
}

/** Form field `files` (one or several). Validates every file before storing any, so a refused file leaves nothing half done. */
export async function uploadAttachmentAction(entityId: string, docType: AttachmentDocType, docId: string, backTo: string, fd: FormData) {
  const to = returnPath(entityId, backTo);
  await act(entityId, async () => {
    const user = await requirePermission(PERMISSION[docType] ?? "books:write");
    const { table } = await loadRecord(entityId, docType, docId);
    const files = fd.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).name !== "" && (f as File).size > 0);
    if (files.length === 0) throw new Error("Choose at least one file to upload.");
    for (const f of files) {
      const error = checkAttachment({ name: f.name, size: f.size, type: f.type });
      if (error) throw new Error(error);
    }
    const added: Attachment[] = [];
    for (const f of files) added.push(await putAttachment({ entityId, docType, docId, file: f, byUserId: user.id, byName: user.name }));
    // Re-read right before writing so two people attaching at the same time do not drop each other's files.
    const current = (await db.get(table, docId))?.attachments ?? [];
    await db.update(table, docId, { attachments: [...current, ...added] });
    if (entityId === CRM_SCOPE) revalidatePath("/clients", "layout"); else { revalidatePath(`/tax/${entityId}`, "layout"); revalidatePath(`/payroll/${entityId}`, "layout"); revalidatePath("/settings", "layout"); }
    return withFlash(to, added.length === 1 ? `Attached ${added[0].name}` : `Attached ${added.length} files`);
  }, to);
}

/** Removes the metadata first, then the stored file: a failed storage delete leaves an orphan file, never a dead link. */
export async function deleteAttachmentAction(entityId: string, docType: AttachmentDocType, docId: string, attachmentId: string, backTo: string) {
  const to = returnPath(entityId, backTo);
  await act(entityId, async () => {
    await requirePermission(PERMISSION[docType] ?? "books:write");
    const { table, row } = await loadRecord(entityId, docType, docId);
    const items = (row as { attachments?: Attachment[] }).attachments ?? [];
    const item = items.find((a) => a.id === attachmentId);
    if (!item) throw new Error("Attachment not found");
    await db.update(table, docId, { attachments: items.filter((a) => a.id !== attachmentId) });
    if (item.path.startsWith(`${entityId}/`)) await deleteAttachment(item.path);
    if (entityId === CRM_SCOPE) revalidatePath("/clients", "layout"); else { revalidatePath(`/tax/${entityId}`, "layout"); revalidatePath(`/payroll/${entityId}`, "layout"); revalidatePath("/settings", "layout"); }
    return withFlash(to, `Removed ${item.name}`);
  }, to);
}
