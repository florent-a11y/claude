import type { Attachment } from "@/lib/types";

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

// Placeholder until the attachments feature lands; renders nothing so pages can already include it.
export function Attachments(_props: AttachmentsProps) {
  return null;
}
