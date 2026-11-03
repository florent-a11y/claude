import { test } from "node:test";
import assert from "node:assert/strict";
import type { Employee, PayrollRun } from "../lib/types";
import { computePayroll, computePayslipLine, employeeOnPayroll, payrollJournalLines, pphBorne, pphDeducted, solveGrossUp, totalsOf } from "../lib/payroll";
import { validateLines } from "../lib/balances";
import { buildAccounts } from "../lib/coa";

const bpjsAll = { kesehatan: true, jht: true, jp: true, jkk: true, jkm: true, jkkRiskClass: 1 as const };
function emp(partial: Partial<Employee> & { id: string; name: string; basicSalary: number }): Employee {
  return {
    entityId: "e", ptkpStatus: "TK/0", isForeign: false, bpjs: bpjsAll, allowances: [], deductions: [], joinDate: "2025-01-01", contractType: "pkwtt", active: true, createdAt: "",
    ...partial,
  };
}

const staff: Employee[] = [
  emp({ id: "a", name: "Ayu", basicSalary: 8_000_000, npwp: "12.345.678.9-012.000", allowances: [{ name: "Transport", amount: 1_000_000, taxable: true }, { name: "Meal", amount: 500_000, taxable: false }], deductions: [{ name: "Loan", amount: 300_000 }] }),
  emp({ id: "b", name: "Budi", basicSalary: 15_000_000, ptkpStatus: "K/1", npwp: "98.765.432.1-012.000" }),
  emp({ id: "c", name: "Chloe", basicSalary: 30_000_000, isForeign: true, bpjs: { ...bpjsAll, jht: false, jp: false } }), // no NPWP → 120%
  emp({ id: "d", name: "Dewi", basicSalary: 5_000_000, joinDate: "2026-07-15" }), // joins later: excluded in March
  emp({ id: "e", name: "Eka", basicSalary: 5_000_000, active: false }),
];

test("payroll run lines and totals balance", () => {
  const run = computePayroll({ period: "2026-03", employees: staff, priorRuns: [], overrides: { a: { overtime: 250_000, bonus: 1_000_000 } } });
  assert.deepEqual(run.lines.map((l) => l.employeeId), ["a", "b", "c"]);
  for (const l of run.lines) {
    const employeeBpjs = l.employee.bpjsKesehatan + l.employee.jht + l.employee.jp;
    assert.equal(l.netPay + employeeBpjs + l.pph21.amount + l.otherDeductions, l.gross, `${l.employeeName} net + deductions = gross`);
    assert.equal(l.pph21.method, "ter");
  }
  const ayu = run.lines[0];
  assert.equal(ayu.gross, 8_000_000 + 1_500_000 + 250_000 + 1_000_000);
  assert.equal(ayu.otherDeductions, 300_000);
  // PPh 21 base excludes the non-taxable meal allowance and includes employer Kesehatan/JKK/JKM premiums on the 9.5 M wage.
  assert.equal(ayu.pph21.base, 8_000_000 + 1_000_000 + 250_000 + 1_000_000 + 380_000 + 22_800 + 28_500);
  const chloe = run.lines[2];
  assert.equal(chloe.pph21.terCategory, "A");
  assert.equal(chloe.pph21.base, 30_000_000 + 480_000 + 72_000 + 90_000); // + employer Kesehatan (capped), JKK, JKM
  assert.equal(chloe.pph21.rate, 0.13); // 30.642 M → 13% bracket (30.05 M < base ≤ 32.4 M)
  assert.equal(chloe.pph21.amount, Math.floor(Math.floor(chloe.pph21.base * 0.13) * 1.2)); // no NPWP surcharge
  const t = run.totals;
  assert.equal(t.gross, run.lines.reduce((s, l) => s + l.gross, 0));
  assert.equal(t.costToCompany, t.gross + t.employerBpjs);
  assert.equal(t.netPay + t.employeeBpjs + t.pph21 + run.lines.reduce((s, l) => s + l.otherDeductions, 0), t.gross);
});

