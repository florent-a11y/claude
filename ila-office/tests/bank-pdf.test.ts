import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBalances, detectPdfPreset, findLabel, parseBankPdf, toNumber, type PdfPage, type PdfToken } from "../lib/bank-pdf";

// Synthetic statements laid out like the real e-statements (positions in points); every name and figure is fictional.
const tok = (x: number, s: string, w = s.length * 5, h = 8): PdfToken => ({ x, y: 0, w, h, s });
function page(number: number, lines: Array<[number, PdfToken[]]>, width = 595, height = 842): PdfPage {
  return { number, width, height, lines: lines.map(([y, tokens]) => ({ y, tokens: tokens.map((t) => ({ ...t, y })), text: tokens.map((t) => t.s).join(" ") })) };
}
const sum = (rows: Array<{ amount: number }>, sign: 1 | -1) => Math.round(rows.filter((r) => Math.sign(r.amount) === sign).reduce((s, r) => s + Math.abs(r.amount), 0) * 100) / 100;

const bcaHeader: [number, PdfToken[]] = [238, [tok(33, "TANGGAL", 40), tok(164, "KETERANGAN", 55), tok(308, "CBG", 17), tok(380, "MUTASI", 31), tok(501, "SALDO", 28)]];
const bcaTop: Array<[number, PdfToken[]]> = [
  [28, [tok(223, "REKENING GIRO", 148)]], [95, [tok(324, "HALAMAN", 41), tok(417, ":", 2), tok(436, "1 / 2")]],
  [111, [tok(324, "PERIODE", 36), tok(417, ":", 2), tok(435, "DESEMBER", 45), tok(482, "2025", 20)]], [128, [tok(324, "NO. REKENING", 60), tok(417, ":", 2), tok(435, "7703001122", 50)]],
  [186, [tok(25, "•"), tok(34, "Apabila nasabah tidak melakukan sanggahan", 220), tok(306, "BCA berhak setiap saat melakukan koreksi", 250)]], bcaHeader,
];
const BCA_PAGES: PdfPage[] = [
  page(1, [...bcaTop,
    [259, [tok(45, "01/12", 18), tok(89, "SALDO AWAL", 48), tok(521, "10,000,000.00", 48)]],
    [273, [tok(45, "01/12", 18), tok(89, "KARTU KREDIT", 50), tok(194, "MID:0011", 55), tok(308, "0960", 19), tok(392, "1,500,000.00", 45), tok(517, "11,500,000.00", 52)]],
    [285, [tok(194, "DEMO MERCHANT HO", 60)]],
    [323, [tok(44, "02/12", 20), tok(89, "BI-FAST DB", 40), tok(194, "BIF TRANSFER KE", 60), tok(395, "250,000.00", 42), tok(442, "DB", 10)]],
    [335, [tok(194, "008", 14)]], [347, [tok(194, "AGUS DEMO", 40)]],
    [361, [tok(44, "02/12", 20), tok(89, "BI-FAST DB", 40), tok(194, "BIF BIAYA TXN KE", 60), tok(404, "2,500.00", 33), tok(442, "DB", 10), tok(521, "11,247,500.00", 48)]],
    [800, [tok(400, "Bersambung ke halaman berikut", 110)]],
  ]),
  page(2, [...bcaTop,
    [259, [tok(45, "31/12", 18), tok(89, "BIAYA ADM", 40), tok(399, "30,000.00", 38), tok(442, "DB", 10), tok(514, "11,217,500.00", 55)]],
    [454, [tok(208, "SALDO AWAL", 48), tok(265, ":", 2), tok(320, "10,000,000.00", 48)]],
    [466, [tok(208, "MUTASI CR", 40), tok(265, ":", 2), tok(316, "1,500,000.00", 52), tok(408, "1", 9)]],
    [479, [tok(208, "MUTASI DB", 40), tok(265, ":", 2), tok(314, "282,500.00", 55), tok(407, "3", 9)]],
    [491, [tok(208, "SALDO AKHIR", 48), tok(265, ":", 2), tok(313, "11,217,500.00", 55)]],
  ]),
];

