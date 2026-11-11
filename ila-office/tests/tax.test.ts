import { test } from "node:test";
import assert from "node:assert/strict";
import { PTKP_STATUSES, type Entity } from "../lib/types";
import { PTKP_TABLE, ptkpAnnual, TER_CATEGORY, BPJS_JP } from "../lib/tax/constants";
import { pph21Annual, pph21Monthly, terCategoryOf, terRate, progressiveTax } from "../lib/tax/pph21";
import { computeBpjs } from "../lib/tax/bpjs";
import { computeWithholding, npwp16, nitkuOf, formatTaxId, bupotKind, coretaxRows, coretaxXml, coretaxPayrollXml, isFinal } from "../lib/tax/withholding";
import { buildPpnRegister } from "../lib/tax/ppn";
import { computeCit, taxByRegime } from "../lib/tax/cit";
import { generateObligations, obligationTypesFor, rollToWorkingDay } from "../lib/tax/calendar";
import { isWeekend } from "../lib/dates";
import { buildAccounts } from "../lib/coa";

test("PTKP table matches PMK 101/2016", () => {
  assert.equal(ptkpAnnual("TK/0"), 54_000_000);
  assert.equal(ptkpAnnual("K/0"), 58_500_000);
  assert.equal(ptkpAnnual("K/1"), 63_000_000);
  assert.equal(ptkpAnnual("K/3"), 72_000_000);
  assert.equal(ptkpAnnual("TK/3"), 67_500_000);
  for (const s of PTKP_STATUSES) assert.equal(ptkpAnnual(s), PTKP_TABLE[s], s);
});

test("TER category mapping (PP 58/2023)", () => {
  assert.equal(terCategoryOf("TK/0"), "A");
  assert.equal(terCategoryOf("TK/1"), "A");
  assert.equal(terCategoryOf("K/0"), "A");
  assert.equal(terCategoryOf("TK/2"), "B");
  assert.equal(terCategoryOf("K/2"), "B");
  assert.equal(terCategoryOf("K/3"), "C");
  assert.equal(Object.keys(TER_CATEGORY).length, 8);
});

test("TER monthly withholding: 10 M gross TK/0 → 2% = 200,000; 5 M → nil", () => {
  const r = pph21Monthly({ grossMonthly: 10_000_000, ptkpStatus: "TK/0", hasNpwp: true });
  assert.equal(r.category, "A");
  assert.equal(r.rate, 0.02);
  assert.equal(r.amount, 200_000);
  assert.equal(pph21Monthly({ grossMonthly: 5_000_000, ptkpStatus: "TK/0", hasNpwp: true }).amount, 0);
  assert.equal(terRate("B", 6_200_000), 0);
  assert.equal(terRate("C", 2_000_000_000), 0.34);
  assert.equal(terRate("A", 15_000_000), 0.06);
});

test("annual progressive true-up for 15 M/month TK/0 over 12 months", () => {
  // Gross 180 M − biaya jabatan (5% = 9 M, capped 6 M) = 174 M; − PTKP 54 M = 120 M taxable.
  // Tax: 60 M × 5% = 3 M + 60 M × 15% = 9 M → 12 M. TER Jan–Nov: 15 M → 6% = 900,000 × 11 = 9.9 M. December due 2.1 M.
  const monthly = pph21Monthly({ grossMonthly: 15_000_000, ptkpStatus: "TK/0", hasNpwp: true });
  assert.equal(monthly.amount, 900_000);
  const withheld = monthly.amount * 11;
  const a = pph21Annual({ grossAnnual: 15_000_000 * 12, ptkpStatus: "TK/0", hasNpwp: true, employeeJhtJp: 0, months: 12, withheldToDate: withheld });
  assert.equal(a.biayaJabatan, 6_000_000);
  assert.equal(a.taxableIncome, 120_000_000);
  assert.equal(a.annualTax, 12_000_000);
  assert.equal(a.due, 2_100_000);
  assert.equal(progressiveTax(600_000_000).tax, 3_000_000 + 28_500_000 + 62_500_000 + 30_000_000);
  // rounding down to thousands
  assert.equal(pph21Annual({ grossAnnual: 60_123_456, ptkpStatus: "TK/0", hasNpwp: true, employeeJhtJp: 0, months: 12, withheldToDate: 0 }).taxableIncome, 3_117_000);
});

