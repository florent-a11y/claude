import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { invoiceTotals } from "../lib/ledger";
import { buildPpnRegister } from "../lib/tax/ppn";
import { ImageError, MAX_IMAGE_SIDE, readImageInfo } from "../lib/image-info";
import { renderInvoicePdf } from "../lib/invoice-pdf";
import { invoiceEmailDraft } from "../lib/invoice-email";
import {
  DEFAULT_ACCENT_COLOR, DEFAULT_MAIN_COLOR, LOGO_LIMIT, automaticSettlementNotes, contrastRatio, defaultSettlementNotes, dueDateFor, fillPlaceholders, invoiceDocument, logoDrawSize,
  mixColor, parseHexColor, paymentTermText, resolveInvoiceSettings, textOnColor, textOnWhite,
} from "../lib/invoice-settings";
import type { Account, Entity, Invoice, InvoiceSettings, JournalEntry } from "../lib/types";

/**
 * Invoice settings (lib/invoice-settings.ts and its services), prices that include PPN (lib/ledger.ts `invoiceTotals`),
 * the logo check (lib/image-info.ts) and the PDF. Invented data only. lib/db.ts reads ILA_DATA_DIR when it is first
 * loaded, so the temp directory is set before the store modules are imported, and the Supabase variables are removed
 * so a developer's environment can never be written to. Static imports are hoisted above those lines: only modules
 * that never reach lib/db.ts may be imported statically here (lib/recurring.ts does, through lib/money-moves.ts).
 */

const DIR = mkdtempSync(path.join(os.tmpdir(), "ila-invoice-settings-"));
process.env.ILA_DATA_DIR = DIR;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const entityOf = (over: Partial<Entity> = {}, tax: Partial<Entity["tax"]> = {}): Entity => ({
  id: "ent-inv", name: "PT Contoh Villa", legalName: "PT CONTOH VILLA INVESTAMA", type: "pt_pma", country: "ID", isOwn: false, baseCurrency: "IDR", fiscalYearStartMonth: 1,
  address: "Jl. Contoh No. 7", city: "Badung", npwp: "01.234.567.8-901.000",
  tax: { regime: "normal_22", pkp: true, ppnRate: 0.11, lkpm: true, payroll: false, ...tax }, status: "active", createdAt: "2026-01-01T00:00:00.000Z", ...over,
});
const withSettings = (s: InvoiceSettings, tax: Partial<Entity["tax"]> = {}) => entityOf({ invoiceSettings: s }, tax);

/** An invoice as lib/books.ts stores it, from lines and the entity's tax profile. */
function invoiceOf(entity: Entity, lines: Array<{ description: string; qty: number; unitPrice: number; taxCode: "ppn" | "out_of_scope" | "none" }>, over: Partial<Invoice> & { discountEntered?: number; inclusive?: boolean } = {}): Invoice {
  const { discountEntered, inclusive, ...rest } = over;
  const currency = rest.currency ?? "IDR";
  const t = invoiceTotals(lines, { discount: discountEntered, pkp: entity.tax.pkp, ppnRate: entity.tax.ppnRate, currency, pricesIncludeTax: inclusive });
  return {
    id: "inv-1", entityId: entity.id, number: "INV-2026-0007", customer: { type: "other", name: "PT Pelanggan Contoh", address: "Jl. Pelanggan No. 2\nDenpasar", npwp: "09.876.543.2-109.000", email: "finance@example.com" },
    date: "2026-11-20", dueDate: "2026-11-25", currency, fxRate: 1,
    lines: lines.map((l, i) => ({ id: `l${i}`, ...l, amount: t.lineAmounts[i], grossAmount: t.pricesIncludeTax ? t.lineGross[i] : undefined, accountId: "acc" })),
    subtotal: t.subtotal, discount: t.discount, ppnAmount: t.ppnAmount, total: t.total, pricesIncludeTax: t.pricesIncludeTax || undefined,
    grossSubtotal: t.pricesIncludeTax ? t.grossSubtotal : undefined, grossDiscount: t.pricesIncludeTax ? t.grossDiscount : undefined, taxableBase: entity.tax.pkp ? t.taxableBase : undefined,
    amountPaid: 0, status: "sent", createdAt: "2026-11-20T00:00:00.000Z", ...rest,
  };
}
const cents = (x: number) => Math.round(x * 100);

// ---------- A PNG and a JPEG made in memory ----------

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function chunk(type: string, data: Buffer, badCrc = false): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE((zlib.crc32(Buffer.concat([head.subarray(4), data])) ^ (badCrc ? 1 : 0)) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}
/** An RGBA (or RGB) PNG of one flat colour. `filter` sets the filter byte of every scanline; `cut` drops the last bytes of the pixel data. */
function makePng(width: number, height: number, opts: { alpha?: boolean; filter?: number; cut?: number; badCrc?: boolean; noEnd?: boolean; claim?: [number, number] } = {}): Buffer {
  const channels = opts.alpha === false ? 3 : 4;
  const row = 1 + width * channels;
  const raw = Buffer.alloc(height * row);
  for (let y = 0; y < height; y++) {
    raw[y * row] = opts.filter ?? 0;
    for (let x = 0; x < width; x++) { const p = y * row + 1 + x * channels; raw[p] = 15; raw[p + 1] = 59; raw[p + 2] = 94; if (channels === 4) raw[p + 3] = x < width / 2 ? 255 : 128; }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(opts.claim?.[0] ?? width, 0);
  ihdr.writeUInt32BE(opts.claim?.[1] ?? height, 4);
  ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([PNG_SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw.subarray(0, raw.length - (opts.cut ?? 0))), opts.badCrc), ...(opts.noEnd ? [] : [chunk("IEND", Buffer.alloc(0))])]);
}
/** The header of a JPEG: enough for its size to be read (not a picture). */
function jpegHeader(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}
const fileOf = (buf: Buffer, name: string, type = "image/png") => new File([new Uint8Array(buf)], name, { type });

