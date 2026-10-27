import type { Account, Employee, JournalLine, PayrollRun, PayrollTaxMethod, PayslipLine } from "./types";
import { findByCode, findByTag } from "./balances";
import { computeBpjs } from "./tax/bpjs";
import { pph21Annual, pph21Monthly, usesAnnualMethod } from "./tax/pph21";

/**
 * Payroll computation. Pure: employees + period + prior runs of the year → payslip lines and totals.
 * - Gross = basic salary + allowances + BPJS allowance + overtime + bonus (+ tax allowance under gross-up).
 * - BPJS on the fixed wage (basic + allowances) per the employee's flags.
 * - PPh 21 base = basic + taxable allowances + BPJS allowance + overtime + bonus + employer BPJS Kesehatan/JKK/JKM
 *   premiums (+ the tax allowance under gross-up). January–November: TER. December or termination month: annual
 *   progressive true-up against the prior runs.
 * - Tax method (per employee):
 *   gross    the tax is deducted from the employee: net = gross − employee BPJS − PPh 21 − other deductions;
 *   nett     the company pays the tax on top: net = gross − employee BPJS − other deductions; the tax is booked
 *            as a non-deductible expense and is not added to the employee's income;
 *   grossup  the company adds a tax allowance A such that PPh 21 on (base + A) equals A, so the employee's net
 *            equals the agreed pay; A is deductible salary cost.
 * - BPJS allowance: the company may pay the employee's own 1% / 2% / 1% shares as a taxable allowance; the
 *   deduction still shows on the slip, so the employee's pay is unchanged and the taxable income goes up.
 */

export interface LineOverride { overtime?: number; bonus?: number; notes?: string }

export interface PayrollComputeInput {
  period: string; // YYYY-MM
  employees: Employee[];
  /** Runs of the same entity with period < input.period (any status), used for the annual true-up. */
  priorRuns: PayrollRun[];
  overrides?: Record<string, LineOverride>;
}

export interface PayrollComputeResult {
  lines: PayslipLine[];
  totals: PayrollRun["totals"];
}