test("no NPWP → 120% of PPh 21", () => {
  assert.equal(pph21Monthly({ grossMonthly: 10_000_000, ptkpStatus: "TK/0", hasNpwp: false }).amount, 240_000);
  const a = pph21Annual({ grossAnnual: 180_000_000, ptkpStatus: "TK/0", hasNpwp: false, employeeJhtJp: 0, months: 12, withheldToDate: 0 });
  assert.equal(a.annualTax, 14_400_000);
});

test("BPJS contributions respect the Kesehatan and JP wage caps", () => {
  const all = { kesehatan: true, jht: true, jp: true, jkk: true, jkm: true, jkkRiskClass: 1 as const };
  const r = computeBpjs(20_000_000, all);
  assert.equal(r.employer.bpjsKesehatan, 480_000); // 4% × 12 M cap
  assert.equal(r.employee.bpjsKesehatan, 120_000); // 1% × 12 M cap
  assert.equal(r.employer.jht, 740_000); // 3.7% × 20 M
  assert.equal(r.employee.jht, 400_000);
  assert.equal(r.employer.jp, Math.round(BPJS_JP.wageCap * 0.02)); // capped
  assert.equal(r.employee.jp, Math.round(BPJS_JP.wageCap * 0.01));
  assert.equal(r.employer.jkk, 48_000);
  assert.equal(r.employer.jkm, 60_000);
  assert.equal(r.taxableEmployerPremiums, 480_000 + 48_000 + 60_000);
  const none = computeBpjs(20_000_000, { ...all, kesehatan: false, jht: false, jp: false, jkk: false, jkm: false });
  assert.equal(none.employer.total + none.employee.total, 0);
  assert.equal(computeBpjs(5_000_000, { ...all, jkkRiskClass: 5 }).employer.jkk, 87_000);
});

test("PPh 23 services 2%, doubled without NPWP; PPh 4(2) rent 10%; PPh 26 treaty", () => {
  const a = computeWithholding({ type: "pph23", objectCode: "24-104-03", baseAmount: 10_000_000, hasNpwp: true });
  assert.equal(a.rate, 0.02);
  assert.equal(a.taxAmount, 200_000);
  const b = computeWithholding({ type: "pph23", objectCode: "24-104-03", baseAmount: 10_000_000, hasNpwp: false });
  assert.equal(b.rate, 0.04);
  assert.equal(b.taxAmount, 400_000);
  assert.ok(b.noNpwpSurchargeApplied);
  const rent = computeWithholding({ type: "pph4_2", objectCode: "28-403-01", baseAmount: 50_000_000, hasNpwp: false });
  assert.equal(rent.taxAmount, 5_000_000);
  assert.ok(rent.final);
  const div = computeWithholding({ type: "pph23", objectCode: "24-100-01", baseAmount: 1_000_000, hasNpwp: true });
  assert.equal(div.taxAmount, 150_000);
  const p26 = computeWithholding({ type: "pph26", objectCode: "27-104-01", baseAmount: 100_000_000, hasNpwp: false });
  assert.equal(p26.taxAmount, 20_000_000);
  const treaty = computeWithholding({ type: "pph26", objectCode: "27-104-01", baseAmount: 100_000_000, hasNpwp: false, treatyRate: 0.1 });
  assert.equal(treaty.taxAmount, 10_000_000);
  assert.ok(treaty.treatyApplied);
  const umkm = computeWithholding({ type: "pph4_2", objectCode: "28-423-01", baseAmount: 200_000_000, hasNpwp: true });
  assert.equal(umkm.taxAmount, 1_000_000);
});

