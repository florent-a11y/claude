import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBupotPdf, rupiah, tanggal, tarif } from "../lib/tax/bupot-pdf";
import { extractPdfPages } from "../lib/pdf-text";
import type { Entity, WithholdingSlip } from "../lib/types";

// Synthetic withholding agent and slips: every name, number and amount here is invented.
const entity: Entity = {
  id: "ent-1", name: "Contoh Nusantara", legalName: "PT CONTOH NUSANTARA SEJAHTERA", type: "pt_pmdn", country: "ID", isOwn: false,
  npwp: "0123456789012000", baseCurrency: "IDR", fiscalYearStartMonth: 1,
  tax: { regime: "normal_22", pkp: true, ppnRate: 0.11, lkpm: false, payroll: true, signerName: "Rina Contoh Wijaya" },
  status: "active", createdAt: "2026-01-01T00:00:00.000Z",
};

const bppu: WithholdingSlip = {
  id: "slip-1", entityId: "ent-1", type: "pph23", number: "BP-2026-0007", period: "2026-02", date: "2026-02-23",
  counterparty: { name: "CV MITRA KONSULTAN FIKTIF", npwp: "0987654321098000" },
  objectCode: "24-104-04", objectLabel: "Jasa konsultan (consulting services)",
  baseAmount: 15_750_000, rate: 0.02, taxAmount: 315_000,
  document: { type: "invoice", number: "INV-FIKTIF-0042", date: "2026-02-20" },
  status: "issued", createdAt: "2026-02-23T00:00:00.000Z",
};

const bp21: WithholdingSlip = {
  id: "slip-2", entityId: "ent-1", type: "pph21", number: "BP-2026-0008", period: "2026-03", date: "2026-03-05",
  counterparty: { name: "Budi Contoh Santoso", nik: "3171234567890001" },
  objectCode: "21-100-07", objectLabel: "Imbalan kepada tenaga ahli (professional fees: lawyer, accountant, architect, doctor, consultant, notary, appraiser, actuary)",
  grossAmount: 40_000_000, dppPercent: 50, baseAmount: 20_000_000, rate: 0.05, taxAmount: 1_000_000,
  billId: "bill-9", status: "reported", coretaxNumber: "0000000012345678", createdAt: "2026-03-05T00:00:00.000Z",
};

async function pageText(pdf: Buffer): Promise<{ pages: number; text: string }> {
  const pages = await extractPdfPages(pdf);
  return { pages: pages.length, text: pages.map((p) => p.lines.map((l) => l.text).join("\n")).join("\n") };
}

test("formatting: rupiah with dots, plain percentages, Indonesian long dates", () => {
  assert.equal(rupiah(15_750_000), "15.750.000");
  assert.equal(rupiah(0), "0");
  assert.equal(rupiah(999), "999");
  assert.equal(rupiah(-2_500_000), "-2.500.000");
  assert.equal(tarif(0.02), "2");
  assert.equal(tarif(0.05), "5");
  assert.equal(tarif(0.005), "0,5");
  assert.equal(tarif(0.175), "17,5");
  assert.equal(tanggal("2026-02-23"), "23 Februari 2026");
  assert.equal(tanggal("2026-11-05"), "05 November 2026");
  assert.equal(tanggal(undefined), "");
});