const BNI_PAGES: PdfPage[] = [page(1, [
  [154, [tok(274, "ACCOUNT STATEMENT", 160)]], [199, [tok(230, "Account No.", 60), tok(300, ":"), tok(308, "1961000111", 50)]],
  [300, [tok(45, "Posting Date", 62), tok(145, "Effective Date", 66), tok(245, "Branch", 34), tok(296, "Journal", 36), tok(359, "Transaction Description", 115), tok(516, "Amount", 38), tok(576, "DB/CR", 32), tok(625, "Balance", 38)]],
  [320, [tok(164, "Ledger Balance:", 73), tok(625, "5,000,000.00", 70)]],
  [345, [tok(235, "TRANSACTI", 57)]], [351, [tok(337, "TRANSFER KE | BILL PAYMENT", 150)]],
  [363, [tok(23, "15/09/2026 16.23.34", 92), tok(133, "15/09/2026 16.23.34", 92), tok(298, "038339", 33), tok(337, "(MPN G2) NO", 88), tok(530, "15,000.00", 44), tok(530, "15,000.00", 44), tok(588, "D", 7), tok(625, "4,985,000.00", 70)]],
  [369, [tok(240, "BANKING", 45)]], [374, [tok(337, ":0424", 40)]],
  [432, [tok(23, "30/09/2026 08.00.00", 92), tok(133, "30/09/2026 08.00.00", 92), tok(298, "951087", 33), tok(337, "JASA GIRO", 60), tok(524, "100,000.00", 50), tok(555, "0.00", 19), tok(588, "K", 7), tok(625, "5,085,000.00", 70)]],
  [438, [tok(242, "BRANCH", 42)]],
  [470, [tok(23, "30/09/2026 08.00.00", 92), tok(133, "30/09/2026 08.00.00", 92), tok(298, "951087", 33), tok(337, "BY ADMINISTRASI", 84), tok(530, "10,000.00", 44), tok(588, "D", 7)]],
  [520, [tok(167, "Ending Balance", 70), tok(240, ":"), tok(604, "5,075,000.00", 70)]],
  [540, [tok(186, "Total Debet", 52), tok(240, ":"), tok(260, "2", 6), tok(350, "25,000.00", 58)]],
], 708, 842)];

const briHeader: Array<[number, PdfToken[]]> = [
  [33, [tok(458, "LAPORAN TRANSAKSI FINANSIAL", 187)]], [223, [tok(34, "No. Rekening", 48), tok(116, ":"), tok(125, "461200011122", 65)]],
  [323, [tok(37, "Tanggal Transaksi", 64), tok(170, "Uraian Transaksi", 59), tok(305, "Teller", 20), tok(382, "Debet", 21), tok(483, "Kredit", 21), tok(580, "Saldo", 19)]],
  [332, [tok(38, "Transaction Date", 60), tok(157, "Transaction Description", 83), tok(301, "User ID", 27), tok(381, "Debit", 19), tok(481, "Credit", 21), tok(575, "Balance", 27)]],
];
const BRI_PAGES: PdfPage[] = [page(1, [...briHeader,
  [352, [tok(38, "01/09/25 15:42:03", 62), tok(110, "IBIZ PT DEMO TO BUDI", 150), tok(299, "8890405", 29), tok(398, "2,400,000.00", 44), tok(522, "0.00", 15), tok(587, "7,600,000.00", 48)]],
  [373, [tok(38, "12/09/25 13:00:40", 62), tok(110, "Transfer BI-Fast ke PT BANK DEMO", 150), tok(299, "8890406", 29), tok(404, "500,000.00", 37), tok(522, "0.00", 15), tok(587, "7,100,000.00", 48)]],
  [382, [tok(110, "0220215817949 - Wayan Demo", 120)]],
  [403, [tok(38, "15/09/25 23:59:59", 62), tok(110, "Interest on Account", 70), tok(427, "0.00", 15), tok(508, "5,276.00", 29), tok(587, "7,105,276.00", 48)]],
  [430, [tok(86, "Saldo Awal", 40), tok(218, "Total Transaksi Debet", 80), tok(373, "Total Transaksi Kredit", 80), tok(543, "Saldo Akhir", 40)]],
  [448, [tok(117, "10,000,000.00", 51), tok(275, "2,900,000.00", 51), tok(445, "5,276.00", 31), tok(578, "7,105,276.00", 51)]],
  [795, [tok(590, "Created By IBBIZ", 65)]],
], 680, 842)];