test("SPT Masa PPN summary: output − creditable input", () => {
  const base = { entityId: "e", currency: "IDR", fxRate: 1, amountPaid: 0, createdAt: "", discount: 0 };
  const invoice = { ...base, id: "i1", number: "INV-1", customer: { type: "other" as const, name: "Client" }, date: "2026-03-10", dueDate: "2026-03-13", lines: [{ id: "l", description: "x", qty: 1, unitPrice: 10_000_000, amount: 10_000_000, accountId: "a", taxCode: "ppn" as const }], subtotal: 10_000_000, ppnAmount: 1_100_000, total: 11_100_000, status: "sent" as const };
  const draft = { ...invoice, id: "i2", status: "draft" as const };
  const billLine = { id: "b", description: "y", amount: 5_000_000, accountId: "x", taxCode: "ppn" as const, withholding: "none" as const };
  const bill1 = { ...base, id: "b1", number: "BILL-1", vendor: { type: "other" as const, name: "Vendor" }, date: "2026-03-05", dueDate: "2026-03-20", lines: [billLine], subtotal: 5_000_000, ppnInput: 550_000, withholdingTotal: 0, total: 5_550_000, amountPayable: 5_550_000, status: "sent" as const, fakturNumber: "010.000-26.00000001" };
  const bill2 = { ...bill1, id: "b2", number: "BILL-2", ppnInput: 110_000, fakturNumber: undefined, lines: [{ ...billLine, amount: 1_000_000 }] };
  const { rows, summary } = buildPpnRegister({ period: "2026-03", invoices: [invoice, draft], bills: [bill1, bill2], manual: [] });
  assert.equal(rows.length, 3);
  assert.equal(summary.outputPpn, 1_100_000);
  assert.equal(summary.creditableInputPpn, 550_000);
  assert.equal(summary.nonCreditableInputPpn, 110_000);
  assert.equal(summary.payable, 550_000);
  assert.equal(summary.overpaid, 0);
  const over = buildPpnRegister({ period: "2026-03", invoices: [], bills: [bill1], manual: [], carriedForwardIn: 100_000 });
  assert.equal(over.summary.overpaid, 650_000);
});

test("CIT art. 31E both brackets, normal 22%, final 0.5% and HK two-tier", () => {
  assert.equal(taxByRegime("art_31e", 1_000_000_000, 3_000_000_000).cit, 110_000_000); // 50% × 22%
  // turnover 10 bn: facilitated 4.8/10 × 2 bn = 960 M at 11% = 105.6 M; rest 1.04 bn at 22% = 228.8 M
  assert.equal(taxByRegime("art_31e", 2_000_000_000, 10_000_000_000).cit, 334_400_000);
  assert.equal(taxByRegime("art_31e", 2_000_000_000, 60_000_000_000).cit, 440_000_000);
  assert.equal(taxByRegime("normal_22", 1_000_000_000, 0).cit, 220_000_000);
  assert.equal(taxByRegime("hk_profits_tax", 3_000_000, 0).cit, 165_000 + 165_000);
  assert.equal(taxByRegime("final_0_5", 1_000_000_000, 2_000_000_000).cit, 0);

  // Ledger-driven: final 0.5% on monthly turnover and fiscal reconciliation with a non-deductible expense.
  const accounts = buildAccounts("e", (() => { let i = 0; return () => `a${i++}`; })());
  const sales = accounts.find((a) => a.code === "4-1000")!;
  const bank = accounts.find((a) => a.code === "1-1100")!;
  const fines = accounts.find((a) => a.code === "6-2300")!;
  const rent = accounts.find((a) => a.code === "6-1100")!;
  const pph25 = accounts.find((a) => a.code === "1-1400")!;
  const je = (id: string, date: string, lines: Array<[typeof sales, number, number]>) => ({ id, entityId: "e", number: id, date, period: date.slice(0, 7), memo: "", source: "manual" as const, status: "posted" as const, createdAt: "", lines: lines.map(([a, debit, credit]) => ({ accountId: a.id, accountCode: a.code, debit, credit })) });
  const entries = [
    je("1", "2026-01-15", [[bank, 1_000_000_000, 0], [sales, 0, 1_000_000_000]]),
    je("2", "2026-02-15", [[bank, 1_000_000_000, 0], [sales, 0, 1_000_000_000]]),
    je("3", "2026-02-20", [[fines, 10_000_000, 0], [bank, 0, 10_000_000]]),
    je("4", "2026-03-01", [[rent, 100_000_000, 0], [bank, 0, 100_000_000]]),
    je("5", "2026-03-15", [[pph25, 5_000_000, 0], [bank, 0, 5_000_000]]),
  ];
  const fin = computeCit({ regime: "final_0_5", fiscalYear: 2026, from: "2026-01-01", to: "2026-12-31", accounts, entries });
  assert.equal(fin.turnover, 2_000_000_000);
  assert.equal(fin.finalTax?.total, 10_000_000);
  assert.equal(fin.finalTax?.monthly.length, 2);
  assert.equal(fin.cit, 0);
  const normal = computeCit({ regime: "normal_22", fiscalYear: 2026, from: "2026-01-01", to: "2026-12-31", accounts, entries });
  assert.equal(normal.accountingProfit, 1_890_000_000);
  assert.equal(normal.nonDeductibleTotal, 10_000_000);
  assert.equal(normal.taxableIncome, 1_900_000_000);
  assert.equal(normal.cit, 418_000_000);
  assert.equal(normal.credits.pph25, 5_000_000);
  assert.equal(normal.pph29, 413_000_000);
  assert.equal(normal.nextPph25Monthly, Math.floor(418_000_000 / 12));
});

