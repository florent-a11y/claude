import { test } from "node:test";
import assert from "node:assert/strict";
import type { Employee, PayrollRun } from "../lib/types";
import { computePayroll, computePayslipLine, employeeOnPayroll, payrollJournalLines, totalsOf } from "../lib/payroll";
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
