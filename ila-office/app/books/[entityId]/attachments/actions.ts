"use server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { checkAttachment, deleteAttachment, putAttachment } from "@/lib/files";
import type { Attachment } from "@/lib/types";
import type { AttachmentDocType } from "@/components/Attachments";
import { act, base, withFlash } from "../shared";

/**
 * Upload / delete supporting documents on a books record. The files live in lib/files.ts storage; the record keeps
 * the metadata in its `attachments` array. Every action checks the record belongs to the entity and that the user may
 * write the books, then redirects back to the page it came from with a flash message (or `?error=`).
 */

type AttachmentTable = "invoices" | "bills" | "journal_entries" | "payments" | "fixed_assets";
const TABLES: Record<AttachmentDocType, AttachmentTable> = { invoice: "invoices", bill: "bills", journal: "journal_entries", payment: "payments", asset: "fixed_assets" };

function tableFor(docType: string): AttachmentTable {
  const table = TABLES[docType as AttachmentDocType];
  if (!table) throw new Error("Unknown document type");
  return table;
}

async function loadRecord(entityId: string, docType: string, docId: string) {
  const table = tableFor(docType);
  const row = await db.get(table, docId);
  if (!row || row.entityId !== entityId) throw new Error("Document not found");
  return { table, row };
}

/** Only redirect within the app (the target is a bound argument, but keep the redirect closed anyway). */
function returnPath(entityId: string, backTo: string | undefined): string {
  return backTo && backTo.startsWith("/") && !backTo.startsWith("//") ? backTo : base(entityId);
}

/** Form field `files` (one or several). Validates every file before storing any, so a refused file leaves nothing half done. */
export async function uploadAttachmentAction(entityId: string, docType: AttachmentDocType, docId: string, backTo: string, fd: FormData) {
  const to = returnPath(entityId, backTo);
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
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
    return withFlash(to, added.length === 1 ? `Attached ${added[0].name}` : `Attached ${added.length} files`);
  }, to);
}

/** Removes the metadata first, then the stored file: a failed storage delete leaves an orphan file, never a dead link. */
export async function deleteAttachmentAction(entityId: string, docType: AttachmentDocType, docId: string, attachmentId: string, backTo: string) {
  const to = returnPath(entityId, backTo);
  await act(entityId, async () => {
    await requirePermission("books:write");
    const { table, row } = await loadRecord(entityId, docType, docId);
    const items = row.attachments ?? [];
    const item = items.find((a) => a.id === attachmentId);
    if (!item) throw new Error("Attachment not found");
    await db.update(table, docId, { attachments: items.filter((a) => a.id !== attachmentId) });
    if (item.path.startsWith(`${entityId}/`)) await deleteAttachment(item.path);
    return withFlash(to, `Removed ${item.name}`);
  }, to);
}