test("renderBupotPdf: a BPPU slip (PPh 23) prints the unified form on one page", async () => {
  const pdf = await renderBupotPdf({ slip: bppu, entity });
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  const { pages, text } = await pageText(pdf);
  assert.equal(pages, 1);
  assert.match(text, /BPPU/);
  assert.match(text, /BUKTI PEMOTONGAN DAN\/ATAU PEMUNGUTAN PPh/);
  assert.match(text, /DIREKTORAT JENDERAL PAJAK/);
  assert.match(text, /BP-2026-0007/);
  assert.match(text, /02-2026/);
  assert.match(text, /TIDAK FINAL/);
  assert.match(text, /NORMAL/);
  assert.match(text, /0987654321098000/);
  assert.match(text, /CV MITRA KONSULTAN FIKTIF/);
  assert.match(text, /0987654321098000000000 - CV MITRA KONSULTAN FIKTIF/);
  assert.match(text, /Jenis Fasilitas : Tanpa Fasilitas/);
  assert.match(text, /Jenis PPh : Pasal 23/);
  assert.match(text, /24-104-04/);
  assert.match(text, /Jasa konsultan/);
  assert.match(text, /15\.750\.000/);
  assert.match(text, /315\.000/);
  assert.match(text, /Jenis Dokumen : Invoice/);
  assert.match(text, /Tanggal : 20 Februari 2026/);
  assert.match(text, /Nomor Dokumen : INV-FIKTIF-0042/);
  assert.match(text, /Nomor SP2D :/);
  assert.match(text, /0123456789012000/);
  assert.match(text, /0123456789012000000000 - PT CONTOH NUSANTARA SEJAHTERA/);
  assert.match(text, /23 Februari 2026/);
  assert.match(text, /Rina Contoh Wijaya/);
  assert.match(text, /Pemungutan PPh Unifikasi\s+ini telah saya isi dengan benar/); // the statement wraps inside its column
  assert.match(text, /belum dilaporkan di Coretax/);
  assert.match(text, /Pemberitahuan: Bukti Potong ini dibuat dengan ILA Office/);
});

test("renderBupotPdf: a BP21 slip (PPh 21, deemed 50% DPP) prints the BP21 form with gross, DPP % and the bill number", async () => {
  const pdf = await renderBupotPdf({ slip: bp21, entity, billNumber: "VINV-FIKTIF-2026-03" });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  const { pages, text } = await pageText(pdf);
  assert.equal(pages, 1);
  assert.match(text, /BP21/);
  assert.match(text, /PASAL 21 YANG BERSIFAT FINAL/);
  assert.match(text, /NOMOR BUKTI PEMOTONGAN/);
  assert.match(text, /0000000012345678/); // the Coretax number replaces the internal one once filed
  assert.doesNotMatch(text, /BP-2026-0008/);
  assert.match(text, /03-2026/);
  assert.match(text, /3171234567890001/);
  assert.match(text, /Budi Contoh Santoso/);
  assert.match(text, /Jenis Fasilitas : Tanpa Fasilitas/);
  assert.doesNotMatch(text, /Jenis PPh/);
  assert.match(text, /KODE OBJEK PAJAK OBJEK PAJAK PENGHASILAN DPP \(%\) TARIF \(%\) PPh DIPOTONG \(Rp\)/); // "BRUTO (Rp)" wraps onto the header's second line
  assert.match(text, /BRUTO \(Rp\)/);
  assert.match(text, /21-100-07/);
  assert.match(text, /Imbalan kepada tenaga ahli/);
  assert.match(text, /40\.000\.000/);
  assert.match(text, /1\.000\.000/);
  assert.match(text, /Dokumen Referensi/);
  assert.match(text, /Tanggal Dokumen : 05 Maret 2026/);
  assert.match(text, /Nomor Dokumen : VINV-FIKTIF-2026-03/);
  assert.doesNotMatch(text, /SP2D/);
  assert.match(text, /Rina Contoh Wijaya/);
  assert.match(text, /Ditandatangani secara elektronik/);
  assert.doesNotMatch(text, /Unifikasi ini telah saya isi/);
});

test("renderBupotPdf: characters outside WinAnsi are replaced, a missing document prints dashes, and no second page is started", async () => {
  const slip: WithholdingSlip = { ...bppu, id: "slip-3", counterparty: { name: "Nguyễn Fiktif Trần – Studio ★", nik: "3275012345670002" }, document: undefined, correction: true, objectLabel: "Jasa lain PMK 141/2015 (other services: accounting, legal, cleaning, catering, IT…) ".repeat(3) };
  const pdf = await renderBupotPdf({ slip, entity: { ...entity, tax: { ...entity.tax, signerName: undefined } } });
  const { pages, text } = await pageText(pdf);
  assert.equal(pages, 1);
  assert.match(text, /Nguy-n Fiktif Tr-n – Studio -/);
  assert.match(text, /PEMBETULAN/);
  assert.match(text, /Jenis Dokumen : -/);
  assert.match(text, /Nomor Dokumen : -/);
  assert.match(text, /NAMA PENANDATANGAN : -/);
});