// ---------- Prices that include PPN ----------

test("prices excluding PPN: the totals are what they always were", () => {
  const t = invoiceTotals([{ qty: 2, unitPrice: 1_000_000, taxCode: "ppn" }, { qty: 1, unitPrice: 500_000, taxCode: "out_of_scope" }], { discount: 250_000, pkp: true, ppnRate: 0.11 });
  assert.deepEqual(t.lineAmounts, [2_000_000, 500_000]);
  assert.deepEqual(t.lineGross, t.lineAmounts);
  assert.equal(t.subtotal, 2_500_000);
  assert.equal(t.discount, 250_000);
  assert.equal(t.taxableBase, 1_800_000, "the discount reduces the base pro rata");
  assert.equal(t.ppnAmount, 198_000);
  assert.equal(t.total, 2_448_000);
  assert.equal(t.pricesIncludeTax, false);
  assert.equal(t.grossSubtotal, 2_500_000);
  assert.equal(t.grossDiscount, 250_000);
});

test("prices including PPN: the total is what was typed and the PPN is taken out of it", () => {
  const t = invoiceTotals([{ qty: 1, unitPrice: 11_100_000, taxCode: "ppn" }], { pkp: true, ppnRate: 0.11, pricesIncludeTax: true });
  assert.equal(t.pricesIncludeTax, true);
  assert.equal(t.total, 11_100_000);
  assert.equal(t.ppnAmount, 1_100_000);
  assert.equal(t.taxableBase, 10_000_000);
  assert.equal(t.subtotal, 10_000_000, "revenue is net of PPN");
  assert.deepEqual(t.lineAmounts, [10_000_000]);
  assert.deepEqual(t.lineGross, [11_100_000]);
  assert.equal(t.discount, 0);
});

test("prices including PPN: lines that do not divide evenly still add up, the last taxable line absorbing the rounding", () => {
  const t = invoiceTotals([{ qty: 1, unitPrice: 100_000, taxCode: "ppn" }, { qty: 1, unitPrice: 100_000, taxCode: "ppn" }, { qty: 1, unitPrice: 100_000, taxCode: "ppn" }, { qty: 1, unitPrice: 50_000, taxCode: "none" }], { pkp: true, ppnRate: 0.11, pricesIncludeTax: true });
  assert.equal(t.total, 350_000);
  assert.equal(t.ppnAmount, 29_730, "300,000 × 11/111, in whole rupiah");
  assert.equal(t.subtotal, 320_270);
  assert.equal(cents(t.lineAmounts.reduce((s, a) => s + a, 0)), cents(t.subtotal));
  assert.deepEqual(t.lineAmounts.slice(0, 2), [90_090.09, 90_090.09]);
  assert.equal(t.lineAmounts[2], 90_089.82);
  assert.equal(t.lineAmounts[3], 50_000, "a line without PPN is its price");
  assert.equal(cents(t.subtotal - t.discount + t.ppnAmount), cents(t.total));
});

test("prices including PPN with a discount and a line outside PPN", () => {
  const t = invoiceTotals([{ qty: 1, unitPrice: 1_110_000, taxCode: "ppn" }, { qty: 1, unitPrice: 500_000, taxCode: "out_of_scope" }], { discount: 161_000, pkp: true, ppnRate: 0.11, pricesIncludeTax: true });
  assert.equal(t.grossSubtotal, 1_610_000);
  assert.equal(t.grossDiscount, 161_000);
  assert.equal(t.total, 1_449_000, "what the customer pays: lines less discount");
  assert.equal(t.ppnAmount, 99_000, "PPN contained in the taxable part after the 10% discount");
  assert.equal(t.taxableBase, 900_000);
  assert.equal(t.subtotal, 1_500_000);
  assert.equal(t.discount, 150_000, "the discount net of its PPN part");
  assert.equal(cents(t.subtotal - t.discount + t.ppnAmount), cents(t.total));
});

test("prices including PPN only mean something for a PKP entity; other currencies keep their cents", () => {
  const nonPkp = invoiceTotals([{ qty: 1, unitPrice: 1_110_000, taxCode: "ppn" }], { pkp: false, ppnRate: 0.11, pricesIncludeTax: true });
  assert.equal(nonPkp.pricesIncludeTax, false);
  assert.equal(nonPkp.ppnAmount, 0);
  assert.equal(nonPkp.total, 1_110_000);
  const usd = invoiceTotals([{ qty: 3, unitPrice: 33.33, taxCode: "ppn" }], { pkp: true, ppnRate: 0.11, currency: "USD", pricesIncludeTax: true });
  assert.equal(usd.total, 99.99);
  assert.equal(usd.ppnAmount, 9.91);
  assert.equal(usd.subtotal, 90.08);
  assert.equal(cents(usd.subtotal + usd.ppnAmount), cents(usd.total));
});