test("eligibility: joiners, leavers and inactive employees", () => {
  assert.ok(!employeeOnPayroll(staff[3], "2026-03"));
  assert.ok(employeeOnPayroll(staff[3], "2026-07"));
  assert.ok(!employeeOnPayroll(staff[4], "2026-03"));
  const leaver = emp({ id: "l", name: "Leaver", basicSalary: 6_000_000, endDate: "2026-05-10", active: false });
  assert.ok(employeeOnPayroll(leaver, "2026-05"));
  assert.ok(!employeeOnPayroll(leaver, "2026-06"));
  assert.equal(computePayslipLine(leaver, "2026-05", []).pph21.method, "annual"); // termination month → true-up
});

test("December true-up uses the prior runs of the year", () => {
  const e = emp({ id: "x", name: "Xavier", basicSalary: 15_000_000, npwp: "11.111.111.1-111.000", bpjs: { ...bpjsAll, kesehatan: false, jht: false, jp: false, jkk: false, jkm: false } });
  const prior: PayrollRun[] = [];
  for (let m = 1; m <= 11; m++) {
    const period = `2026-${String(m).padStart(2, "0")}`;
    const r = computePayroll({ period, employees: [e], priorRuns: prior });
    assert.equal(r.lines[0].pph21.amount, 900_000);
    prior.push({ id: period, entityId: "e", period, payDate: period + "-28", lines: r.lines, totals: r.totals, status: "paid", createdAt: "" });
  }
  const dec = computePayslipLine(e, "2026-12", prior);
  assert.equal(dec.pph21.method, "annual");
  assert.equal(dec.pph21.base, 120_000_000);
  assert.equal(dec.pph21.amount, 2_100_000);
  assert.equal(dec.netPay, 15_000_000 - 2_100_000);
});

test("payroll journal balances and uses the tagged accounts", () => {
  const accounts = buildAccounts("e", (() => { let i = 0; return () => `acc${i++}`; })());
  const { lines, totals } = computePayroll({ period: "2026-03", employees: staff, priorRuns: [], overrides: { a: { overtime: 100_000 } } });
  const jl = payrollJournalLines({ period: "2026-03", lines, totals }, accounts);
  assert.equal(validateLines(jl), null);
  const d = jl.reduce((s, l) => s + l.debit, 0);
  const c = jl.reduce((s, l) => s + l.credit, 0);
  assert.equal(d, c);
  assert.equal(d, totals.gross + totals.employerBpjs);
  const byCode = Object.fromEntries(jl.map((l) => [l.accountCode, l]));
  assert.equal(byCode["6-1000"].debit, totals.gross);
  assert.equal(byCode["6-1020"].debit, totals.employerBpjs);
  assert.equal(byCode["2-1300"].credit, totals.pph21);
  assert.equal(byCode["2-1400"].credit, totals.employerBpjs + totals.employeeBpjs);
  assert.equal(byCode["2-1500"].credit, totals.netPay);
  assert.equal(byCode["1-1220"].credit, 300_000);
  assert.equal(totalsOf(lines).netPay, totals.netPay);
});

test("missing account tag gives an actionable error", () => {
  const accounts = buildAccounts("e", (() => { let i = 0; return () => `acc${i++}`; })()).filter((a) => a.taxTag !== "bpjs_payable");
  const { lines, totals } = computePayroll({ period: "2026-03", employees: staff, priorRuns: [] });
  assert.throws(() => payrollJournalLines({ period: "2026-03", lines, totals }, accounts), /bpjs_payable/);
});

// ---------- Tax methods (gross / nett / gross-up) and BPJS allowance ----------

const grossEmp = emp({ id: "g", name: "Gita", basicSalary: 12_000_000, npwp: "22.222.222.2-222.000", deductions: [{ name: "Loan", amount: 200_000 }] });
const nettEmp = { ...grossEmp, id: "n", name: "Nina", taxMethod: "nett" as const };
const grossupEmp = { ...grossEmp, id: "u", name: "Umar", taxMethod: "grossup" as const };

