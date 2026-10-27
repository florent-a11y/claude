import type { Attachment } from "@/lib/types";
import { Card } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { ATTACHMENT_ACCEPT, ATTACHMENT_HINT, fmtFileSize } from "@/lib/files";
import { fmtDateTime } from "@/lib/dates";
import { deleteAttachmentAction, uploadAttachmentAction } from "@/app/books/[entityId]/attachments/actions";

/**
 * Supporting documents (invoices, receipts, contracts) attached to a books record.
 * Contract used by every detail page; the implementation (upload form, list with download links, delete) lives
 * here and the storage logic in lib/files.ts. Server component: pass the current list and whether the user may edit.
 */
export type AttachmentDocType = "invoice" | "bill" | "journal" | "payment" | "asset";

export interface AttachmentsProps {
  entityId: string;
  docType: AttachmentDocType;
  docId: string;
  items: Attachment[];
  canWrite: boolean;
  /** Path to return to after an upload or delete (defaults to the current page). */
  backTo?: string;
  className?: string;
}

const SECTION: Record<AttachmentDocType, string> = { invoice: "sales", bill: "purchases", journal: "journal", asset: "assets", payment: "bank" };

/** The record's detail page; payments have no page of their own, so callers pass `backTo` (defaults to the bank tab). */
function defaultBackTo(entityId: string, docType: AttachmentDocType, docId: string): string {
  return docType === "payment" ? `/books/${entityId}/${SECTION.payment}` : `/books/${entityId}/${SECTION[docType]}/${docId}`;
}

export function attachmentUrl(entityId: string, a: Pick<Attachment, "path">): string {
  return `/api/books/${entityId}/files/${a.path}`;
}

export function Attachments({ entityId, docType, docId, items, canWrite, backTo, className }: AttachmentsProps) {
  const to = backTo ?? defaultBackTo(entityId, docType, docId);
  const list = items ?? [];
  return (
    <Card title={`Attachments${list.length ? ` (${list.length})` : ""}`} className={className}>
      {list.length === 0 ? (
        <p className="text-sm text-ink-500">No supporting documents yet.{canWrite ? " Attach the invoice, receipt or contract below." : ""}</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {list.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <a href={attachmentUrl(entityId, a)} target="_blank" rel="noopener" className="block truncate font-medium text-brand-700 hover:underline" title={a.name}>{a.name}</a>
                <p className="text-xs text-ink-500">{fmtFileSize(a.size)}{a.byName ? ` · ${a.byName}` : ""} · {fmtDateTime(a.uploadedAt)}</p>
              </div>
              {canWrite && (
                <ConfirmForm action={deleteAttachmentAction.bind(null, entityId, docType, docId, a.id, to)} message={`Delete ${a.name}? This cannot be undone.`} className="shrink-0 no-print">
                  <button type="submit" className="text-xs text-red-600 underline">delete</button>
                </ConfirmForm>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form action={uploadAttachmentAction.bind(null, entityId, docType, docId, to)} className={`space-y-2 no-print ${list.length ? "mt-3 border-t border-slate-100 pt-3" : "mt-3"}`}>
          <input type="file" name="files" multiple required accept={ATTACHMENT_ACCEPT} className="input" aria-label="Files to attach" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-500">{ATTACHMENT_HINT}</p>
            <SubmitButton className="btn-secondary" pendingText="Uploading…">Upload</SubmitButton>
          </div>
        </form>
      )}
    </Card>
  );
}