test("prices including PPN: whatever the lines and the discount, the invoice balances", () => {
  let seed = 20261124;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 400; i++) {
    const ccy = i % 5 === 0 ? "USD" : "IDR";
    const lines = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => ({ qty: 1 + Math.floor(rnd() * 5), unitPrice: ccy === "USD" ? Math.round(rnd() * 500_00) / 100 : Math.round(rnd() * 9_000_000) + (rnd() < 0.2 ? 0.5 : 0), taxCode: (rnd() < 0.75 ? "ppn" : "out_of_scope") as "ppn" | "out_of_scope" }));
    const gross = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const discount = rnd() < 0.5 ? 0 : Math.round(gross * rnd() * 0.6 * 100) / 100;
    const rate = rnd() < 0.5 ? 0.11 : 0.12;
    const t = invoiceTotals(lines, { discount, pkp: true, ppnRate: rate, currency: ccy, pricesIncludeTax: true });
    const ctx = JSON.stringify({ lines, discount, rate, ccy, t });
    assert.equal(cents(t.subtotal - t.discount + t.ppnAmount), cents(t.total), ctx);
    assert.equal(cents(t.lineAmounts.reduce((s, a) => s + a, 0)), cents(t.subtotal), ctx);
    assert.equal(cents(t.grossSubtotal - t.grossDiscount), cents(t.total), ctx);
    assert.ok(t.discount >= 0 && t.ppnAmount >= 0 && t.taxableBase >= 0, ctx);
    assert.ok(t.ppnAmount <= t.total + 0.001, ctx);
    for (const v of [t.subtotal, t.discount, t.ppnAmount, t.total, t.taxableBase, ...t.lineAmounts]) assert.ok(Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `to the cent: ${v} ${ctx}`);
  }
});

test("the PPN register takes the base stored with the invoice", () => {
  const e = entityOf();
  const inclusive = invoiceOf(e, [{ description: "Villa management", qty: 1, unitPrice: 11_100_000, taxCode: "ppn" }], { inclusive: true });
  const discounted = invoiceOf(e, [{ description: "Advisory", qty: 1, unitPrice: 2_000_000, taxCode: "ppn" }], { id: "inv-2", number: "INV-2026-0008", discountEntered: 200_000 });
  const legacy: Invoice = { ...invoiceOf(e, [{ description: "Advisory", qty: 1, unitPrice: 1_000_000, taxCode: "ppn" }], { id: "inv-3", number: "INV-2026-0009" }), taxableBase: undefined };
  const { rows } = buildPpnRegister({ period: "2026-11", invoices: [inclusive, discounted, legacy], bills: [], manual: [] });
  const by = (n: string) => rows.find((r) => r.docNumber === n)!;
  assert.deepEqual([by("INV-2026-0007").dpp, by("INV-2026-0007").ppn], [10_000_000, 1_100_000]);
  assert.deepEqual([by("INV-2026-0008").dpp, by("INV-2026-0008").ppn], [1_800_000, 198_000], "after discount");
  assert.deepEqual([by("INV-2026-0009").dpp, by("INV-2026-0009").ppn], [1_000_000, 110_000], "an older invoice still reads its lines");
});

test("a recurring invoice keeps the choice and the discount as entered", async () => {
  const { templateFromInvoice } = await import("../lib/recurring");
  const inv = invoiceOf(entityOf(), [{ description: "Retainer", qty: 1, unitPrice: 5_550_000, taxCode: "ppn" }], { inclusive: true, discountEntered: 555_000 });
  const p = templateFromInvoice(inv).payload as { discount?: number; pricesIncludeTax?: boolean };
  assert.equal(p.pricesIncludeTax, true);
  assert.equal(p.discount, 555_000);
});

// ---------- Settings ----------

