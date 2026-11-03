import PDFDocument from "pdfkit";
import type { Entity, WithholdingSlip } from "../types";
import { BUPOT_TITLES, JENIS_PPH, bupotKind, documentLabel, facilityLabel, isFinal, nitkuOf, npwp16 } from "./withholding";

/**
 * Bukti potong as an A4 PDF in the layout of the Coretax forms (BPPU for the unified withholding taxes, BP21 for
 * PPh 21 paid to non-employees): the same structure as the printable slip page, header band, four grey header
 * cells, the blue section bars A/B/C with numbered rows, the B table, the document rows B.8–B.11, the C.6
 * statement, a QR placeholder and the footer note. pdfkit with the standard Helvetica, one page for normal inputs.
 */
export interface BupotPdfInput {
  slip: WithholdingSlip;
  entity: Entity;
  /** Number of the bill the slip was raised from (B.9 when the slip carries no document number of its own). */
  billNumber?: string;
}

const MARGIN = 36;
const NAVY = "#1D3F7A", YELLOW = "#FFD400", CELL = "#E2E8F0", WHITE = "#FFFFFF";
const INK = "#15202B", MUTED = "#475569", NOTE = "#65727F", RULE = "#CBD5E1", HAIR = "#E2E8F0";
const NO_W = 24, LABEL_W = 150, COLON_W = 8, PAD_X = 4, ROW_PAD = 2.5;
const BODY = 8.5;

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "2026-02-23" → "23 Februari 2026" (the long Indonesian form used on the form). */
export function tanggal(iso?: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")} ${MONTHS_ID[Math.min(11, Math.max(0, m - 1))]} ${y}`;
}

/** Rupiah on the form: dots as thousands separators, no decimals ("15.750.000"). Pure, no ICU dependency. */
export function rupiah(n: number): string {
  const v = Math.round(Math.abs(n));
  const s = String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return n < 0 ? `-${s}` : s;
}

/** Rate as a plain percentage: 0.02 → "2", 0.005 → "0,5", 0.175 → "17,5". */
export function tarif(rate: number): string {
  const v = Math.round(rate * 10000) / 100;
  return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "")).replace(".", ",");
}

/** Standard fonts only know WinAnsi; anything else would print as garbage, so it becomes "-". */
function safe(s: string): string {
  return s.replace(/[^\x20-\x7e\xa0-\xff\n–—‘’“”•…€™]/g, "-");
}

