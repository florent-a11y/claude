import PDFDocument from "pdfkit";
import { fmtDate } from "./dates";
import { fmtMoney } from "./money";
import { COMPANY } from "./catalogue";
import type { Entity, Invoice } from "./types";

/**
 * Renders an invoice as an A4 PDF (pdfkit, standard Helvetica). Used for the "Send to client" email attachment and
 * the Download PDF button. Layout mirrors the printable page: letterhead, invoice block, bill-to, lines, totals,
 * payment instructions, notes, footer.
 */
export interface InvoicePdfOptions { paymentInstructions?: string }

export function renderInvoicePdf(invoice: Invoice, entity: Entity, opts: InvoicePdfOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Invoice ${invoice.number}`, Author: entity.legalName || entity.name } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const navy = "#0f3b5e", gold = "#c8912a", ink = "#15202b", grey = "#65727f";
    const left = 50, right = 545, width = right - left;
    const ccy = invoice.currency;
    const money = (n: number) => fmtMoney(n, ccy);

    // Letterhead
    doc.fillColor(navy).font("Helvetica-Bold").fontSize(16).text(entity.legalName || entity.name, left, 50, { width: 330 });
    if (entity.isOwn) doc.fillColor(gold).font("Helvetica").fontSize(8).text(COMPANY.tagline.toUpperCase(), { width: 330 });
    doc.fillColor(grey).font("Helvetica").fontSize(9);
    const addr = [entity.address, entity.city, entity.npwp ? `NPWP ${entity.npwp}` : undefined].filter(Boolean).join("\n");
    if (addr) doc.text(addr, { width: 330 });

    // Invoice block (right)
    doc.fillColor(navy).font("Helvetica-Bold").fontSize(22).text("INVOICE", 380, 50, { width: 165, align: "right" });
    doc.fillColor(ink).font("Helvetica").fontSize(10);
    const meta: Array<[string, string]> = [["Number", invoice.number], ["Date", fmtDate(invoice.date)], ["Due date", fmtDate(invoice.dueDate)]];
    if (invoice.fakturNumber) meta.push(["e-Faktur", invoice.fakturNumber]);
    let y = 82;
    for (const [k, v] of meta) {
      doc.fillColor(grey).text(k, 380, y, { width: 70, align: "right" });
      doc.fillColor(ink).font("Helvetica-Bold").text(v, 455, y, { width: 90, align: "right" });
      doc.font("Helvetica");
      y += 14;
    }

    // Bill to
    y = Math.max(y, doc.y) + 24;
    doc.fillColor(gold).font("Helvetica-Bold").fontSize(8).text("BILL TO", left, y);
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(11).text(invoice.customer.name, left, y + 12, { width: 300 });
    doc.font("Helvetica").fontSize(9).fillColor(grey);
    const cust = [invoice.customer.address, invoice.customer.email, invoice.customer.npwp ? `NPWP ${invoice.customer.npwp}` : undefined].filter(Boolean).join("\n");
    if (cust) doc.text(cust, { width: 300 });
    y = doc.y + 20;

    // Lines table
    const col = { desc: left, qty: 345, unit: 395, amount: 470 };
    const w = { desc: 290, qty: 45, unit: 70, amount: 75 };
    const header = () => {
      doc.rect(left, y, width, 18).fill("#eef3f8");
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(8);
      doc.text("DESCRIPTION", col.desc + 6, y + 5, { width: w.desc });
      doc.text("QTY", col.qty, y + 5, { width: w.qty, align: "right" });
      doc.text("UNIT PRICE", col.unit, y + 5, { width: w.unit, align: "right" });
      doc.text("AMOUNT", col.amount, y + 5, { width: w.amount, align: "right" });
      y += 24;
    };
    header();
    doc.font("Helvetica").fontSize(9).fillColor(ink);
    for (const l of invoice.lines) {
      const h = Math.max(12, doc.heightOfString(l.description, { width: w.desc - 6 }));
      if (y + h > 740) { doc.addPage(); y = 50; header(); doc.font("Helvetica").fontSize(9).fillColor(ink); }
      doc.text(l.description, col.desc + 6, y, { width: w.desc - 6 });
      doc.text(String(l.qty), col.qty, y, { width: w.qty, align: "right" });
      doc.text(money(l.unitPrice), col.unit, y, { width: w.unit, align: "right" });
      doc.text(money(l.amount), col.amount, y, { width: w.amount, align: "right" });
      y += h + 6;
      doc.moveTo(left, y - 2).lineTo(right, y - 2).lineWidth(0.5).strokeColor("#e2e8f0").stroke();
    }

    // Totals
    y += 6;
    const totals: Array<[string, string, boolean]> = [["Subtotal", money(invoice.subtotal), false]];
    if (invoice.discount > 0) totals.push(["Discount", `-${money(invoice.discount)}`, false]);
    if (invoice.ppnAmount > 0) totals.push([`PPN`, money(invoice.ppnAmount), false]);
    totals.push(["Total", money(invoice.total), true]);
    if (invoice.amountPaid > 0) { totals.push(["Paid", money(invoice.amountPaid), false]); totals.push(["Balance due", money(invoice.total - invoice.amountPaid), true]); }
    for (const [k, v, bold] of totals) {
      if (y > 760) { doc.addPage(); y = 50; }
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9).fillColor(bold ? navy : grey).text(k, 345, y, { width: 120, align: "right" });
      doc.fillColor(ink).text(v, col.amount, y, { width: w.amount, align: "right" });
      y += bold ? 18 : 14;
    }
    if (invoice.currency !== "IDR" && invoice.fxRate > 1) {
      doc.font("Helvetica").fontSize(8).fillColor(grey).text(`Rate: 1 ${ccy} = ${fmtMoney(invoice.fxRate, "IDR")}`, 345, y, { width: 200, align: "right" });
      y += 14;
    }

    // Payment instructions and notes
    y += 10;
    const pay = (opts.paymentInstructions ?? invoice.paymentInstructions ?? "").trim();
    if (pay) {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.fillColor(gold).font("Helvetica-Bold").fontSize(8).text("PAYMENT", left, y);
      doc.fillColor(ink).font("Helvetica").fontSize(9).text(pay, left, y + 12, { width: 300 });
      y = doc.y + 12;
    }
    if (invoice.notes) {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.fillColor(gold).font("Helvetica-Bold").fontSize(8).text("NOTES", left, y);
      doc.fillColor(ink).font("Helvetica").fontSize(9).text(invoice.notes, left, y + 12, { width: width });
      y = doc.y + 12;
    }

    // Footer
    const footer = entity.isOwn ? `${COMPANY.name} · ${COMPANY.baliOffice} · ${COMPANY.email} · ${COMPANY.phone}` : [entity.legalName || entity.name, entity.address].filter(Boolean).join(" · ");
    doc.fillColor(grey).font("Helvetica").fontSize(7.5);
    // Anchor the footer above the bottom margin; pdfkit would otherwise add a page when the text crosses it.
    const footerHeight = doc.heightOfString(footer, { width, align: "center" });
    doc.text(footer, left, doc.page.height - doc.page.margins.bottom - footerHeight - 2, { width, align: "center", lineBreak: true });
    doc.end();
  });
}