test("colours: parsing, tints and readable text", () => {
  assert.equal(parseHexColor("#0F3B5E"), "#0f3b5e");
  assert.equal(parseHexColor("abc"), "#aabbcc");
  assert.equal(parseHexColor(" 1d4ed8 "), "#1d4ed8");
  for (const bad of ["", "#12", "red", "#12345g", undefined, 12]) assert.equal(parseHexColor(bad), undefined);
  assert.equal(mixColor("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(textOnWhite(DEFAULT_MAIN_COLOR), DEFAULT_MAIN_COLOR, "a dark colour is used as it is");
  const yellow = textOnWhite("#ffe600");
  assert.notEqual(yellow, "#ffe600");
  assert.ok(contrastRatio(yellow, "#ffffff") >= 3, "a pale colour is darkened until it reads on white");
  assert.equal(textOnColor("#0f3b5e"), "#ffffff");
  assert.equal(textOnColor("#ffe600"), "#15202b");
});

test("without settings an invoice looks as it did", () => {
  const s = resolveInvoiceSettings(entityOf());
  assert.equal(s.mainColor, DEFAULT_MAIN_COLOR);
  assert.equal(s.accentColor, DEFAULT_ACCENT_COLOR);
  assert.equal(s.title, "INVOICE");
  assert.equal(s.language, "en");
  assert.equal(s.pricesIncludeTax, false);
  assert.equal(s.taxLabel, "PPN");
  assert.equal(s.noTaxNote, "", "a PKP entity prints nothing when an invoice has no PPN");
  assert.deepEqual([s.dueDays, s.dueDaysKind], [3, "working"]);
  assert.equal(s.showQty, true);
  assert.equal(s.companyDetails, "Jl. Contoh No. 7, Badung\nNPWP 01.234.567.8-901.000");
  assert.equal(s.footerText, "PT CONTOH VILLA INVESTAMA · Jl. Contoh No. 7");
  assert.equal(s.settlementNotes, undefined);
  assert.equal(s.signature.show, false);
  assert.equal(s.notesSize, "small", "the settlement notes print one step smaller than the invoice lines");
  assert.equal(resolveInvoiceSettings(entityOf({}, { pkp: false })).noTaxNote, "Not applicable (non-PKP)");
  assert.ok(resolveInvoiceSettings(entityOf({ isOwn: true })).tagline, "ILA's own invoices keep their tagline");
});

test("settings override the defaults; an empty text prints nothing, a bad value falls back", () => {
  const s = resolveInvoiceSettings(withSettings({ mainColor: "#14532D", accentColor: "nonsense", tableHeader: "solid", title: "  TAX INVOICE ", language: "id", pricesIncludeTax: true, taxLabel: "VAT", noTaxNote: "", dueDays: 30, dueDaysKind: "calendar", showQty: false, companyDetails: "Jl. Baru 1\nTel. 0361 000 000", footerText: "", hideCompanyName: true, signature: { show: true, name: "Made Contoh", title: "Director" } }));
  assert.equal(s.mainColor, "#14532d");
  assert.equal(s.accentColor, DEFAULT_ACCENT_COLOR);
  assert.equal(s.tableHeader, "solid");
  assert.equal(s.title, "TAX INVOICE");
  assert.equal(s.language, "id");
  assert.equal(s.pricesIncludeTax, true);
  assert.equal(s.taxLabel, "VAT");
  assert.equal(s.noTaxNote, "");
  assert.deepEqual([s.dueDays, s.dueDaysKind], [30, "calendar"]);
  assert.equal(s.showQty, false);
  assert.equal(s.companyDetails, "Jl. Baru 1\nTel. 0361 000 000");
  assert.equal(s.footerText, "");
  assert.equal(s.hideCompanyName, false, "the name is only hidden when there is a logo to carry it");
  assert.deepEqual(s.signature, { show: true, name: "Made Contoh", title: "Director" });
  assert.equal(resolveInvoiceSettings(withSettings({ language: "id" })).title, "FAKTUR");
  assert.equal(resolveInvoiceSettings(withSettings({ dueDays: 9999 })).dueDays, 365);
  assert.equal(resolveInvoiceSettings(withSettings({ dueDays: -4 })).dueDays, 0);
});

test("settlement notes: their text size is a setting, small unless chosen otherwise", () => {
  const line = [{ description: "Advisory", qty: 1, unitPrice: 1_000_000, taxCode: "ppn" as const }];
  const fontOf = (s: InvoiceSettings) => { const e = withSettings(s); return invoiceDocument({ invoice: invoiceOf(e, line), entity: e }).blocksFont; };
  assert.deepEqual(fontOf({}), { px: 12, pt: 8 });
  assert.deepEqual(fontOf({ notesSize: "xsmall" }), { px: 11, pt: 7 });
  assert.deepEqual(fontOf({ notesSize: "normal" }), { px: 14, pt: 9 }, "the size of the invoice lines");
  assert.deepEqual(fontOf({ notesSize: "huge" as never }), { px: 12, pt: 8 }, "anything else falls back");
});

test("payment term: working or calendar days", () => {
  // 20 Nov 2026 is a Friday.
  assert.equal(dueDateFor("2026-11-20", { dueDays: 3, dueDaysKind: "working" }), "2026-11-25");
  assert.equal(dueDateFor("2026-11-20", { dueDays: 3, dueDaysKind: "calendar" }), "2026-11-23");
  assert.equal(dueDateFor("2026-11-20", { dueDays: 0, dueDaysKind: "working" }), "2026-11-20");
  assert.equal(dueDateFor("2026-11-20", { dueDays: 30, dueDaysKind: "calendar" }), "2026-12-20");
  assert.equal(paymentTermText({ dueDays: 3, dueDaysKind: "working" }), "3 working days");
  assert.equal(paymentTermText({ dueDays: 1, dueDaysKind: "calendar" }), "1 day");
  assert.equal(paymentTermText({ dueDays: 14, dueDaysKind: "working" }, "id"), "14 hari kerja");
});

test("settlement notes: automatic from the bank accounts, or the entity's own, with the invoice filled in", () => {
  const banks = [{ name: "OCBC IDR", bankName: "Bank OCBC NISP", accountNumber: "1234567890", currency: "IDR" }, { name: "Kas kecil", currency: "IDR" }];
  const e = entityOf();
  const automatic = automaticSettlementNotes(e, banks);
  assert.equal(automatic, ["Payment by bank transfer within 3 working days to:", "Bank OCBC NISP 1234567890 (IDR) · PT CONTOH VILLA INVESTAMA", "Kas kecil (IDR) · PT CONTOH VILLA INVESTAMA", "Please quote {number} as the transfer reference. Bank charges are borne by the payer."].join("\n"));
  assert.equal(defaultSettlementNotes(e, banks), automatic);
  assert.match(automaticSettlementNotes(e, []), /^Payment by bank transfer within 3 working days\.\n/);
  assert.match(automaticSettlementNotes(withSettings({ language: "id", dueDays: 14, dueDaysKind: "calendar" }), banks), /^Pembayaran melalui transfer bank dalam 14 hari ke:/);
  assert.equal(defaultSettlementNotes(withSettings({ settlementNotes: "Transfer to BCA 111 a.n. PT Contoh.\nRef {number}." }), banks), "Transfer to BCA 111 a.n. PT Contoh.\nRef {number}.");
  assert.equal(defaultSettlementNotes(withSettings({ settlementNotes: "" }), banks), "", "an empty text means no settlement notes");
  const inv = invoiceOf(e, [{ description: "Advisory", qty: 1, unitPrice: 1_000_000, taxCode: "ppn" }]);
  assert.equal(fillPlaceholders("Ref {number}, due {due_date}, {TOTAL} for {customer}; {unknown} stays", inv), "Ref INV-2026-0007, due 25 Nov 2026, Rp\u00a01.110.000 for PT Pelanggan Contoh; {unknown} stays");
});

// ---------- The document ----------

const labels = (d: ReturnType<typeof invoiceDocument>) => d.totals.map((t) => `${t.label}=${t.value.replace(/\u00a0/g, " ")}${t.kind === "normal" ? "" : `/${t.kind}`}`);

test("document: prices excluding PPN print the tax on top", () => {
  const e = entityOf();
  const d = invoiceDocument({ invoice: invoiceOf(e, [{ description: "Advisory", qty: 2, unitPrice: 1_000_000, taxCode: "ppn" }], { discountEntered: 200_000 }), entity: e, banks: [] });
  assert.deepEqual(labels(d), ["Subtotal=Rp 2.000.000", "Discount=\u2212Rp 200.000", "PPN 11%=Rp 198.000", "Total=Rp 1.998.000/total"]);
  assert.equal(d.title, "INVOICE");
  assert.equal(d.number, "INV-2026-0007");
  assert.equal(d.stamp, undefined);
  assert.deepEqual(d.meta.map((m) => `${m.label}: ${m.value}`), ["Invoice date: 20 Nov 2026", "Due date: 25 Nov 2026"]);
  assert.deepEqual(d.billTo, { label: "Bill to", name: "PT Pelanggan Contoh", lines: ["Jl. Pelanggan No. 2", "Denpasar", "NPWP 09.876.543.2-109.000", "finance@example.com"] });
  assert.deepEqual(d.lines, [{ description: "Advisory", qty: "2", unitPrice: "Rp\u00a01.000.000", amount: "Rp\u00a02.000.000" }]);
  assert.deepEqual(d.company, { name: "PT CONTOH VILLA INVESTAMA", showName: true, tagline: undefined, details: ["Jl. Contoh No. 7, Badung", "NPWP 01.234.567.8-901.000"] });
  assert.equal(d.blocks[0].label, "Payment");
  assert.match(d.blocks[0].text, /Please quote INV-2026-0007 as the transfer reference/, "the automatic notes name the invoice");
  assert.equal(d.signature, undefined);
  assert.equal(d.colors.main, DEFAULT_MAIN_COLOR);
});

test("document: prices including PPN print the total as typed, then the base and the tax it contains", () => {
  const e = entityOf();
  const d = invoiceDocument({ invoice: invoiceOf(e, [{ description: "Villa management", qty: 1, unitPrice: 1_110_000, taxCode: "ppn" }, { description: "Reimbursed permit fee", qty: 1, unitPrice: 500_000, taxCode: "out_of_scope" }], { inclusive: true, discountEntered: 161_000 }), entity: e });
  assert.deepEqual(d.lines.map((l) => l.amount.replace(/\u00a0/g, " ")), ["Rp 1.110.000", "Rp 500.000"], "lines as typed, PPN included");
  assert.deepEqual(labels(d), ["Subtotal=Rp 1.610.000", "Discount=\u2212Rp 161.000", "Total=Rp 1.449.000/total", "Tax base (DPP)=Rp 900.000/muted", "Includes PPN 11%=Rp 99.000/muted"]);
});

test("document: no PPN, part paid, draft, foreign currency", () => {
  const nonPkp = entityOf({}, { pkp: false });
  const d = invoiceDocument({ invoice: invoiceOf(nonPkp, [{ description: "Advisory", qty: 1, unitPrice: 1_500_000, taxCode: "out_of_scope" }], { amountPaid: 500_000, status: "partial" }), entity: nonPkp });
  assert.deepEqual(labels(d), ["Subtotal=Rp 1.500.000", "PPN=Not applicable (non-PKP)/muted", "Total=Rp 1.500.000/total", "Paid=Rp 500.000", "Balance due=Rp 1.000.000/total"]);
  const silent = withSettings({ noTaxNote: "" }, { pkp: false });
  assert.deepEqual(labels(invoiceDocument({ invoice: invoiceOf(silent, [{ description: "Advisory", qty: 1, unitPrice: 1_500_000, taxCode: "out_of_scope" }]), entity: silent })), ["Subtotal=Rp 1.500.000", "Total=Rp 1.500.000/total"]);
  const e = entityOf();
  const draft = invoiceDocument({ invoice: invoiceOf(e, [{ description: "Advisory", qty: 1, unitPrice: 100, taxCode: "ppn" }], { status: "draft", currency: "USD", fxRate: 16_500 }), entity: e });
  assert.equal(draft.stamp, "DRAFT");
  assert.equal(draft.totalsNote, "Rate: 1 USD = Rp\u00a016.500");
  assert.ok(draft.meta.some((m) => m.label === "Currency" && m.value === "USD"));
  assert.deepEqual(labels(draft), ["Subtotal=$100.00", "PPN 11%=$11.00", "Total=$111.00/total"]);
  assert.equal(invoiceDocument({ invoice: invoiceOf(e, [{ description: "x", qty: 1, unitPrice: 1, taxCode: "ppn" }], { status: "void" }), entity: e }).stamp, "VOID");
});

test("document: the settings change colours, labels, columns, notes, signature and footer", () => {
  const logo = { id: "a", name: "logo.png", size: 100, type: "image/png", path: "ent-inv/invoice-logo/ent-inv/a-logo.png", uploadedAt: "2026-11-20T00:00:00.000Z", width: 400, height: 100 };
  const e = withSettings({ mainColor: "#ffe600", accentColor: "#14532d", tableHeader: "solid", logo, logoSize: "large", hideCompanyName: true, title: "FAKTUR PENJUALAN", language: "id", taxLabel: "VAT (PPN)", showQty: false, settlementNotes: "Transfer ke BCA 111.\nReferensi {number}, jatuh tempo {due_date}.", footerText: "Terima kasih", signature: { show: true, name: "Made Contoh", title: "Direktur" } });
  const d = invoiceDocument({ invoice: invoiceOf(e, [{ description: "Jasa konsultasi", qty: 1, unitPrice: 1_000_000, taxCode: "ppn" }], { notes: "Faktur {number}" }), entity: e });
  assert.equal(d.language, "id");
  assert.equal(d.title, "FAKTUR PENJUALAN");
  assert.equal(d.showQty, false);
  assert.deepEqual(d.columns, { description: "Keterangan", qty: "Jml", unitPrice: "Harga satuan", amount: "Jumlah" });
  assert.deepEqual(labels(d), ["Subtotal=Rp 1.000.000", "VAT (PPN) 11%=Rp 110.000", "Total=Rp 1.110.000/total"]);
  assert.deepEqual(d.meta.map((m) => m.label), ["Tanggal", "Jatuh tempo"]);
  assert.equal(d.billTo.label, "Kepada");
  assert.deepEqual(d.blocks, [{ label: "Pembayaran", text: "Transfer ke BCA 111.\nReferensi INV-2026-0007, jatuh tempo 25 Nov 2026." }, { label: "Catatan", text: "Faktur INV-2026-0007" }]);
  assert.deepEqual(d.signature, { label: "Hormat kami", issuer: "PT CONTOH VILLA INVESTAMA", name: "Made Contoh", title: "Direktur" });
  assert.equal(d.footer, "Terima kasih");
  assert.equal(d.company.showName, false);
  assert.deepEqual(d.logo, { path: logo.path, boxWidth: 230, boxHeight: 86, width: 400, height: 100 });
  assert.deepEqual(logoDrawSize(d.logo!), { width: 230, height: 57.5 }, "fitted into its box, proportions kept");
  assert.equal(d.colors.headerFill, "#ffe600", "a solid header is filled with the main colour");
  assert.equal(d.colors.headerText, "#15202b", "and takes dark text on a light fill");
  assert.ok(contrastRatio(d.colors.mainText, "#ffffff") >= 3, "text in a pale main colour is darkened");
  // The invoice's own settlement notes win over the entity's; line ends typed in a form are normalised.
  const own = invoiceDocument({ invoice: invoiceOf(e, [{ description: "x", qty: 1, unitPrice: 1, taxCode: "ppn" }], { paymentInstructions: "Tunai\r\natau transfer\r\n" }), entity: e });
  assert.equal(own.blocks[0].text, "Tunai\natau transfer");
});

test("the invoice email fills the placeholders of the settlement notes", () => {
  const e = entityOf();
  const draft = invoiceEmailDraft(invoiceOf(e, [{ description: "Advisory", qty: 1, unitPrice: 1_000_000, taxCode: "ppn" }]), e, { paymentInstructions: "Please quote {number}." });
  assert.match(draft.text, /Please quote INV-2026-0007\./);
});

// ---------- The logo file ----------

test("image check: a sound PNG or JPEG gives its size", () => {
  assert.deepEqual(readImageInfo(makePng(40, 10)), { type: "png", width: 40, height: 10 });
  assert.deepEqual(readImageInfo(makePng(3, 5, { alpha: false, filter: 4 })), { type: "png", width: 3, height: 5 });
  assert.deepEqual(readImageInfo(jpegHeader(320, 120)), { type: "jpeg", width: 320, height: 120 });
});

test("image check: anything damaged, oversized or of another kind is refused before the PDF renderer sees it", () => {
  const refused = (buf: Buffer, pattern: RegExp, why: string) => assert.throws(() => readImageInfo(buf), (e: unknown) => e instanceof ImageError && pattern.test((e as Error).message), why);
  refused(Buffer.from("not an image at all"), /PNG or JPG/, "text");
  refused(Buffer.from("GIF89a\x01\x00\x01\x00"), /PNG or JPG/, "another image format");
  refused(makePng(8, 8, { badCrc: true }), /damaged/, "checksum");
  refused(makePng(8, 8, { cut: 5 }), /damaged/, "pixel data too short");
  refused(makePng(8, 8, { filter: 9 }), /damaged/, "a filter byte pdfkit would throw on");
  refused(makePng(8, 8, { noEnd: true }), /damaged/, "no end chunk");
  refused(makePng(8, 8).subarray(0, 40), /damaged/, "truncated");
  refused(makePng(8, 8, { claim: [800, 800] }), /damaged/, "header and data disagree");
  refused(makePng(4, 4, { claim: [MAX_IMAGE_SIDE + 1, 4] }), /at most 2000/, "too wide");
  refused(Buffer.concat([PNG_SIG, Buffer.from("garbage after the signature")]), /damaged/, "no header");
  refused(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), /damaged/, "a JPEG without a frame");
  refused(jpegHeader(MAX_IMAGE_SIDE + 5, 10), /at most 2000/, "too wide");
});

// ---------- The PDF ----------

const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;

test("PDF: renders with a logo, in the entity's colours and language", async () => {
  const logo = makePng(240, 60);
  const e = withSettings({ mainColor: "#14532d", accentColor: "#b45309", tableHeader: "solid", language: "id", logoSize: "large", signature: { show: true, name: "Made Contoh", title: "Direktur" }, logo: { id: "a", name: "logo.png", size: logo.length, type: "image/png", path: "x/invoice-logo/x/a-logo.png", uploadedAt: "2026-11-20T00:00:00.000Z", width: 240, height: 60 } });
  const inv = invoiceOf(e, [{ description: "Jasa pengelolaan vila", qty: 1, unitPrice: 11_100_000, taxCode: "ppn" }], { inclusive: true, discountEntered: 100_000 });
  const pdf = await renderInvoicePdf(inv, e, { logo, banks: [{ name: "OCBC IDR", bankName: "Bank OCBC NISP", accountNumber: "1234567890", currency: "IDR" }] });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal(pages(pdf), 1);
  const raw = pdf.toString("latin1");
  assert.match(raw, /\/Subtype \/Image/, "the logo is embedded");
  assert.ok(raw.includes("/Title"), "has a document title");
  const plain = await renderInvoicePdf(inv, entityOf());
  assert.doesNotMatch(plain.toString("latin1"), /\/Subtype \/Image/);
  assert.ok(pdf.length > plain.length);
});

test("PDF: a logo that cannot be drawn never blocks the invoice, and a long invoice runs onto more pages", async () => {
  const e = withSettings({ logo: { id: "a", name: "logo.png", size: 4, type: "image/png", path: "x/invoice-logo/x/a-logo.png", uploadedAt: "2026-11-20T00:00:00.000Z" } });
  const lines = Array.from({ length: 70 }, (_, i) => ({ description: `Service line ${i + 1} with a description long enough to wrap onto a second line in the description column of the table`, qty: 1, unitPrice: 100_000 + i, taxCode: "ppn" as const }));
  const pdf = await renderInvoicePdf(invoiceOf(e, lines), e, { logo: Buffer.from("junk") });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pages(pdf) >= 3, `pages: ${pages(pdf)}`);
});

