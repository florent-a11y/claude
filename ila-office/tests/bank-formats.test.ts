import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPreset, excelSerialToISO, filterCurrency, parseAnyDate, presetById } from "../lib/bank-formats";
import { parseCSV } from "../lib/csv";

// Synthetic fixtures shaped like the real exports (fictional names and amounts).

const OCBC_GRID = [
  ["Account No :", "", "167800000000 - IDR", "", "", "Opening Balance :", "0.00"],
  ["Account Name :", "", "PT CONTOH BALI", "", "", "Closing Balance :", "6,913,344.56"],
  [],
  ["Transaction Date", "Value Date", "Reference No.", "Cheque No.", "Description", "", "Debit", "Credit", "Balance"],
  ["20/11/2026 14:29:44", "20/11/2026", "2088000820025730", "", "014 - Transfer Masuk 2470 014 PT PELANGGAN SATU", "", "", "24,225,000.00", "24,225,000.00"],
  ["22/11/2026 14:45:34", "22/11/2026", "233261445017", "", "004 - Pemindahbukuan (OVERBOOKING SI) VENDOR A/Payment INV 0069", "", "18,113,537.00", "", "6,111,463.00"],
  ["25/11/2026 00:00:00", "25/11/2026", "2544000500000003", "", "160 - Bunga Rekening", "", "", "8,526.00", "6,119,989.00"],
  ["16:10:47", "", "", "", "continuation line of a hand-edited sheet", "", "", "", ""],
  ["PERIOD :", "10/07/2026 - 05/01/2027"],
];

const MANDIRI_CSV = [
  "AccountNo;Ccy;PostDate;Remarks;AdditionalDesc;Credit Amount;Debit Amount;Close Balance",
  "1610000000000;IDR;16 March 2026 09:34:53;Protein                              MCM InhouseTrf  DARI PT CONTOH Transfer Fee         Protein99102;Protein   MCM InhouseTrf;2646000.00;0.00;2646000",
  "1610000000000;IDR;31 March 2026 14:54:32;20260331BMRIIDJA010O9931008352           BNIAIDJA/BUDI Gaji99102;20260331BMRIIDJA010O9931008352 BNIAIDJA/BUDI Gaji99102;0.00;4000000.00;98646000",
  "1610000000000;IDR;31 March 2026 23:59:00;                                         Biaya Adm 16161;  Biaya Adm 16161;0.00;13000.00;23527700",
  "1610000000000;IDR;31 March 2026 23:59:00;Bunga 16161;Bunga 16161;1456.79;0.00;23529156.79",
].join("\r\n");

const BNI_GRID = [
  ["", "", "Account Information"], ["", "ACCOUNT STATEMENT"], ["", "", "PT CONTOH LOMBOK", "", "", "", "", "Account No.", "", "", "", "", "", "", "", "", "", "2177000000 / PT CONTOH"],
  ["", "", "", "Posting Date", "Effective Date", "", "", "", "Branch", "", "", "", "", "", "Journal ", "", "", "", "Transaction Description", "", "", "", "", "Amount", "", "", "", "", "DB/CR", "", "Balance"],
  [], ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "-50,000.00"],
  ["", "46129.4732", "", "", "", "46129.4732", "", "", "", "UNIT E-CHANNEL", "", "", "", "", "192913", "", "", "", "TRANSFER DARI TAMU A", "", "", "", "", "1,069,200.00", "", "", "", "", "K", "", "1,019,200.00"],
  ["", "46132.5130", "", "", "", "46132.5130", "", "", "", "UNIT E-CHANNEL", "", "", "", "", "323574", "", "", "", "BIAYA ADMIN", "", "", "", "", "11,000.00", "", "", "", "", "D", "", "1,008,200.00"],
  ["", "", "Account Information"], ["", "", "", "Posting Date", "Effective Date", "", "", "", "Branch", "", "", "", "", "", "Journal ", "", "", "", "Transaction Description", "", "", "", "", "Amount", "", "", "", "", "DB/CR", "", "Balance"],
  ["", "46140.1000", "", "", "", "46140.1000", "", "", "", "UNIT E-CHANNEL", "", "", "", "", "555555", "", "", "", "TRANSFER KE SUPPLIER", "", "", "", "", "500,000.00", "", "", "", "", "D", "", "508,200.00"],
  ["", "", "", "", "", "", "Total Credit :", "", "", "", "1", "", "1,069,200.00"],
];

const ASPIRE_ES = [
  ["Documento de identidad", "Fecha", "Fecha y hora", "Cantidad", "Divisa", "Descripción", "Referencia del pago", "Saldo corriente", "Tipo de transacción"],
  ["BALANCE-5040314327", "1/4/2026", "01/04/2026 10:43:35.316", "-87883", "IDR", "Se han convertido 88.340,00 IDR a 4,46 EUR", "", "0", "DEBIT"],
  ["BALANCE-3216951482", "22/3/2025", "22/03/2025 22:41:46.697", "88340", "IDR", "Se han convertido 4,97 EUR a 88.340,00 IDR", "INV-1", "88340", "CREDIT"],
  ["BALANCE-9", "23/3/2025", "23/03/2025 10:00:00.000", "12.5", "EUR", "EUR row must be skipped on an IDR account", "", "12.5", "CREDIT"],
];
const ASPIRE_EN = [
  ["ID", "Date", "Date and time", "Amount", "Currency", "Description", "Payment reference", "Running balance", "Payer name", "Beneficiary name", "Merchant"],
  ["X1", "5/9/2026", "05/09/2026 09:00:00.000", "1500000", "IDR", "Transfer", "INV-2026-0007", "1500000", "PT Pelanggan Satu", "", ""],
  ["X2", "6/9/2026", "06/09/2026 09:00:00.000", "-250000", "IDR", "Card payment", "", "1250000", "", "", "Google Workspace"],
];