test("nett: the company bears PPh 21, the employee's net pay is untouched", () => {
  const g = computePayslipLine(grossEmp, "2026-03", []);
  const n = computePayslipLine(nettEmp, "2026-03", []);
  assert.equal(n.pph21.amount, g.pph21.amount); // same tax, computed on the same base
  assert.equal(n.pph21.deducted, 0);
  assert.equal(n.pph21.borneByCompany, g.pph21.amount);
  assert.equal(n.gross, g.gross);
  assert.equal(n.netPay, g.netPay + g.pph21.amount);
  assert.equal(n.netPay, n.gross - (n.employee.bpjsKesehatan + n.employee.jht + n.employee.jp) - n.otherDeductions);
  const t = totalsOf([n]);
  assert.equal(t.pph21Company, g.pph21.amount);
  assert.equal(t.costToCompany, t.gross + t.employerBpjs + g.pph21.amount);
});

test("gross-up: the tax allowance covers the tax on itself and net pay equals the agreed pay", () => {
  const g = computePayslipLine(grossEmp, "2026-03", []);
  const u = computePayslipLine(grossupEmp, "2026-03", []);
  assert.ok((u.taxAllowance ?? 0) > g.pph21.amount, "allowance exceeds the plain tax because it is itself taxable");
  assert.ok(u.pph21.amount <= (u.taxAllowance ?? 0), "the allowance covers the tax");
  assert.ok((u.taxAllowance ?? 0) - u.pph21.amount <= 5, "within a few rupiah of the fixed point");
  assert.equal(u.gross, g.gross + (u.taxAllowance ?? 0));
  assert.equal(u.pph21.base, g.pph21.base + (u.taxAllowance ?? 0));
  assert.equal(u.pph21.deducted, u.pph21.amount);
  assert.equal(u.netPay, u.gross - (u.employee.bpjsKesehatan + u.employee.jht + u.employee.jp) - u.pph21.amount - u.otherDeductions);
  // Take-home equals the gross-method pay before tax (give or take the rounding slack above).
  const agreed = g.gross - (g.employee.bpjsKesehatan + g.employee.jht + g.employee.jp) - g.otherDeductions;
  assert.ok(Math.abs(u.netPay - agreed) <= 5);
});

test("gross-up solver converges on step rates and at bracket edges", () => {
  // Linear 10% tax: A = 0.1 (1000 + A) → A = 111.1…, rounded fixed point 111.
  assert.equal(solveGrossUp((a) => 0.1 * (1000 + a)), 111);
  // Step function that flips between two values: the larger is returned and covers the tax.
  const flip = (a: number) => (a >= 100 ? 90 : 100);
  const r = solveGrossUp(flip);
  assert.equal(r, 100);
  assert.ok(flip(r) <= r);
  assert.equal(solveGrossUp(() => 0), 0);
});

test("December gross-up: allowances over the year cover the annual tax", () => {
  const e = { ...grossupEmp, bpjs: { ...bpjsAll, kesehatan: false, jht: false, jp: false, jkk: false, jkm: false }, deductions: [] };
  const prior: PayrollRun[] = [];
  let allowances = 0;
  for (let m = 1; m <= 11; m++) {
    const period = `2026-${String(m).padStart(2, "0")}`;
    const r = computePayroll({ period, employees: [e], priorRuns: prior });
    allowances += r.lines[0].taxAllowance ?? 0;
    prior.push({ id: period, entityId: "e", period, payDate: period + "-28", lines: r.lines, totals: r.totals, status: "paid", createdAt: "" });
  }
  const dec = computePayslipLine(e, "2026-12", prior);
  allowances += dec.taxAllowance ?? 0;
  const withheld = prior.reduce((s, r) => s + r.lines[0].pph21.amount, 0) + dec.pph21.amount;
  assert.equal(dec.pph21.method, "annual");
  assert.ok(allowances >= withheld && allowances - withheld <= 60, `allowances ${allowances} cover the year's tax ${withheld}`);
  assert.ok(Math.abs(dec.netPay - 12_000_000) <= 60, "December take-home stays at the agreed salary");
});

