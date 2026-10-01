import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceEmailDraft } from "../lib/invoice-email";
import { renderInvoicePdf } from "../lib/invoice-pdf";
import { mailtoLink, textToHtml } from "../lib/email";
import type { Entity, Invoice } from "../lib/types";

const entity: Entity = {
  id: "e1", name: "ILA Global Consulting", legalName: "PT ILA GLOBAL CONSULTING", type: "pt_pma", country: "ID", isOwn: true, baseCurrency: "IDR", fiscalYearStartMonth: 1,
  tax: { regime: "normal_22", pkp: false, ppnRate: 0.11, lkpm: true, payroll: true }, status: "active", createdAt: "2026-01-01T00:00:00Z", address: "Jl. Raya Semat No.17B, Tibubeneng", city: "Badung",
};
const invoice: Invoice = {
  id: "i1", entityId: "e1", number: "INV-2026-0042", customer: { type: "contact", id: "c1", name: "Camille Durand", email: "camille@example.com" },
  date: "2026-10-01", dueDate: "2026-10-06", currency: "IDR", fxRate: 1,
  lines: [{ id: "l1", description: "Monthly tax declaration", qty: 1, unitPrice: 1_500_000, amount: 1_500_000, accountId: "a1", taxCode: "out_of_scope" }, { id: "l2", description: "Bookkeeping", qty: 1, unitPrice: 1_000_000, amount: 1_000_000, accountId: "a1", taxCode: "out_of_scope" }],
  subtotal: 2_500_000, discount: 0, ppnAmount: 0, total: 2_500_000, amountPaid: 0, status: "sent", createdAt: "2026-10-01T00:00:00Z",
};

test("invoice email follows the ILA wording", () => {
  const d = invoiceEmailDraft(invoice, entity, { greetingName: "Camille", paymentInstructions: "Bank OCBC 123456 (IDR)" });
  assert.equal(d.to, "camille@example.com");
  assert.equal(d.subject, "Invoice INV-2026-0042 from PT ILA GLOBAL CONSULTING");
  assert.equal(d.filename, "INV-2026-0042.pdf");
  assert.match(d.text, /^Dear Camille,\n\nPlease find attached invoice INV-2026-0042 for Monthly tax declaration, Bookkeeping, for IDR 2,500,000\.\n\nPayment is due by 06 Oct 2026\. Please let us know if you have any questions\.\n\nBank OCBC 123456 \(IDR\)\n\nKind regards,\nPT ILA GLOBAL CONSULTING$/);
});

test("mailto link and html conversion are well-formed", () => {
  const link = mailtoLink("a@b.com", "Invoice 1", "Dear A,\n\nHello");
  assert.ok(link.startsWith("mailto:a%40b.com?subject=Invoice%201&body=Dear%20A%2C%0A%0AHello"));
  assert.equal(textToHtml("Dear <A>,\n\nLine1\nLine2"), '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#15202b"><p style="margin:0 0 12px">Dear &lt;A&gt;,</p><p style="margin:0 0 12px">Line1<br>Line2</p></div>');
});

test("invoice PDF renders", async () => {
  const pdf = await renderInvoicePdf(invoice, entity, { paymentInstructions: "Bank OCBC 123456 (IDR)" });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 2000, `pdf too small: ${pdf.length}`);
  const raw = pdf.toString("latin1");
  assert.ok(raw.includes("/Title"), "has a document title");
  assert.equal((raw.match(/\/Type \/Page[^s]/g) ?? []).length, 1, "renders on a single page");
});