test("date parser handles every format seen on OCBC, Mandiri, BNI and Aspire exports", () => {
  assert.equal(parseAnyDate("20/11/2026 14:29:44"), "2026-11-20");
  assert.equal(parseAnyDate("16 March 2026 09:34:53"), "2026-03-16");
  assert.equal(parseAnyDate("31 Maret 2026"), "2026-03-31");
  assert.equal(parseAnyDate("01-Apr-26"), "2026-04-01");
  assert.equal(parseAnyDate("1/4/2026"), "2026-04-01");
  assert.equal(parseAnyDate("2026-04-01"), "2026-04-01");
  assert.equal(parseAnyDate("46129.4732"), "2026-04-17");
  assert.equal(excelSerialToISO(45658), "2025-01-01");
  assert.equal(parseAnyDate("16:10:47"), null);
  assert.equal(parseAnyDate("Total"), null);
});

test("OCBC export is detected and parsed, continuation and summary lines are ignored", () => {
  assert.equal(detectPreset(OCBC_GRID, "ocbc_idr.xlsx").id, "ocbc");
  const ex = presetById("ocbc")!.extract(OCBC_GRID);
  assert.equal(ex.headerRow, 3);
  assert.deepEqual(ex.rows.map((r) => [r.date, r.amount, r.reference]), [["2026-11-20", 24_225_000, "2088000820025730"], ["2026-11-22", -18_113_537, "233261445017"], ["2026-11-25", 8526, "2544000500000003"]]);
  assert.equal(ex.rows[1].balance, 6_111_463);
  assert.equal(ex.errors.length, 0);
});

test("Mandiri Kopra CSV (semicolon) is detected and parsed with collapsed remarks and journal reference", () => {
  const grid = parseCSV(MANDIRI_CSV);
  assert.equal(grid[0].length, 8, "semicolon delimiter detected");
  assert.equal(detectPreset(grid, "Acc_Statement_1610000000000_2026-03-01_2026-03-31.csv").id, "mandiri");
  const ex = presetById("mandiri")!.extract(grid);
  assert.equal(ex.rows.length, 4);
  assert.deepEqual(ex.rows.map((r) => r.amount), [2_646_000, -4_000_000, -13_000, 1456.79]);
  assert.equal(ex.rows[0].description, "Protein MCM InhouseTrf DARI PT CONTOH Transfer Fee Protein99102");
  assert.equal(ex.rows[1].reference, "20260331BMRIIDJA010O9931008352");
  assert.equal(ex.rows[2].description, "Biaya Adm 16161");
  assert.equal(ex.rows[0].currency, "IDR");
});

test("BNI xls layout (merged cells, serial dates, D/K, repeated page headers) is parsed", () => {
  assert.equal(detectPreset(BNI_GRID, "BNI-2177000000_2026-04.xls").id, "bni");
  const ex = presetById("bni")!.extract(BNI_GRID);
  assert.deepEqual(ex.rows.map((r) => [r.date, r.amount, r.description, r.reference, r.balance]), [
    ["2026-04-17", 1_069_200, "TRANSFER DARI TAMU A", "192913", 1_019_200],
    ["2026-04-20", -11_000, "BIAYA ADMIN", "323574", 1_008_200],
    ["2026-04-28", -500_000, "TRANSFER KE SUPPLIER", "555555", 508_200],
  ]);
  assert.equal(ex.errors.length, 0);
});

test("Aspire exports in Spanish and English are parsed and foreign-currency rows filtered", () => {
  assert.equal(detectPreset(ASPIRE_ES, "statement_116551738_IDR_2025-01-01_2026-01-04.xlsx").id, "aspire");
  const es = presetById("aspire")!.extract(ASPIRE_ES);
  assert.equal(es.rows.length, 3);
  assert.deepEqual(es.rows.map((r) => [r.date, r.amount, r.currency]), [["2026-04-01", -87883, "IDR"], ["2025-03-22", 88340, "IDR"], ["2025-03-23", 12.5, "EUR"]]);
  assert.equal(es.rows[1].reference, "INV-1");
  const f = filterCurrency(es.rows, "IDR");
  assert.equal(f.rows.length, 2); assert.equal(f.dropped, 1);
  assert.equal(detectPreset(ASPIRE_EN, "x.xlsx").id, "aspire");
  const en = presetById("aspire")!.extract(ASPIRE_EN);
  assert.deepEqual(en.rows.map((r) => [r.date, r.amount, r.reference, r.balance, r.description]), [
    ["2026-09-05", 1_500_000, "INV-2026-0007", 1_500_000, "Transfer · PT Pelanggan Satu"],
    ["2026-09-06", -250_000, "X2", 1_250_000, "Card payment · Google Workspace"],
  ]);
});

test("an unknown layout falls back to generic", () => {
  assert.equal(detectPreset([["Tanggal", "Keterangan", "Jumlah"], ["01/09/2026", "Setoran", "100000"]], "random.csv").id, "generic");
});