// ---------- The store ----------

let db: typeof import("../lib/db").db;
let B: typeof import("../lib/books");
let S: typeof import("../lib/invoice-settings-services");
let accounts: Account[];
const ENTITY = "ent-inv";
const revenue = () => accounts.find((a) => a.type === "revenue" && a.active)!;
const tagged = (tag: Account["taxTag"]) => accounts.find((a) => a.taxTag === tag)!;
const stored = async () => (await db.get("entities", ENTITY))!;
const onDisk = (key: string) => existsSync(path.join(DIR, "files", key));

before(async () => {
  ({ db } = await import("../lib/db"));
  B = await import("../lib/books");
  S = await import("../lib/invoice-settings-services");
  const { buildAccounts } = await import("../lib/coa");
  await db.insert("entities", entityOf());
  accounts = buildAccounts(ENTITY, () => db.newId());
  await db.insertMany("accounts", accounts);
  await B.createBankAccount(ENTITY, { name: "Demo Bank IDR", bankName: "Bank Demo", accountNumber: "000111222", currency: "IDR", accountId: accounts.find((a) => a.code === "1-1100")!.id });
});
after(() => rmSync(DIR, { recursive: true, force: true }));

test("store: settings are saved as chosen, defaults are not stored, wrong values are refused", async () => {
  await assert.rejects(S.saveInvoiceSettings(ENTITY, { mainColor: "bluish" }), /Main colour.*not a colour/);
  await assert.rejects(S.saveInvoiceSettings(ENTITY, { dueDays: 400 }), /between 0 and 365/);
  await assert.rejects(S.saveInvoiceSettings(ENTITY, { title: "x".repeat(41) }), /Document title is too long/);
  await assert.rejects(S.saveInvoiceSettings("nope", {}), /Entity not found/);
  assert.equal((await stored()).invoiceSettings, undefined, "a refused save stores nothing");

  await S.saveInvoiceSettings(ENTITY, { mainColor: "#14532D", accentColor: "", tableHeader: "tinted", logoSize: "small", language: "en", title: "", pricesIncludeTax: true, taxLabel: " VAT ", dueDays: 14, dueDaysKind: "calendar", showQty: true, settlementNotes: undefined, footerText: "", defaultNotes: " Thank you. ", signature: { show: false } }, "user-1");
  const s = (await stored()).invoiceSettings!;
  assert.equal(s.mainColor, "#14532d");
  assert.equal(s.accentColor, undefined, "an empty colour keeps the default");
  assert.equal(s.tableHeader, undefined);
  assert.equal(s.language, undefined);
  assert.equal(s.title, undefined);
  assert.equal(s.pricesIncludeTax, true);
  assert.equal(s.taxLabel, "VAT");
  assert.deepEqual([s.dueDays, s.dueDaysKind], [14, "calendar"]);
  assert.equal(s.settlementNotes, undefined, "automatic");
  assert.equal(s.footerText, "", "an empty footer is kept: it prints nothing");
  assert.equal(s.defaultNotes, "Thank you.");
  assert.equal(s.signature, undefined);
  assert.equal(s.updatedByUserId, "user-1");
  assert.equal(s.notesSize, undefined, "the default size is not stored");
  assert.equal((await S.saveInvoiceSettings(ENTITY, { ...s, logoSize: undefined, signature: undefined, notesSize: "xsmall" }, "user-1")).invoiceSettings!.notesSize, "xsmall");
  assert.equal((await S.saveInvoiceSettings(ENTITY, { ...s, logoSize: undefined, signature: undefined, notesSize: "small" }, "user-1")).invoiceSettings!.notesSize, undefined);
});