function lastDay(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${period}-${String(d).padStart(2, "0")}`;
}

export function employeeOnPayroll(e: Employee, period: string): boolean {
  if (!e.active && !(e.endDate && e.endDate.slice(0, 7) === period)) return false;
  if (e.joinDate > lastDay(period)) return false;
  if (e.endDate && e.endDate < `${period}-01`) return false;
  return true;
}

export function taxMethodOf(e: Pick<Employee, "taxMethod">): PayrollTaxMethod {
  return e.taxMethod ?? "gross";
}

/** PPh 21 taken out of the employee's pay (runs computed before the tax-method option count as gross). */
export function pphDeducted(l: PayslipLine): number {
  return l.pph21.deducted ?? l.pph21.amount;
}

/** PPh 21 paid by the company on top of the salary (nett method). */
export function pphBorne(l: PayslipLine): number {
  return l.pph21.borneByCompany ?? 0;
}

/**
 * Gross-up solver: the smallest whole-rupiah allowance A with tax(A) ≤ A, found by fixed-point iteration
 * A ← tax(A). Rates are step functions, so the sequence can end in a two-cycle at a bracket edge; the larger
 * value is then taken, which covers the tax with at most a few rupiah to spare.
 */
export function solveGrossUp(tax: (allowance: number) => number, maxIterations = 60): number {
  let a = Math.max(0, Math.round(tax(0)));
  let prev = -1;
  for (let i = 0; i < maxIterations; i++) {
    const next = Math.max(0, Math.round(tax(a)));
    if (next === a) return a;
    if (next === prev) return Math.max(a, next);
    prev = a;
    a = next;
  }
  return a;
}

export function computePayslipLine(e: Employee, period: string, priorRuns: PayrollRun[], override: LineOverride = {}): PayslipLine {
  const method = taxMethodOf(e);
  const allowancesTotal = e.allowances.reduce((s, a) => s + a.amount, 0);
  const taxableAllowances = e.allowances.filter((a) => a.taxable).reduce((s, a) => s + a.amount, 0);
  const overtime = Math.max(0, Math.round(override.overtime ?? 0));
  const bonus = Math.max(0, Math.round(override.bonus ?? 0));
  const bpjs = computeBpjs(e.basicSalary + allowancesTotal, e.bpjs);
  const cover = e.bpjsAllowance;
  const bpjsAllowance = (cover?.kesehatan ? bpjs.employee.bpjsKesehatan : 0) + (cover?.jht ? bpjs.employee.jht : 0) + (cover?.jp ? bpjs.employee.jp : 0);
  const grossBeforeTaxAllowance = e.basicSalary + allowancesTotal + bpjsAllowance + overtime + bonus;
  const taxableBefore = e.basicSalary + taxableAllowances + bpjsAllowance + overtime + bonus + bpjs.taxableEmployerPremiums;
  const hasNpwp = Boolean(e.npwp && e.npwp.trim());
  const otherDeductions = e.deductions.reduce((s, d) => s + d.amount, 0);

  let pph21: PayslipLine["pph21"];
  let taxAllowance = 0;
  let notes = override.notes;
  const split = (amount: number): Pick<PayslipLine["pph21"], "amount" | "deducted" | "borneByCompany"> =>
    method === "nett" ? { amount, deducted: 0, borneByCompany: amount } : { amount, deducted: amount, borneByCompany: 0 };

  if (usesAnnualMethod(period, e.endDate)) {
    const year = period.slice(0, 4);
    const prior = priorRuns
      .filter((r) => r.period.slice(0, 4) === year && r.period < period)
      .flatMap((r) => r.lines.filter((l) => l.employeeId === e.id));
    const priorGross = prior.reduce((s, l) => s + (l.pph21.method === "ter" ? l.pph21.base : l.gross), 0);
    const priorJhtJp = prior.reduce((s, l) => s + l.employee.jht + l.employee.jp, 0);
    const withheld = prior.reduce((s, l) => s + l.pph21.amount, 0);
    const annualFor = (allowance: number) => pph21Annual({
      grossAnnual: priorGross + taxableBefore + allowance, ptkpStatus: e.ptkpStatus, hasNpwp, employeeJhtJp: priorJhtJp + bpjs.employee.jht + bpjs.employee.jp,
      months: Math.min(12, prior.length + 1), withheldToDate: withheld,
    });
    if (method === "grossup") taxAllowance = solveGrossUp((a) => annualFor(a).due);
    const annual = annualFor(taxAllowance);
    pph21 = { method: "annual", base: annual.taxableIncome, ...split(annual.due) };
    const detail = `Annual true-up: tax ${annual.annualTax.toLocaleString("en-US")} − withheld ${withheld.toLocaleString("en-US")} over ${prior.length + 1} month(s)`;
    notes = notes ? `${notes}. ${detail}` : detail;
  } else {
    const monthlyFor = (allowance: number) => pph21Monthly({ grossMonthly: taxableBefore + allowance, ptkpStatus: e.ptkpStatus, hasNpwp });
    if (method === "grossup") taxAllowance = solveGrossUp((a) => monthlyFor(a).amount);
    const m = monthlyFor(taxAllowance);
    pph21 = { method: "ter", terCategory: m.category, rate: m.rate, base: m.base, ...split(m.amount) };
  }
  const gross = grossBeforeTaxAllowance + taxAllowance;
  const netPay = gross - bpjs.employee.total - (pph21.deducted ?? pph21.amount) - otherDeductions;
  return {
    employeeId: e.id, employeeName: e.name, ptkpStatus: e.ptkpStatus, basicSalary: e.basicSalary, allowances: allowancesTotal, overtime, bonus, gross,
    taxMethod: method, bpjsAllowance, taxAllowance,
    employer: { bpjsKesehatan: bpjs.employer.bpjsKesehatan, jht: bpjs.employer.jht, jp: bpjs.employer.jp, jkk: bpjs.employer.jkk, jkm: bpjs.employer.jkm },
    employee: { bpjsKesehatan: bpjs.employee.bpjsKesehatan, jht: bpjs.employee.jht, jp: bpjs.employee.jp },
    pph21, otherDeductions, netPay, notes,
  };
}

export function employerTotal(l: PayslipLine): number {
  return l.employer.bpjsKesehatan + l.employer.jht + l.employer.jp + l.employer.jkk + l.employer.jkm;
}

export function employeeTotal(l: PayslipLine): number {
  return l.employee.bpjsKesehatan + l.employee.jht + l.employee.jp;
}

export function totalsOf(lines: PayslipLine[]): PayrollRun["totals"] {
  const t = { gross: 0, pph21: 0, employerBpjs: 0, employeeBpjs: 0, netPay: 0, costToCompany: 0, taxAllowance: 0, bpjsAllowance: 0, pph21Company: 0 };
  for (const l of lines) {
    t.gross += l.gross;
    t.pph21 += l.pph21.amount;
    t.employerBpjs += employerTotal(l);
    t.employeeBpjs += employeeTotal(l);
    t.netPay += l.netPay;
    t.taxAllowance += l.taxAllowance ?? 0;
    t.bpjsAllowance += l.bpjsAllowance ?? 0;
    t.pph21Company += pphBorne(l);
  }
  t.costToCompany = t.gross + t.employerBpjs + t.pph21Company;
  return t;
}

export function computePayroll(input: PayrollComputeInput): PayrollComputeResult {
  const lines = input.employees
    .filter((e) => employeeOnPayroll(e, input.period))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => computePayslipLine(e, input.period, input.priorRuns, input.overrides?.[e.id]));
  return { lines, totals: totalsOf(lines) };
}

/**
 * Journal lines for an approved run:
 *   Dr salary expense (gross, including BPJS and tax allowances) · Dr BPJS employer expense
 *   · Dr PPh 21 borne by company (nett method, non-deductible) · Cr PPh 21 payable (all methods)
 *   · Cr BPJS payable (employer + employee) · Cr employee advances (other deductions, falls back to salaries payable)
 *   · Cr salaries payable 2-1500 (net).
 * Throws a clear message naming the missing account tag.
 */
export function payrollJournalLines(run: Pick<PayrollRun, "period" | "lines" | "totals">, accounts: Account[]): JournalLine[] {
  const need = (tag: Account["taxTag"], what: string): Account => {
    const a = findByTag(accounts, tag);
    if (!a) throw new Error(`No active account is tagged "${tag}" (${what}). Tag it in Books › Chart of accounts before approving payroll.`);
    return a;
  };
  const salary = need("salary_expense", "salaries and wages expense");
  const bpjsExp = need("bpjs_expense", "BPJS employer contributions expense");
  const pph21 = need("pph21_payable", "PPh 21 payable");
  const bpjsPay = need("bpjs_payable", "BPJS payable");
  const salariesPayable = findByCode(accounts, "2-1500");
  if (!salariesPayable) throw new Error('No account with code 2-1500 (Salaries payable / Utang gaji). Create it in Books › Chart of accounts before approving payroll.');
  const advances = findByCode(accounts, "1-1220") ?? salariesPayable;
  const otherDeductions = run.lines.reduce((s, l) => s + l.otherDeductions, 0);
  const pph21Company = run.lines.reduce((s, l) => s + pphBorne(l), 0);
  const pph21CompanyExp = pph21Company !== 0 ? need("pph21_company_expense", "PPh 21 borne by company expense, non-deductible") : null;
  const t = run.totals;
  const line = (a: Account, amount: number, side: "debit" | "credit", description: string): JournalLine | null => {
    const v = Math.round(amount);
    if (v === 0) return null;
    const actual = v > 0 ? side : side === "debit" ? "credit" : "debit";
    return { accountId: a.id, accountCode: a.code, description, debit: actual === "debit" ? Math.abs(v) : 0, credit: actual === "credit" ? Math.abs(v) : 0 };
  };
  const lines = [
    line(salary, t.gross, "debit", `Gross salaries ${run.period}`),
    line(bpjsExp, t.employerBpjs, "debit", `BPJS employer contributions ${run.period}`),
    pph21CompanyExp ? line(pph21CompanyExp, pph21Company, "debit", `PPh 21 borne by company ${run.period}`) : null,
    line(pph21, t.pph21, "credit", `PPh 21 withheld ${run.period}`),
    line(bpjsPay, t.employerBpjs + t.employeeBpjs, "credit", `BPJS payable (employer + employee) ${run.period}`),
    line(advances, otherDeductions, "credit", `Employee deductions ${run.period}`),
    line(salariesPayable, t.netPay, "credit", `Net salaries payable ${run.period}`),
  ].filter((l): l is JournalLine => l !== null);
  return lines;
}