const entity: Entity = {
  id: "ent", name: "PT Test", legalName: "PT TEST", type: "pt_pma", country: "ID", isOwn: false, baseCurrency: "IDR", fiscalYearStartMonth: 1,
  tax: { regime: "normal_22", pkp: true, ppnRate: 0.11, pph25Monthly: 1_000_000, lkpm: true, payroll: true }, status: "active", createdAt: "",
};

test("calendar generation for a PKP + payroll + LKPM entity", () => {
  const obls = generateObligations(entity, 2026);
  // 9 monthly types (bookkeeping, pph21, pph23, pph26, pph4_2, ppn, pph25, bpjs, payroll) × 12 + 4 LKPM + SPT Badan + GMS
  assert.equal(obls.length, 9 * 12 + 4 + 2);
  assert.equal(new Set(obls.map((o) => o.id)).size, obls.length);
  assert.deepEqual(obligationTypesFor(entity), ["bookkeeping", "pph21", "pph23", "pph26", "pph4_2", "ppn", "pph25", "bpjs", "payroll", "lkpm", "spt_badan", "gms"]);
  for (const o of obls) {
    assert.ok(!isWeekend(o.reportDue), `${o.id} report due on weekend ${o.reportDue}`);
    if (o.paymentDue) assert.ok(!isWeekend(o.paymentDue), `${o.id} payment due on weekend`);
    assert.equal(o.status, "not_started");
    assert.ok(o.generated);
  }
  const apr = obls.find((o) => o.id === "ent:pph21:2026-04")!;
  assert.equal(apr.paymentDue, "2026-05-11"); // 10 May 2026 is a Sunday → Monday
  assert.equal(apr.reportDue, "2026-05-20");
  const ppnJan = obls.find((o) => o.id === "ent:ppn:2026-01")!;
  assert.equal(ppnJan.reportDue, "2026-03-02"); // 28 Feb 2026 is a Saturday → Monday 2 March
  assert.equal(obls.find((o) => o.type === "lkpm" && o.period === "2026-Q3")!.reportDue, "2026-10-12"); // 10 Oct 2026 is a Saturday
  assert.equal(obls.find((o) => o.type === "spt_badan")!.reportDue, "2027-04-30");
  assert.equal(obls.find((o) => o.type === "gms")!.reportDue, "2027-06-30");
  assert.equal(rollToWorkingDay("2026-10-03"), "2026-10-05");
  assert.equal(rollToWorkingDay("2026-10-01"), "2026-10-01");
});