test("BPJS allowance: the company pays the employee's share as taxable income, the deduction stays", () => {
  const plain = computePayslipLine(grossEmp, "2026-03", []);
  const covered = computePayslipLine({ ...grossEmp, bpjsAllowance: { kesehatan: true, jht: true, jp: true } }, "2026-03", []);
  const shares = plain.employee.bpjsKesehatan + plain.employee.jht + plain.employee.jp;
  assert.equal(covered.bpjsAllowance, shares);
  assert.equal(covered.gross, plain.gross + shares);
  assert.equal(covered.pph21.base, plain.pph21.base + shares);
  assert.deepEqual(covered.employee, plain.employee); // still deducted
  assert.ok(covered.pph21.amount >= plain.pph21.amount);
  assert.equal(covered.netPay, plain.netPay + shares - (covered.pph21.amount - plain.pph21.amount));
  const partial = computePayslipLine({ ...grossEmp, bpjsAllowance: { kesehatan: true, jht: false, jp: false } }, "2026-03", []);
  assert.equal(partial.bpjsAllowance, plain.employee.bpjsKesehatan);
});

test("payroll journal with nett and gross-up employees balances and books the company-borne tax separately", () => {
  const accounts = buildAccounts("e", (() => { let i = 0; return () => `acc${i++}`; })());
  const { lines, totals } = computePayroll({ period: "2026-03", employees: [grossEmp, nettEmp, grossupEmp], priorRuns: [] });
  const jl = payrollJournalLines({ period: "2026-03", lines, totals }, accounts);
  assert.equal(validateLines(jl), null);
  const byCode = Object.fromEntries(jl.map((l) => [l.accountCode, l]));
  const nett = lines.find((l) => l.employeeId === "n")!;
  assert.equal(byCode["6-1040"].debit, nett.pph21.amount);
  assert.equal(byCode["6-1000"].debit, totals.gross); // includes the gross-up allowance
  assert.equal(byCode["2-1300"].credit, totals.pph21); // all three methods remit through PPh 21 payable
  assert.equal(byCode["2-1500"].credit, totals.netPay);
  const d = jl.reduce((s, l) => s + l.debit, 0);
  assert.equal(d, totals.gross + totals.employerBpjs + nett.pph21.amount);
  // Without the non-deductible account the error names the tag; gross/gross-up runs do not need it.
  const without = accounts.filter((a) => a.taxTag !== "pph21_company_expense");
  assert.throws(() => payrollJournalLines({ period: "2026-03", lines, totals }, without), /pph21_company_expense/);
  const noNett = computePayroll({ period: "2026-03", employees: [grossEmp, grossupEmp], priorRuns: [] });
  assert.equal(validateLines(payrollJournalLines({ period: "2026-03", ...noNett }, without)), null);
});

test("runs stored before the tax-method option read as gross", () => {
  const legacy = computePayslipLine(grossEmp, "2026-03", []);
  const stripped = { ...legacy, taxMethod: undefined, taxAllowance: undefined, bpjsAllowance: undefined, pph21: { method: legacy.pph21.method, base: legacy.pph21.base, amount: legacy.pph21.amount } } as typeof legacy;
  assert.equal(pphDeducted(stripped), legacy.pph21.amount);
  assert.equal(pphBorne(stripped), 0);
  const t = totalsOf([stripped]);
  assert.equal(t.pph21Company, 0);
  assert.equal(t.costToCompany, t.gross + t.employerBpjs);
});


test("BPJS wage base: contributions follow the fixed reported wage, tax follows the actual pay", () => {
  const actual = computePayslipLine(grossEmp, "2026-03", []);
  const fixed = computePayslipLine({ ...grossEmp, bpjsWageBase: 5_000_000 }, "2026-03", []);
  assert.equal(fixed.gross, actual.gross);
  assert.equal(fixed.employee.jht, 100_000); // 2% of the fixed 5 M, not of the 12 M salary
  assert.equal(fixed.employer.jht, 185_000);
  assert.ok(fixed.employee.bpjsKesehatan < actual.employee.bpjsKesehatan);
  assert.ok(fixed.pph21.base < actual.pph21.base, "smaller employer premiums → smaller PPh 21 base");
  const zero = computePayslipLine({ ...grossEmp, bpjsWageBase: 0 }, "2026-03", []);
  assert.deepEqual(zero.employee, actual.employee); // 0 / empty falls back to the actual wage
});