const cimbTop: Array<[number, PdfToken[]]> = [
  [69, [tok(412, "Laporan Transaksi", 128)]],
  [191, [tok(339, "Periode", 33), tok(429, ":", 3), tok(441, "01", 10), tok(453, "SEP", 15), tok(471, "2026", 21), tok(494, "-", 3), tok(499, "30", 10), tok(512, "SEP", 15), tok(530, "2026", 21)]],
  [257, [tok(16, "No. Rekening / Account Number", 130), tok(177, ":", 2), tok(188, "800200110022", 62)]],
  [321, [tok(17, "Tgl.", 13), tok(32, "Txn", 14), tok(76, "Tgl.", 13), tok(91, "Valuta", 24), tok(147, "Uraian", 25), tok(174, "Transaksi", 36), tok(303, "No.", 13), tok(318, "Cek/BG", 28), tok(386, "Debet", 23), tok(462, "Kredit", 23), tok(543, "Saldo", 21)]],
];
const cimbFooter: Array<[number, PdfToken[]]> = [[700, [tok(40, "Terima kasih atas kesetiaan dan kepercayaan Anda bersama CIMB Niaga", 300)]], [720, [tok(300, "Halaman / Page :", 70), tok(380, "1/2", 15)]]];
const CIMB_PAGES: PdfPage[] = [
  page(1, [...cimbTop,
    [351, [tok(147, "SALDO AWAL", 40), tok(532, "1,000,000.00", 43)]],
    [365, [tok(147, "OVERBOOKING FROM CA", 70)]], [373, [tok(147, "BizChannel TRF FR DEMO CLIENT", 120)]],
    [377, [tok(17, "01/09", 16), tok(76, "01/09", 16), tok(455, "3,630,000.00", 36), tok(532, "4,630,000.00", 42)]],
    [381, [tok(147, "Invoice 12", 35)]], [390, [tok(147, "260901BI0001", 54)]],
    [403, [tok(147, "OVERBOOKING TO CA", 70)]], [411, [tok(147, "BizChannel TRF TO PT DEMO VENDOR", 120)]],
    [419, [tok(17, "01/09", 16), tok(76, "01/09", 16), tok(147, "9595800200110022 BANK DEMO", 110), tok(379, "2,500,000.00", 36), tok(532, "2,130,000.00", 42)]],
    [428, [tok(147, "260901BI0002", 54)]],
    [462, [tok(147, "TRANSACTION FEE REBATE", 80)]],
    [466, [tok(17, "02/09", 16), tok(76, "02/09", 16), tok(461, "6,500.00", 24), tok(532, "2,136,500.00", 42)]],
    [470, [tok(147, "260902VMIR0001", 56)]],
    ...cimbFooter,
  ], 612, 792),
  page(2, [...cimbTop, [351, [tok(17, "Total", 15), tok(377, "2,500,000.00", 39), tok(454, "3,636,500.00", 39)]], [366, [tok(147, "SALDO AKHIR", 40), tok(532, "2,136,500.00", 43)]], ...cimbFooter], 612, 792),
];

const MANDIRI_PAGES: PdfPage[] = [page(1, [
  [28, [tok(32, "Account Statement", 90)]],
  [130, [tok(31, "Account No.", 43), tok(213, "Account Name", 52)]], [147, [tok(31, "1750001112223", 58), tok(213, "PT DEMO", 40)]],
  [210, [tok(31, "Opening Balance", 60), tok(213, "No. of Debit", 43), tok(395, "Total Amount Debited", 80)]], [226, [tok(31, "1,000,000.00", 56), tok(213, "2", 4), tok(395, "25,000.00", 36)]],
  [248, [tok(31, "Closing Balance", 60), tok(213, "No. of Credit", 45), tok(395, "Total Amount Credited", 80)]], [263, [tok(31, "995,000.00", 56), tok(213, "1", 4), tok(395, "20,000.00", 36)]],
  [292, [tok(35, "Posting Date", 49), tok(120, "Remark", 29), tok(240, "Reference No.", 54), tok(362, "Debit", 20), tok(449, "Credit", 23), tok(533, "Balance", 31)]],
  [312, [tok(34, "31 Aug 2026,", 48)]], [317, [tok(239, "-", 3), tok(350, "25,000.00", 36), tok(460, "0.00", 16), tok(508, "975,000.00", 56)]], [321, [tok(34, "23:59:00", 31), tok(119, "Biaya Adm", 40)]],
  [360, [tok(34, "31 Aug 2026,", 48)]], [365, [tok(239, "REF1", 20), tok(370, "0.00", 16), tok(440, "20,000.00", 36), tok(508, "995,000.00", 56)]], [369, [tok(34, "23:59:00", 31), tok(119, "Bunga", 23)]],
  [799, [tok(187, "For further questions, visit Kopra by Mandiri Help Center: koprabymandiri.com/help", 220)]],
])];