test("calendar respects the profile: UMKM client without payroll, individual, Hong Kong", () => {
  const umkm = generateObligations({ ...entity, id: "u", tax: { regime: "final_0_5", pkp: false, ppnRate: 0.11, lkpm: true, payroll: false, localTaxRate: 0.1 } }, 2026);
  const types = new Set(umkm.map((o) => o.type));
  assert.ok(types.has("pph_final_umkm") && types.has("local_tax") && types.has("pph23"));
  assert.ok(!types.has("pph21") && !types.has("ppn") && !types.has("pph25") && !types.has("bpjs"));
  const indiv = generateObligations({ ...entity, id: "i", type: "individual", tax: { ...entity.tax, payroll: false, lkpm: false, pkp: false, pph25Monthly: 0 } }, 2026);
  assert.deepEqual([...new Set(indiv.map((o) => o.type))], ["bookkeeping", "spt_op"]);
  const hk = generateObligations({ ...entity, id: "h", type: "hk_ltd", country: "HK", tax: { ...entity.tax, regime: "hk_profits_tax", payroll: false, lkpm: false, pkp: false, pph25Monthly: 0 } }, 2026);
  assert.deepEqual([...new Set(hk.map((o) => o.type))], ["bookkeeping", "annual_report"]);
});


test("withholding: deemed DPP for PPh 21 non-employees and identifier helpers", () => {
  const r = computeWithholding({ type: "pph21", objectCode: "21-100-07", baseAmount: 40_000_000, grossAmount: 40_000_000, hasNpwp: true });
  assert.equal(r.dppPercent, 50);
  assert.equal(r.baseAmount, 20_000_000);
  assert.equal(r.rate, 0.05);
  assert.equal(r.taxAmount, 1_000_000);
  const plain = computeWithholding({ type: "pph23", objectCode: "24-104-03", baseAmount: 9_000_000, hasNpwp: true });
  assert.equal(plain.grossAmount, 9_000_000);
  assert.equal(plain.dppPercent, 100);
  assert.equal(plain.taxAmount, 180_000);
  assert.equal(npwp16("12.345.678.9-012.000"), "0123456789012000");
  assert.equal(npwp16("3171234567890001"), "3171234567890001");
  assert.equal(nitkuOf("12.345.678.9-012.000"), "0123456789012000000000");
  assert.equal(nitkuOf("3171234567890001", "3171234567890001000001"), "3171234567890001000001");
  assert.equal(formatTaxId("123456789012345"), "12.345.678.9-012.345");
  assert.equal(bupotKind("pph21"), "BP21");
  assert.equal(bupotKind("pph23"), "BPPU");
  assert.ok(isFinal({ objectCode: "28-403-01", type: "pph4_2" }));
  assert.ok(!isFinal({ objectCode: "24-104-03", type: "pph23" }));
});

