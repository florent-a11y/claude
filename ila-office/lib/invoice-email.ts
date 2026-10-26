import { fmtDate } from "./dates";
import { decimalsFor, fmtNumber } from "./money";
import type { Entity, Invoice } from "./types";

/**
 * The standard ILA invoice email (the wording used when sending from QuickBooks):
 *   Dear <first name>, Please find attached invoice <ref> for <description>, for IDR <amount>.
 *   Payment is due by <due date>. Please let us know if you have any questions. Kind regards, PT ILA GLOBAL CONSULTING
 */
export interface InvoiceEmailDraft { to: string; subject: string; text: string; filename: string }

export function invoiceDescription(invoice: Invoice): string {
  const descs = invoice.lines.map((l) => l.description.trim()).filter(Boolean);
  if (descs.length <= 3) return descs.join(", ");
  return `${descs.slice(0, 3).join(", ")} and ${descs.length - 3} more item${descs.length - 3 > 1 ? "s" : ""}`;
}

export function invoiceAmountText(invoice: Invoice): string {
  return `${invoice.currency} ${fmtNumber(invoice.total, decimalsFor(invoice.currency))}`;
}

export function invoiceEmailDraft(invoice: Invoice, entity: Entity, opts: { greetingName?: string; to?: string; paymentInstructions?: string } = {}): InvoiceEmailDraft {
  const name = (opts.greetingName ?? invoice.customer.name).trim();
  const signer = entity.legalName || entity.name;
  const parts = [
    `Dear ${name},`,
    `Please find attached invoice ${invoice.number} for ${invoiceDescription(invoice)}, for ${invoiceAmountText(invoice)}.`,
    `Payment is due by ${fmtDate(invoice.dueDate)}. Please let us know if you have any questions.`,
  ];
  const pay = (opts.paymentInstructions ?? invoice.paymentInstructions ?? "").trim();
  if (pay) parts.push(pay);
  parts.push(`Kind regards,\n${signer}`);
  return { to: opts.to ?? invoice.customer.email ?? "", subject: `Invoice ${invoice.number} from ${signer}`, text: parts.join("\n\n"), filename: `${invoice.number}.pdf` };
}