test("helpers: numbers and header labels", () => {
  assert.equal(toNumber("1,234,567.89"), 1234567.89);
  assert.equal(toNumber("(1,000.00)"), -1000);
  assert.equal(toNumber("4770000.00"), 4770000);
  assert.equal(toNumber("12/09"), null);
  assert.equal(toNumber("REF1"), null);
  const header = { y: 0, text: "", tokens: [tok(33, "T"), tok(38, "ANG", 18), tok(57, "GAL", 16), tok(164, "KETERANGAN", 55)] };
  assert.deepEqual(findLabel(header, "Tanggal"), { x: 33, right: 73, center: 53 });
  assert.equal(findLabel(header, "Saldo"), undefined);
});

test("detects each bank from the statement text", () => {
  assert.equal(detectPdfPreset(BCA_PAGES), "pdf-bca");
  assert.equal(detectPdfPreset(BNI_PAGES), "pdf-bni");
  assert.equal(detectPdfPreset(BRI_PAGES), "pdf-bri");
  assert.equal(detectPdfPreset(CIMB_PAGES), "pdf-cimb");
  assert.equal(detectPdfPreset(MANDIRI_PAGES), "pdf-mandiri");
  assert.equal(detectPdfPreset([page(1, [[100, [tok(10, "Some other bank", 60)]]])]), "pdf-generic");
});

test("BCA: dd/mm dates take the period's year, DB marks debits, balance only on the last line of a day", () => {
  const r = parseBankPdf(BCA_PAGES);
  assert.equal(r.preset, "pdf-bca");
  assert.deepEqual(r.rows.map((x) => [x.date, x.amount, x.balance]), [
    ["2025-12-01", 1_500_000, 11_500_000], ["2025-12-02", -250_000, undefined], ["2025-12-02", -2_500, 11_247_500], ["2025-12-31", -30_000, 11_217_500],
  ]);
  assert.equal(r.rows[0].description, "KARTU KREDIT MID:0011 DEMO MERCHANT HO");
  assert.equal(r.rows[1].description, "BI-FAST DB BIF TRANSFER KE 008 AGUS DEMO");
  assert.equal(r.opening, 10_000_000);
  assert.equal(r.closing, 11_217_500);
  assert.equal(r.accountNumber, "7703001122");
  assert.deepEqual([r.periodFrom, r.periodTo], ["2025-12-01", "2025-12-31"]);
  assert.deepEqual(r.errors, []);
});

test("BNI: description wraps around the date line, D/K marker gives the sign, duplicated amount runs are ignored", () => {
  const r = parseBankPdf(BNI_PAGES);
  assert.equal(r.preset, "pdf-bni");
  assert.deepEqual(r.rows.map((x) => [x.date, x.amount, x.balance, x.reference]), [
    ["2026-09-15", -15_000, 4_985_000, "038339"], ["2026-09-30", 100_000, 5_085_000, "951087"], ["2026-09-30", -10_000, undefined, "951087"],
  ]);
  assert.equal(r.rows[0].description, "TRANSFER KE | BILL PAYMENT (MPN G2) NO :0424");
  assert.equal(r.rows[1].description, "JASA GIRO");
  assert.equal(r.opening, 5_000_000);
  assert.equal(r.closing, 5_075_000);
  assert.deepEqual(r.errors, []);
});

test("BRI: debit and credit columns, wrapped description continues below, summary block is not a transaction", () => {
  const r = parseBankPdf(BRI_PAGES);
  assert.equal(r.preset, "pdf-bri");
  assert.deepEqual(r.rows.map((x) => [x.date, x.amount, x.balance, x.reference]), [
    ["2025-09-01", -2_400_000, 7_600_000, "8890405"], ["2025-09-12", -500_000, 7_100_000, "8890406"], ["2025-09-15", 5_276, 7_105_276, undefined],
  ]);
  assert.equal(r.rows[1].description, "Transfer BI-Fast ke PT BANK DEMO 0220215817949 - Wayan Demo");
  assert.equal(r.opening, 10_000_000);
  assert.equal(r.closing, 7_105_276);
  assert.equal(r.accountNumber, "461200011122");
  assert.deepEqual(r.errors, []);
});