test("store: a new invoice takes the payment term, and prices that include PPN post revenue net of it", async () => {
  const inv = await B.createInvoice(ENTITY, { customer: { type: "other", name: "PT Pelanggan Contoh" }, date: "2026-11-20", currency: "IDR", fxRate: 1, pricesIncludeTax: true, discount: 161_000, lines: [{ description: "Villa management", qty: 1, unitPrice: 1_110_000, accountId: revenue().id, taxCode: "ppn" }, { description: "Reimbursed permit fee", qty: 1, unitPrice: 500_000, accountId: revenue().id, taxCode: "out_of_scope" }] });
  assert.equal(inv.dueDate, "2026-12-04", "14 calendar days from the settings");
  assert.equal(inv.pricesIncludeTax, true);
  assert.deepEqual([inv.total, inv.ppnAmount, inv.taxableBase, inv.subtotal, inv.discount, inv.grossSubtotal, inv.grossDiscount], [1_449_000, 99_000, 900_000, 1_500_000, 150_000, 1_610_000, 161_000]);
  assert.deepEqual(inv.lines.map((l) => [l.amount, l.grossAmount]), [[1_000_000, 1_110_000], [500_000, 500_000]]);

  const posted = await B.postInvoice(ENTITY, inv.id);
  const journal = (await db.get("journal_entries", posted.journalId!)) as JournalEntry;
  const debit = journal.lines.reduce((s, l) => s + l.debit, 0), credit = journal.lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(cents(debit), cents(credit), "balanced");
  const of = (id: string, side: "debit" | "credit") => journal.lines.filter((l) => l.accountId === id).reduce((s, l) => s + l[side], 0);
  assert.equal(of(tagged("ar_trade").id, "debit"), 1_449_000, "the customer owes what was typed, less the discount");
  assert.equal(of(tagged("ppn_output").id, "credit"), 99_000);
  assert.equal(of(revenue().id, "credit"), 1_500_000, "revenue net of PPN");

  // Editing a draft back to exclusive prices recomputes everything and drops the printed gross figures.
  const draft = await B.createInvoice(ENTITY, { customer: { type: "other", name: "PT Pelanggan Contoh" }, date: "2026-11-20", dueDate: "2026-11-30", currency: "IDR", fxRate: 1, pricesIncludeTax: true, lines: [{ description: "Advisory", qty: 1, unitPrice: 1_110_000, accountId: revenue().id, taxCode: "ppn" }] });
  assert.equal(draft.dueDate, "2026-11-30", "a due date that is given is kept");
  const edited = await B.updateInvoice(ENTITY, draft.id, { customer: draft.customer, date: draft.date, dueDate: draft.dueDate, currency: "IDR", fxRate: 1, pricesIncludeTax: false, lines: [{ description: "Advisory", qty: 1, unitPrice: 1_110_000, accountId: revenue().id, taxCode: "ppn" }] });
  assert.deepEqual([edited.pricesIncludeTax, edited.grossSubtotal, edited.total, edited.ppnAmount, edited.lines[0].grossAmount], [undefined, undefined, 1_232_100, 122_100, undefined]);
});