test("withholding: Coretax rows and XML carry the form fields", () => {
  const entity = { npwp: "01.234.567.8-901.000", tax: { signerName: "Test Signer" } } as unknown as Parameters<typeof coretaxRows>[1];
  const slip = {
    id: "s1", entityId: "e", type: "pph23" as const, number: "BP-2026-0001", period: "2026-02", date: "2026-02-23",
    counterparty: { name: "PT Contoh Jaya", npwp: "0123456789012000" }, objectCode: "24-104-03", objectLabel: "Jasa manajemen", grossAmount: 12_000_000, dppPercent: 100,
    baseAmount: 12_000_000, rate: 0.02, taxAmount: 240_000, facility: "none" as const, document: { type: "surat_tagihan" as const, number: "TEST-0042", date: "2026-02-23" }, status: "issued" as const, createdAt: "",
  };
  const [row] = coretaxRows([slip], entity);
  assert.equal(row[0], "BPPU");
  assert.equal(row[1], "0012345678901000");
  assert.equal(row[3], 2);
  assert.equal(row[5], "TIDAK FINAL");
  assert.equal(row[13], "24-104-03");
  assert.equal(row[17], 12_000_000);
  assert.equal(row[19], 240_000);
  assert.equal(row[21], "Surat Tagihan");
  const xml = coretaxXml([slip], entity, "BPPU");
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
  assert.ok(xml.includes('<BpuBulk xsi:noNamespaceSchemaLocation="schema.xsd"'), "root element of BPU_Template.xml");
  assert.ok(xml.includes("<TIN>0012345678901000</TIN>"));
  // Field order of the Coretax template.
  const order = ["TaxPeriodMonth", "TaxPeriodYear", "CounterpartTin", "IDPlaceOfBusinessActivityOfIncomeRecipient", "TaxCertificate", "TaxObjectCode", "TaxBase", "Rate", "Document", "DocumentNumber", "DocumentDate", "IDPlaceOfBusinessActivity", "GovTreasurerOpt", "SP2DNumber", "WithholdingDate"];
  const body = xml.slice(xml.indexOf("<Bpu>"), xml.indexOf("</Bpu>"));
  const tags = [...body.matchAll(/<([A-Za-z0-9]+)(?: \/)?>/g)].map((m) => m[1]).filter((t) => t !== "Bpu");
  assert.deepEqual(tags, order);
  assert.ok(xml.includes("<TaxPeriodMonth>2</TaxPeriodMonth>"));
  assert.ok(xml.includes("<CounterpartTin>0123456789012000</CounterpartTin>"));
  assert.ok(xml.includes("<IDPlaceOfBusinessActivityOfIncomeRecipient>000000</IDPlaceOfBusinessActivityOfIncomeRecipient>"));
  assert.ok(xml.includes("<TaxCertificate>N/A</TaxCertificate>"));
  assert.ok(xml.includes("<TaxBase>12000000</TaxBase>"));
  assert.ok(xml.includes("<Rate>2</Rate>"), "rate in percent without trailing zeros");
  assert.ok(xml.includes("<Document>StatementLetter</Document>"));
  assert.ok(xml.includes("<DocumentNumber>TEST-0042</DocumentNumber>"));
  assert.ok(xml.includes("<DocumentDate>2026-02-23</DocumentDate>"));
  assert.ok(xml.includes("<GovTreasurerOpt>N/A</GovTreasurerOpt>"));
  assert.ok(xml.includes("<SP2DNumber />"));
  assert.ok(xml.includes("<WithholdingDate>2026-02-23</WithholdingDate>"));
  assert.equal(coretaxXml([slip], entity, "BP21").includes("<Bpu>"), false, "a PPh 23 slip is not in the BP21 file");
});

test("withholding: the BP21 file carries the PTKP status, gross and deemed DPP in the template's order", () => {
  const entity = { npwp: "01.234.567.8-901.000", nitku: "0012345678901000000001", tax: {} } as unknown as Parameters<typeof coretaxXml>[1];
  const slip = {
    id: "s2", entityId: "e", type: "pph21" as const, number: "BP-2026-0002", period: "2026-03", date: "2026-03-10",
    counterparty: { name: "Budi Contoh", nik: "3171000000000001", nitku: "3171000000000001000000" }, objectCode: "21-100-07", objectLabel: "Tenaga ahli", grossAmount: 20_000_000, dppPercent: 50,
    baseAmount: 10_000_000, rate: 0.05, taxAmount: 500_000, facility: "none" as const, ptkpStatus: "K/1" as const, document: { type: "kontrak" as const, number: "CTR-7", date: "2026-03-01" }, status: "issued" as const, createdAt: "",
  };
  const xml = coretaxXml([slip], entity, "BP21");
  assert.ok(xml.includes('<Bp21Bulk xsi:noNamespaceSchemaLocation="schema.xsd"'));
  const body = xml.slice(xml.indexOf("<Bp21>"), xml.indexOf("</Bp21>"));
  const tags = [...body.matchAll(/<([A-Za-z0-9]+)(?: \/)?>/g)].map((m) => m[1]).filter((t) => t !== "Bp21");
  assert.deepEqual(tags, ["TaxPeriodMonth", "TaxPeriodYear", "CounterpartTin", "IDPlaceOfBusinessActivityOfIncomeRecipient", "StatusTaxExemption", "TaxCertificate", "TaxObjectCode", "Gross", "Deemed", "Rate", "Document", "DocumentNumber", "DocumentDate", "IDPlaceOfBusinessActivity", "WithholdingDate"]);
  assert.ok(xml.includes("<StatusTaxExemption>K/1</StatusTaxExemption>"));
  assert.ok(xml.includes("<Gross>20000000</Gross>"));
  assert.ok(xml.includes("<Deemed>50</Deemed>"));
  assert.ok(xml.includes("<Rate>5</Rate>"));
  assert.ok(xml.includes("<Document>Contract</Document>"));
  assert.ok(xml.includes("<IDPlaceOfBusinessActivity>000001</IDPlaceOfBusinessActivity>"), "the agent's branch from its NITKU");
  assert.ok(xml.includes("<IDPlaceOfBusinessActivityOfIncomeRecipient>000000</IDPlaceOfBusinessActivityOfIncomeRecipient>"));
});

