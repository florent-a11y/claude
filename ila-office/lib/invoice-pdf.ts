import PDFDocument from "pdfkit";
import { invoiceDocument, logoDrawSize, type InvoiceDoc } from "./invoice-settings";
import type { BankAccount, Entity, Invoice } from "./types";

/**
 * Renders an invoice as an A4 PDF (pdfkit, standard Helvetica). Used for the "Send to client" email attachment and
 * the Download PDF button. It lays out the description of lib/invoice-settings.ts (`invoiceDocument`), the same one
 * the printable page shows: letterhead with the logo, invoice block, bill-to, lines, totals, settlement notes, notes,
 * signature, footer, in the entity's colours.
 */
export interface InvoicePdfOptions {
  /** Settlement notes to print when the invoice carries none (else the entity's settings decide). */
  paymentInstructions?: string;
  /** The entity's active bank accounts, for the automatic settlement notes. */
  banks?: ReadonlyArray<Pick<BankAccount, "name" | "currency"> & Partial<Pick<BankAccount, "bankName" | "accountNumber">>>;
  /** The logo file (PNG or JPEG) named by the entity's invoice settings. */
  logo?: Buffer;
}

export function renderInvoicePdf(invoice: Invoice, entity: Entity, opts: InvoicePdfOptions = {}): Promise<Buffer> {
  const source = invoice.paymentInstructions === undefined && opts.paymentInstructions !== undefined ? { ...invoice, paymentInstructions: opts.paymentInstructions } : invoice;
  return renderInvoiceDocPdf(invoiceDocument({ invoice: source, entity, banks: opts.banks }), { logo: opts.logo, author: entity.legalName || entity.name });
}

/** pdfkit's standard fonts are WinAnsi: the minus sign and the non-breaking space of lib/money.ts, and a carriage return, have no glyph there. */
const pdfText = (s: string) => s.replace(/\u2212/g, "-").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n");