test("store: the logo is checked, stored, replaced and removed", async () => {
  await assert.rejects(S.setInvoiceLogo(ENTITY, fileOf(Buffer.from("hello"), "logo.txt", "text/plain")), /PNG or JPG/);
  await assert.rejects(S.setInvoiceLogo(ENTITY, fileOf(Buffer.from("just text, renamed"), "logo.png")), /PNG or JPG/);
  await assert.rejects(S.setInvoiceLogo(ENTITY, fileOf(makePng(8, 8, { filter: 9 }), "logo.png")), /damaged/);
  await assert.rejects(S.setInvoiceLogo(ENTITY, fileOf(Buffer.concat([makePng(8, 8), Buffer.alloc(LOGO_LIMIT)]), "logo.png")), /limit is 1 MB/);
  await assert.rejects(S.setInvoiceLogo(ENTITY, fileOf(makePng(8, 8), "logo.jpg", "image/jpeg")), /rename it to \.png/);
  assert.equal((await stored()).invoiceSettings?.logo, undefined);

  const first = (await S.setInvoiceLogo(ENTITY, fileOf(makePng(240, 60), "Logo PT Contoh.png"), { id: "user-1", name: "Tester" })).invoiceSettings!.logo!;
  assert.deepEqual([first.width, first.height, first.type], [240, 60, "image/png"]);
  assert.ok(first.path.startsWith(`${ENTITY}/invoice-logo/${ENTITY}/`), "under the entity, so the files route serves it to whoever may see the entity");
  assert.ok(onDisk(first.path));
  assert.equal((await stored()).invoiceSettings!.mainColor, "#14532d", "the other settings are untouched");
  assert.equal(S.invoiceLogoUrl(await stored()), `/api/books/${ENTITY}/files/${first.path}`);
  assert.ok((await S.invoiceLogo(await stored()))?.equals(makePng(240, 60)));

  // Saving the settings keeps the logo; a new logo replaces the file.
  await S.saveInvoiceSettings(ENTITY, { hideCompanyName: true, logoSize: "large", dueDays: 3 });
  assert.equal((await stored()).invoiceSettings!.logo!.path, first.path);
  const second = (await S.setInvoiceLogo(ENTITY, fileOf(makePng(100, 100), "new.png"))).invoiceSettings!.logo!;
  assert.notEqual(second.path, first.path);
  assert.equal(onDisk(first.path), false, "the replaced file is deleted");
  assert.ok(onDisk(second.path));

  // The PDF of an invoice carries it.
  const inv = await B.createInvoice(ENTITY, { customer: { type: "other", name: "PT Pelanggan Contoh" }, date: "2026-11-20", currency: "IDR", fxRate: 1, lines: [{ description: "Advisory", qty: 1, unitPrice: 1_000_000, accountId: revenue().id, taxCode: "ppn" }] });
  const pdf = await S.invoicePdf(await stored(), inv);
  assert.match(pdf.toString("latin1"), /\/Subtype \/Image/);

  // Reset keeps the logo; removing it deletes the file and shows the name again.
  await S.resetInvoiceSettings(ENTITY, "user-1");
  assert.deepEqual(Object.keys((await stored()).invoiceSettings!).sort(), ["logo", "updatedAt", "updatedByUserId"]);
  await S.saveInvoiceSettings(ENTITY, { hideCompanyName: true });
  await S.removeInvoiceLogo(ENTITY, "user-1");
  const s = (await stored()).invoiceSettings!;
  assert.equal(s.logo, undefined);
  assert.equal(s.hideCompanyName, undefined);
  assert.equal(onDisk(second.path), false);
  assert.equal(await S.invoiceLogo(await stored()), undefined);
  assert.doesNotMatch((await S.invoicePdf(await stored(), inv)).toString("latin1"), /\/Subtype \/Image/);
});

test("store: a logo file that went missing or bad is left out of the PDF instead of breaking it", async () => {
  await S.setInvoiceLogo(ENTITY, fileOf(makePng(50, 50), "ok.png"));
  const e = await stored();
  const key = e.invoiceSettings!.logo!.path;
  const { writeFileSync, chmodSync } = await import("node:fs");
  const full = path.join(DIR, "files", key);
  chmodSync(full, 0o644);
  writeFileSync(full, "no longer an image");
  assert.equal(await S.invoiceLogo(e), undefined);
  rmSync(full);
  assert.equal(await S.invoiceLogo(e), undefined);
  await S.removeInvoiceLogo(ENTITY);
});