test("CIMB Niaga: year from the period line, debit/credit by column, totals and closing balance are not rows", () => {
  const r = parseBankPdf(CIMB_PAGES);
  assert.equal(r.preset, "pdf-cimb");
  assert.deepEqual(r.rows.map((x) => [x.date, x.amount, x.balance]), [["2026-09-01", 3_630_000, 4_630_000], ["2026-09-01", -2_500_000, 2_130_000], ["2026-09-02", 6_500, 2_136_500]]);
  assert.equal(r.rows[0].description, "OVERBOOKING FROM CA BizChannel TRF FR DEMO CLIENT Invoice 12 260901BI0001");
  assert.equal(r.rows[1].description, "OVERBOOKING TO CA BizChannel TRF TO PT DEMO VENDOR 9595800200110022 BANK DEMO 260901BI0002");
  assert.equal(sum(r.rows, 1), 3_636_500);
  assert.equal(sum(r.rows, -1), 2_500_000);
  assert.equal(r.opening, 1_000_000);
  assert.equal(r.closing, 2_136_500);
  assert.deepEqual([r.periodFrom, r.periodTo], ["2026-09-01", "2026-09-30"]);
  assert.deepEqual(r.errors, []);
});

test("Mandiri Kopra: a row spans three text lines; the reference dash means no reference", () => {
  const r = parseBankPdf(MANDIRI_PAGES);
  assert.equal(r.preset, "pdf-mandiri");
  assert.deepEqual(r.rows.map((x) => [x.date, x.amount, x.balance, x.reference, x.description]), [["2026-08-31", -25_000, 975_000, undefined, "Biaya Adm"], ["2026-08-31", 20_000, 995_000, "REF1", "Bunga"]]);
  assert.equal(r.opening, 1_000_000);
  assert.equal(r.closing, 995_000);
  assert.deepEqual(r.errors, []);
});

test("forcing a preset and the generic fallback", () => {
  const forced = parseBankPdf(BRI_PAGES, { preset: "pdf-generic" });
  assert.equal(forced.preset, "pdf-generic");
  assert.deepEqual(forced.rows.map((x) => [x.date, x.amount, x.balance]), [["2025-09-01", -2_400_000, 7_600_000], ["2025-09-12", -500_000, 7_100_000], ["2025-09-15", 5_276, 7_105_276]]);
  const simple = parseBankPdf([page(1, [
    [100, [tok(30, "Date"), tok(120, "Description", 50), tok(420, "Amount", 30), tok(520, "Balance", 35)]],
    [120, [tok(30, "2026-03-01", 50), tok(120, "Opening balance", 60), tok(520, "1,000.00", 40)]],
    [140, [tok(30, "2026-03-02", 50), tok(120, "Card payment", 60), tok(420, "250.00", 30), tok(520, "750.00", 40)]],
    [160, [tok(30, "2026-03-03", 50), tok(120, "Salary", 30), tok(420, "3,000.00", 40), tok(520, "3,750.00", 40)]],
    [180, [tok(30, "2026-03-04", 50), tok(120, "Fee", 30), tok(420, "10.00", 25), tok(470, "DB", 10)]],
  ])]);
  assert.equal(simple.preset, "pdf-generic");
  assert.deepEqual(simple.rows.map((x) => [x.date, x.amount, x.balance]), [["2026-03-02", -250, 750], ["2026-03-03", 3000, 3750], ["2026-03-04", -10, undefined]]);
});

test("running-balance check flips a lone row with the wrong sign and reports gaps it cannot explain", () => {
  const rows = [{ date: "2026-01-02", description: "a", amount: 100, balance: 900 }, { date: "2026-01-03", description: "b", amount: 50, balance: 950 }, { date: "2026-01-04", description: "c", amount: 10, balance: 900 }];
  const warnings = checkBalances(rows, 1000);
  assert.equal(rows[0].amount, -100);
  assert.equal(rows[1].amount, 50);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /2026-01-04/);
});

test("a scanned PDF (no text layer) is flagged", () => {
  const r = parseBankPdf([page(1, []), page(2, [[100, [tok(10, "BCA")]]])]);
  assert.equal(r.scanned, true);
  assert.equal(r.rows.length, 0);
});