test("payroll: the monthly employee file (BPMP) lists TER-taxed employees and leaves annual-method lines for the A1 form", () => {
  const entity = { npwp: "01.234.567.8-901.000" } as unknown as Parameters<typeof coretaxPayrollXml>[2];
  const employees = [
    { id: "e1", name: "Ani Contoh", npwp: "0123456789012000", ptkpStatus: "K/1" as const, isForeign: false, position: "Manager" },
    { id: "e2", name: "John Sample", nik: undefined, npwp: "0987654321098000", ptkpStatus: "TK/0" as const, isForeign: true, passportNumber: "X1234567", position: "" },
    { id: "e3", name: "No Id", ptkpStatus: "TK/0" as const, isForeign: false },
  ];
  const run = { period: "2026-10", payDate: "2026-10-25", lines: [
    { employeeId: "e1", gross: 15_000_000, pph21: { method: "ter" as const, rate: 0.0175, base: 15_000_000, amount: 262_500 } },
    { employeeId: "e2", gross: 40_000_000, pph21: { method: "ter" as const, rate: 0.09, base: 40_000_000, amount: 3_600_000 } },
    { employeeId: "e3", gross: 5_000_000, pph21: { method: "ter" as const, rate: 0, base: 5_000_000, amount: 0 } },
    { employeeId: "e1", gross: 15_000_000, pph21: { method: "annual" as const, base: 180_000_000, amount: 1_000_000 } },
  ] };
  const r = coretaxPayrollXml(run, employees, entity);
  assert.equal(r.included, 2);
  assert.equal(r.skipped.length, 2);
  assert.ok(r.xml.includes('<MmPayrollBulk xsi:noNamespaceSchemaLocation="schema.xsd"'));
  const first = r.xml.slice(r.xml.indexOf("<MmPayroll>"), r.xml.indexOf("</MmPayroll>"));
  const tags = [...first.matchAll(/<([A-Za-z0-9]+)(?: \/)?>/g)].map((m) => m[1]).filter((t) => t !== "MmPayroll");
  assert.deepEqual(tags, ["TaxPeriodMonth", "TaxPeriodYear", "CounterpartOpt", "CounterpartPassport", "CounterpartTin", "StatusTaxExemption", "Position", "TaxCertificate", "TaxObjectCode", "Gross", "Rate", "IDPlaceOfBusinessActivity", "WithholdingDate"]);
  assert.ok(first.includes("<CounterpartOpt>Resident</CounterpartOpt>"));
  assert.ok(first.includes("<CounterpartPassport />"));
  assert.ok(first.includes("<TaxObjectCode>21-100-01</TaxObjectCode>"));
  assert.ok(first.includes("<Rate>1.75</Rate>"));
  assert.ok(r.xml.includes("<CounterpartOpt>Foreign</CounterpartOpt>"));
  assert.ok(r.xml.includes("<CounterpartPassport>X1234567</CounterpartPassport>"));
  assert.ok(r.xml.includes("<TaxObjectCode>21-100-32</TaxObjectCode>"));
  assert.ok(r.xml.includes("<Position>Staff</Position>"), "empty position falls back to Staff");
  assert.ok(r.skipped.some((s) => s.startsWith("No Id")));
  assert.ok(r.skipped.some((s) => s.includes("annual")));
});