export function renderInvoiceDocPdf(d: InvoiceDoc, opts: { logo?: Buffer; author?: string } = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `${d.title} ${d.number}`, Author: opts.author ?? d.company.name } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const c = d.colors;
    const left = 50, right = 545, width = right - left, top = 50, bottom = 760;
    const T = pdfText;

    // Letterhead: logo, company name, details.
    let y = top;
    if (d.logo && opts.logo) {
      const size = logoDrawSize(d.logo);
      try {
        // Without stored dimensions the box is the limit and pdfkit keeps the proportions.
        if (d.logo.width && d.logo.height) doc.image(opts.logo, left, y, { width: size.width, height: size.height });
        else doc.image(opts.logo, left, y, { fit: [d.logo.boxWidth, d.logo.boxHeight] });
        y += size.height + 8;
      } catch { /* an unreadable logo never blocks the invoice */ }
    }
    doc.x = left; doc.y = y;
    if (d.company.showName) doc.fillColor(c.mainText).font("Helvetica-Bold").fontSize(16).text(T(d.company.name), left, y, { width: 320 });
    if (d.company.tagline) doc.fillColor(c.accentText).font("Helvetica").fontSize(8).text(T(d.company.tagline.toUpperCase()), left, doc.y, { width: 320 });
    doc.fillColor(c.grey).font("Helvetica").fontSize(9);
    if (d.company.details.length) doc.text(T(d.company.details.join("\n")), left, doc.y, { width: 320 });
    const headLeftEnd = doc.y;

    // Invoice block (right).
    doc.fillColor(c.mainText).font("Helvetica-Bold").fontSize(22).text(T(d.title), 330, top, { width: 215, align: "right" });
    doc.fillColor(c.ink).font("Helvetica-Bold").fontSize(11).text(T(d.number), 330, doc.y + 1, { width: 215, align: "right" });
    if (d.stamp) doc.fillColor(d.stamp === "VOID" || d.stamp === "BATAL" ? "#b91c1c" : c.grey).font("Helvetica-Bold").fontSize(9).text(T(d.stamp), 330, doc.y + 1, { width: 215, align: "right" });
    const headRightEnd = doc.y;

    y = Math.max(headLeftEnd, headRightEnd) + 12;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1.2).strokeColor(c.rule).stroke();
    y += 16;

    // Bill to (left) and dates (right).
    const blockTop = y;
    doc.fillColor(c.accentText).font("Helvetica-Bold").fontSize(8).text(T(d.billTo.label.toUpperCase()), left, y, { characterSpacing: 0.4 });
    doc.fillColor(c.ink).font("Helvetica-Bold").fontSize(11).text(T(d.billTo.name), left, y + 12, { width: 290 });
    doc.font("Helvetica").fontSize(9).fillColor(c.grey);
    if (d.billTo.lines.length) doc.text(T(d.billTo.lines.join("\n")), left, doc.y, { width: 290 });
    const billEnd = doc.y;
    let my = blockTop;
    doc.fontSize(9.5);
    for (const m of d.meta) {
      doc.fillColor(c.grey).font("Helvetica").text(T(m.label), 350, my, { width: 95, align: "right" });
      doc.fillColor(c.ink).font(m.strong ? "Helvetica-Bold" : "Helvetica").text(T(m.value), 450, my, { width: 95, align: "right" });
      my += 14;
    }
    y = Math.max(billEnd, my) + 18;

    // Lines table.
    const col = d.showQty ? { desc: left, qty: 330, unit: 375, amount: 455 } : { desc: left, qty: 0, unit: 0, amount: 455 };
    const w = d.showQty ? { desc: 275, qty: 40, unit: 80, amount: 84 } : { desc: 395, qty: 0, unit: 0, amount: 84 };
    const header = () => {
      doc.rect(left, y, width, 18).fill(c.headerFill);
      doc.fillColor(c.headerText).font("Helvetica-Bold").fontSize(8);
      doc.text(T(d.columns.description.toUpperCase()), col.desc + 6, y + 5, { width: w.desc - 6 });
      if (d.showQty) {
        doc.text(T(d.columns.qty.toUpperCase()), col.qty, y + 5, { width: w.qty, align: "right" });
        doc.text(T(d.columns.unitPrice.toUpperCase()), col.unit, y + 5, { width: w.unit, align: "right" });
      }
      doc.text(T(d.columns.amount.toUpperCase()), col.amount, y + 5, { width: w.amount, align: "right" });
      y += 24;
    };
    header();
    doc.font("Helvetica").fontSize(9).fillColor(c.ink);
    for (const l of d.lines) {
      const h = Math.max(12, doc.heightOfString(T(l.description), { width: w.desc - 6 }));
      if (y + h > bottom - 20) { doc.addPage(); y = top; header(); doc.font("Helvetica").fontSize(9).fillColor(c.ink); }
      doc.text(T(l.description), col.desc + 6, y, { width: w.desc - 6 });
      if (d.showQty) {
        doc.text(T(l.qty), col.qty, y, { width: w.qty, align: "right" });
        doc.text(T(l.unitPrice), col.unit, y, { width: w.unit, align: "right" });
      }
      doc.text(T(l.amount), col.amount, y, { width: w.amount, align: "right" });
      y += h + 6;
      doc.moveTo(left, y - 2).lineTo(right, y - 2).lineWidth(0.5).strokeColor("#e2e8f0").stroke();
    }

    // Totals.
    y += 6;
    const labelX = 300, labelW = 150, valueX = 455, valueW = 84;
    for (const t of d.totals) {
      if (y > bottom) { doc.addPage(); y = top; }
      const total = t.kind === "total", muted = t.kind === "muted";
      if (total) { doc.moveTo(labelX + 40, y - 2).lineTo(right, y - 2).lineWidth(1).strokeColor(c.main).stroke(); y += 3; }
      const size = total ? 11 : muted ? 8 : 9;
      doc.font(total ? "Helvetica-Bold" : "Helvetica").fontSize(size);
      // A note in place of an amount ("Not applicable (non-PKP)") may be wider than the amount column.
      const wide = doc.widthOfString(T(t.value)) > valueW;
      const vX = wide ? 380 : valueX, vW = wide ? 159 : valueW, lW = wide ? 75 : labelW;
      doc.fillColor(total ? c.mainText : c.grey).text(T(t.label), labelX, y, { width: lW, align: "right" });
      const labelEnd = doc.y;
      doc.fillColor(muted ? c.grey : c.ink).text(T(t.value), vX, y, { width: vW, align: "right" });
      y = Math.max(labelEnd, doc.y) + (total ? 6 : 3);
    }
    if (d.totalsNote) {
      doc.font("Helvetica").fontSize(8).fillColor(c.grey).text(T(d.totalsNote), 300, y, { width: 239, align: "right" });
      y = doc.y + 4;
    }

    // Settlement notes and notes on the left, signature on the right.
    y += 12;
    const sig = d.signature;
    const blockWidth = sig ? 300 : width;
    const blocksHeight = d.blocks.reduce((s, b) => s + 12 + doc.font("Helvetica").fontSize(9).heightOfString(T(b.text), { width: blockWidth }) + 12, 0);
    const needed = Math.max(blocksHeight, sig ? 110 : 0);
    if (needed > 0) {
      // Keep the closing section together when it fits on a page of its own.
      if (y + needed > bottom && needed < bottom - top) { doc.addPage(); y = top; }
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.6).strokeColor(c.rule).stroke();
      y += 12;
      const sectionTop = y;
      for (const b of d.blocks) {
        if (y > bottom - 30) { doc.addPage(); y = top; }
        doc.fillColor(c.accentText).font("Helvetica-Bold").fontSize(8).text(T(b.label.toUpperCase()), left, y, { characterSpacing: 0.4 });
        doc.fillColor(c.ink).font("Helvetica").fontSize(9).text(T(b.text), left, y + 12, { width: blockWidth });
        y = doc.y + 12;
      }
      if (sig) {
        const sx = 385, sw = 160;
        let sy = sectionTop;
        doc.fillColor(c.accentText).font("Helvetica-Bold").fontSize(8).text(T(sig.label.toUpperCase()), sx, sy, { width: sw, align: "center", characterSpacing: 0.4 });
        doc.fillColor(c.grey).font("Helvetica").fontSize(8).text(T(sig.issuer), sx, doc.y + 1, { width: sw, align: "center" });
        sy = doc.y + 52;
        doc.moveTo(sx, sy).lineTo(sx + sw, sy).lineWidth(0.6).strokeColor(c.ink).stroke();
        if (sig.name) doc.fillColor(c.ink).font("Helvetica-Bold").fontSize(9).text(T(sig.name), sx, sy + 4, { width: sw, align: "center" });
        if (sig.title) doc.fillColor(c.grey).font("Helvetica").fontSize(8).text(T(sig.title), sx, sig.name ? doc.y + 1 : sy + 4, { width: sw, align: "center" });
        y = Math.max(y, doc.y + 12);
      }
    }

    // Footer.
    if (d.footer) {
      doc.fillColor(c.grey).font("Helvetica").fontSize(7.5);
      // Anchor the footer above the bottom margin; pdfkit would otherwise add a page when the text crosses it.
      const footerHeight = doc.heightOfString(T(d.footer), { width, align: "center" });
      const footerY = doc.page.height - doc.page.margins.bottom - footerHeight - 2;
      if (y > footerY - 4) doc.addPage();
      doc.text(T(d.footer), left, doc.page.height - doc.page.margins.bottom - footerHeight - 2, { width, align: "center", lineBreak: true });
    }
    doc.end();
  });
}
