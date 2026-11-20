import { test } from "node:test";
import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import { extractPdfPages, PdfPasswordError } from "../lib/pdf-text";

// A locked PDF (banks often protect the e-statements they e-mail) opens with its password and says so without it.
// The file is drawn here with invented text.

function lockedPdf(userPassword: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", userPassword, ownerPassword: "owner-demo", pdfVersion: "1.7" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(10).text("REKENING KORAN CONTOH", 40, 40);
    doc.text("02/10/2026 SETORAN CONTOH 1,250,000.50", 40, 60);
    doc.end();
  });
}

test("a password-protected PDF: missing password, wrong password, right password", async () => {
  const pdf = await lockedPdf("demo-1234");
  await assert.rejects(() => extractPdfPages(pdf), (e: unknown) => e instanceof PdfPasswordError && e.wrong === false && /protected by a password/.test(e.message));
  await assert.rejects(() => extractPdfPages(pdf, { password: "not-it" }), (e: unknown) => e instanceof PdfPasswordError && e.wrong === true && /does not open/.test(e.message));
  const pages = await extractPdfPages(pdf, { password: "demo-1234" });
  assert.equal(pages.length, 1);
  const text = pages[0].lines.map((l) => l.tokens.map((t) => t.s).join(" ")).join("\n");
  assert.match(text, /REKENING KORAN CONTOH/);
  assert.match(text, /1,250,000\.50/);
});