export function renderBupotPdf({ slip, entity, billNumber }: BupotPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const kind = bupotKind(slip.type);
    const bppu = kind === "BPPU";
    const doc = new PDFDocument({
      size: "A4", layout: "portrait", margin: MARGIN, bufferPages: true,
      info: { Title: `Bukti Potong ${slip.coretaxNumber ?? slip.number}`, Author: entity.legalName || entity.name, Creator: "ILA Office" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = MARGIN, right = doc.page.width - MARGIN, width = right - left;
    const pageBottom = doc.page.height - MARGIN;
    // Everything is positioned explicitly; pdfkit must never start a second page on its own while we draw.
    doc.page.margins.bottom = 0;
    let y = MARGIN;

    const regular = () => doc.font("Helvetica");
    const bold = () => doc.font("Helvetica-Bold");
    const heightOf = (text: string, w: number, size: number, font: "Helvetica" | "Helvetica-Bold" = "Helvetica") => {
      doc.font(font).fontSize(size);
      return text ? doc.heightOfString(text, { width: w }) : 0;
    };
    const rule = (atY: number, colour = HAIR, lw = 0.4) => { doc.moveTo(left, atY).lineTo(right, atY).lineWidth(lw).strokeColor(colour).stroke(); };

    // ---------- Data ----------
    const nomor = slip.coretaxNumber ?? slip.number;
    const masa = `${slip.period.slice(5, 7)}-${slip.period.slice(0, 4)}`;
    const recipientId = npwp16(slip.counterparty.npwp ?? slip.counterparty.nik) || "-";
    const recipientNitku = nitkuOf(slip.counterparty.npwp ?? slip.counterparty.nik, slip.counterparty.nitku);
    const agentId = npwp16(entity.npwp) || "-";
    const agentNitku = nitkuOf(entity.npwp, entity.nitku);
    const docNumber = slip.document?.number ?? billNumber ?? "-";
    const docDate = slip.document?.date ?? slip.date;
    const gross = slip.grossAmount ?? slip.baseAmount;
    const dppPct = slip.dppPercent ?? 100;

    // ---------- Header band ----------
    {
      // pdfkit wraps whenever a width is given, so the left column is sized to its widest line.
      const leftW = Math.max(110, bold().fontSize(8).widthOfString("DIREKTORAT JENDERAL PAJAK") + 6), boxW = 110, boxH = 40, gap = 10;
      const centreX = left + leftW + gap, centreW = width - leftW - boxW - gap * 2;
      regular().fontSize(8).fillColor(INK);
      doc.text("KEMENTERIAN KEUANGAN", left, y, { width: leftW, lineBreak: false });
      doc.text("REPUBLIK INDONESIA", left, doc.y, { width: leftW, lineBreak: false });
      bold().text("DIREKTORAT JENDERAL PAJAK", left, doc.y, { width: leftW, lineBreak: false });
      const leftBottom = doc.y;
      const titles = BUPOT_TITLES[kind].map(safe).join("\n");
      bold().fontSize(10).fillColor(INK).text(titles, centreX, y, { width: centreW, align: "center" });
      const centreBottom = doc.y;
      doc.rect(right - boxW, y, boxW, boxH).fill(YELLOW);
      bold().fontSize(20).fillColor(INK);
      const codeH = doc.currentLineHeight(true);
      doc.text(kind, right - boxW, y + (boxH - codeH) / 2 + 1, { width: boxW, align: "center", lineBreak: false, characterSpacing: 1 });
      y = Math.max(leftBottom, centreBottom, y + boxH) + 8;
    }

    // ---------- Four grey header cells ----------
    {
      const gap = 4, cellW = (width - gap * 3) / 4, pad = 3, inner = cellW - pad * 2;
      const cells: Array<[string, string]> = [
        [bppu ? "NOMOR" : "NOMOR BUKTI PEMOTONGAN", nomor],
        ["MASA PAJAK", masa],
        [bppu ? "SIFAT PEMOTONGAN DAN/ATAU PEMUNGUTAN PPh" : "SIFAT PEMOTONGAN", isFinal(slip) ? "FINAL" : "TIDAK FINAL"],
        [bppu ? "STATUS BUKTI PEMOTONGAN / PEMUNGUTAN" : "STATUS BUKTI PEMOTONGAN", slip.correction ? "PEMBETULAN" : "NORMAL"],
      ];
      bold().fontSize(7);
      const labelH = Math.max(doc.currentLineHeight(true) * 2, ...cells.map(([l]) => doc.heightOfString(safe(l), { width: inner }))); // at least two lines so the row lines up
      regular().fontSize(9);
      const valueLine = doc.currentLineHeight(true);
      const valueH = valueLine + 4;
      const cellH = pad + labelH + 2 + valueH + pad;
      cells.forEach(([label, value], i) => {
        const x = left + i * (cellW + gap);
        doc.rect(x, y, cellW, cellH).fill(CELL);
        bold().fontSize(7).fillColor(INK).text(safe(label), x + pad, y + pad, { width: inner, align: "center" });
        const vy = y + pad + labelH + 2;
        doc.rect(x + pad, vy, inner, valueH).fill(WHITE);
        regular().fontSize(9).fillColor(INK).text(safe(value), x + pad, vy + 2, { width: inner, align: "center", lineBreak: false });
      });
      y += cellH + 6;
    }

    // ---------- Building blocks ----------
    const bar = (text: string) => {
      const h = 13;
      doc.rect(left, y, width, h).fill(NAVY);
      bold().fontSize(8).fillColor(WHITE).text(safe(text).toUpperCase(), left + PAD_X, y + 2.6, { width: width - PAD_X * 2, lineBreak: false });
      y += h;
    };
    const noX = left + PAD_X, labelX = noX + NO_W, colonX = labelX + LABEL_W, valueX = colonX + COLON_W, valueW = right - PAD_X - valueX;
    /** "A.1  LABEL : value" with the value wrapping in its column; `value` as an array prints as paragraphs (C.6). */
    const row = (no: string, label: string, value: string | string[], valueSize = BODY) => {
      const paragraphs = (Array.isArray(value) ? value : [value]).map(safe);
      const labelH = heightOf(safe(label), LABEL_W - 4, BODY);
      const gapP = 2;
      const valueH = paragraphs.reduce((s, p, i) => s + heightOf(p, valueW, valueSize) + (i ? gapP : 0), 0);
      const h = Math.max(labelH, valueH, doc.fontSize(BODY).currentLineHeight(true)) + ROW_PAD * 2;
      regular().fontSize(BODY).fillColor(MUTED);
      doc.text(no, noX, y + ROW_PAD, { width: NO_W, lineBreak: false });
      doc.text(safe(label), labelX, y + ROW_PAD, { width: LABEL_W - 4 });
      doc.fillColor(INK).text(":", colonX, y + ROW_PAD, { width: COLON_W, lineBreak: false });
      let py = y + ROW_PAD;
      for (const p of paragraphs) {
        regular().fontSize(valueSize).fillColor(INK).text(p, valueX, py, { width: valueW });
        py = doc.y + gapP;
      }
      y += h;
      rule(y);
    };
    /** "B.1  text" spanning the label and value columns. */
    const line = (no: string, text: string) => {
      const w = right - PAD_X - labelX;
      const h = Math.max(heightOf(safe(text), w, BODY), doc.fontSize(BODY).currentLineHeight(true)) + ROW_PAD * 2;
      regular().fontSize(BODY).fillColor(MUTED).text(no, noX, y + ROW_PAD, { width: NO_W, lineBreak: false });
      doc.fillColor(INK).text(safe(text), labelX, y + ROW_PAD, { width: w });
      y += h;
    };
    /** B.8 / B.9 / B.11: number, a (possibly empty) label column and one or two value texts side by side. */
    const docRow = (no: string, label: string, values: string[]) => {
      const n = values.length, gap = 8, w = (valueW + COLON_W - gap * (n - 1)) / n;
      const labelH = heightOf(safe(label), LABEL_W - 4, BODY);
      const valuesH = Math.max(...values.map((v) => heightOf(safe(v), w, BODY)));
      const h = Math.max(labelH, valuesH, doc.fontSize(BODY).currentLineHeight(true)) + ROW_PAD * 2;
      regular().fontSize(BODY).fillColor(MUTED).text(no, noX, y + ROW_PAD, { width: NO_W, lineBreak: false });
      if (label) doc.text(safe(label), labelX, y + ROW_PAD, { width: LABEL_W - 4 });
      doc.fillColor(INK);
      values.forEach((v, i) => doc.text(safe(v), colonX + i * (w + gap), y + ROW_PAD, { width: w }));
      y += h;
    };

    // ---------- A ----------
    bar(bppu ? "A. IDENTITAS WAJIB PAJAK YANG DIPOTONG DAN/ATAU DIPUNGUT PPh ATAU PENERIMA PENGHASILAN" : "A. IDENTITAS PENERIMA PENGHASILAN");
    row("A.1", bppu ? "NPWP / NIK" : "NIK/NPWP", recipientId);
    row("A.2", "NAMA", slip.counterparty.name);
    row("A.3", bppu ? "NOMOR IDENTITAS TEMPAT KEGIATAN USAHA (NITKU)" : "NITKU", recipientNitku ? `${recipientNitku} - ${slip.counterparty.name}` : "-");
    y += 2;

    // ---------- B ----------
    bar(bppu ? "B. PEMOTONGAN DAN/ATAU PEMUNGUTAN PPh" : "B. PENGHASILAN YANG DIPOTONG");
    y += 1;
    line("B.1", `Jenis Fasilitas : ${facilityLabel(slip)}`);
    if (bppu) line("B.2", `Jenis PPh : ${JENIS_PPH[slip.type]}`);

    // The B table: grey header cells (label + B.x) and one data row; the object label wraps inside its column.
    {
      type Col = { label: string; sub: string; share: number; align: "left" | "center" | "right"; value: string };
      const cols: Col[] = bppu
        ? [
          { label: "KODE OBJEK PAJAK", sub: "B.3", share: 0.18, align: "center", value: slip.objectCode },
          { label: "OBJEK PAJAK", sub: "B.4", share: 0, align: "left", value: slip.objectLabel },
          { label: "DPP (Rp)", sub: "B.5", share: 0.15, align: "right", value: rupiah(slip.baseAmount) },
          { label: "TARIF (%)", sub: "B.6", share: 0.10, align: "center", value: tarif(slip.rate) },
          { label: "PAJAK PENGHASILAN (Rp)", sub: "B.7", share: 0.18, align: "right", value: rupiah(slip.taxAmount) },
        ]
        : [
          { label: "KODE OBJEK PAJAK", sub: "B.2", share: 0.15, align: "center", value: slip.objectCode },
          { label: "OBJEK PAJAK", sub: "B.3", share: 0, align: "left", value: slip.objectLabel },
          { label: "PENGHASILAN BRUTO (Rp)", sub: "B.4", share: 0.15, align: "right", value: rupiah(gross) },
          { label: "DPP (%)", sub: "B.5", share: 0.09, align: "center", value: String(dppPct) },
          { label: "TARIF (%)", sub: "B.6", share: 0.09, align: "center", value: tarif(slip.rate) },
          { label: "PPh DIPOTONG (Rp)", sub: "B.7", share: 0.15, align: "right", value: rupiah(slip.taxAmount) },
        ];
      const tx = left + PAD_X, tw = width - PAD_X * 2, pad = 3;
      const fixed = cols.reduce((s, c) => s + c.share, 0);
      let x = tx;
      const laid = cols.map((c) => { const w = (c.share || 1 - fixed) * tw; const l = { ...c, x, w }; x += w; return l; });
      // Header
      y += 3;
      bold().fontSize(7);
      const labelH = Math.max(...laid.map((c) => doc.heightOfString(safe(c.label), { width: c.w - pad * 2 })));
      regular().fontSize(7);
      const subH = doc.currentLineHeight(true);
      const subGap = 2, headH = pad + labelH + subGap + subH + pad;
      for (const c of laid) {
        doc.rect(c.x, y, c.w, headH).fillAndStroke(CELL, RULE);
        bold().fontSize(7).fillColor(INK).text(safe(c.label), c.x + pad, y + pad, { width: c.w - pad * 2, align: "center" });
        regular().fontSize(7).text(c.sub, c.x + pad, y + pad + labelH + subGap, { width: c.w - pad * 2, align: "center", lineBreak: false });
      }
      y += headH;
      // Data row: the object label may be long; shrink it (down to 6.5pt) so the slip stays on one page.
      const objCol = laid.find((c) => c.share === 0)!;
      let objSize = BODY;
      while (objSize > 6.5 && heightOf(safe(objCol.value), objCol.w - pad * 2, objSize) > 48) objSize -= 0.5;
      const rowH = Math.max(...laid.map((c) => heightOf(safe(c.value), c.w - pad * 2, c === objCol ? objSize : BODY)), doc.fontSize(BODY).currentLineHeight(true)) + pad * 2;
      for (const c of laid) {
        doc.rect(c.x, y, c.w, rowH).lineWidth(0.5).strokeColor(RULE).stroke();
        regular().fontSize(c === objCol ? objSize : BODY).fillColor(INK).text(safe(c.value), c.x + pad, y + pad, { width: c.w - pad * 2, align: c.align, lineBreak: c === objCol });
      }
      y += rowH + 4;
    }

    docRow("B.8", bppu ? "Dokumen Dasar Bukti Pemotongan dan/atau Pemungutan PPh Unifikasi atau Dasar Pemberian Fasilitas" : "Dokumen Referensi",
      [`Jenis Dokumen : ${documentLabel(slip) || "-"}`, `Tanggal${bppu ? "" : " Dokumen"} : ${tanggal(docDate)}`]);
    docRow("B.9", "", [`Nomor Dokumen : ${docNumber || "-"}`]);
    if (bppu) {
      line("B.10", "Untuk Instansi Pemerintah, Pembayaran PPh Menggunakan :");
      docRow("B.11", "", ["Nomor SP2D :"]);
    }
    y += 2;

    // ---------- C ----------
    bar(bppu ? "C. IDENTITAS PEMOTONG DAN/ATAU PEMUNGUT PPh" : "C. IDENTITAS PEMOTONG PPh");
    row("C.1", bppu ? "NPWP / NIK" : "NPWP/NIK", agentId);
    row("C.2", bppu ? "NOMOR IDENTITAS TEMPAT KEGIATAN USAHA (NITKU) / SUBUNIT ORGANISASI" : "NITKU atau Nomor Identitas Subunit Organisasi", agentNitku ? `${agentNitku} - ${entity.legalName}` : "-");
    row("C.3", bppu ? "NAMA PEMOTONG DAN/ATAU PEMUNGUT PPh" : "Nama Pemotong", entity.legalName);
    row("C.4", "TANGGAL", tanggal(slip.date));
    row("C.5", "NAMA PENANDATANGAN", entity.tax.signerName ?? "-");
    const unifikasi = bppu ? "dan/atau Pemungutan PPh Unifikasi " : "";
    row("C.6", bppu ? "PERNYATAAN WAJIB PAJAK" : "Pernyataan", [
      `Dengan ini saya menyatakan bahwa Bukti Pemotongan ${unifikasi}ini telah saya isi dengan benar dan telah saya tandatangani secara elektronik.`,
      `Sesuai dengan ketentuan yang berlaku, Direktorat Jenderal Pajak mengatur bahwa Bukti Pemotongan ${unifikasi}ini dinyatakan sah dan tidak diperlukan tanda tangan basah pada Bukti Pemotongan ini.`,
    ], 8);

    // ---------- QR placeholder and signing note ----------
    {
      const size = 48;
      y += 12;
      doc.save().dash(3, { space: 2 }).lineWidth(0.75).strokeColor(RULE).rect(left, y, size, size).stroke().undash().restore();
      regular().fontSize(7).fillColor(NOTE);
      const note = slip.status === "reported" && slip.coretaxNumber ? "Ditandatangani secara elektronik" : "Dicetak dari ILA Office · belum dilaporkan di Coretax";
      doc.text(safe(note), left + size + 8, y + size - doc.currentLineHeight(true), { width: width - size - 8, lineBreak: false });
      y += size;
    }

    // ---------- Footer ----------
    {
      const footer = "Pemberitahuan: Bukti Potong ini dibuat dengan ILA Office sebagai dokumen pendukung. Bukti potong yang sah adalah yang diterbitkan melalui Coretax DJP setelah pelaporan.";
      regular().fontSize(6.5).fillColor(NOTE);
      const h = doc.heightOfString(footer, { width });
      doc.text(footer, left, Math.min(y + 24, pageBottom - h), { width });
    }

    doc.end();
  });
}
