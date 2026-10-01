import type { Account, Employee, JournalLine, PayrollRun, PayslipLine } from "./types";
import { findByCode, findByTag } from "./balances";
import { computeBpjs } from "./tax/bpjs";
import { pph21Annual, pph21Monthly, usesAnnualMethod } from "./tax/pph21";

/**
 * Payroll computation. Pure: employees + period + prior runs of the year → payslip lines and totals.
 * - Gross = basic salary + allowances + overtime + bonus.
 * - BPJS on the fixed wage (basic + allowances) per the employee's flags.
 * - PPh 21 base = basic + taxable allowances + overtime + bonus + employer BPJS Kesehatan/JKK/JKM premiums.
 *   January–November: TER. December or termination month: annual progressive true-up against the prior runs.
 * - Net = gross − employee BPJS − PPh 21 − other deductions.
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

export function computePayslipLine(e: Employee, period: string, priorRuns: PayrollRun[], override: LineOverride = {}): PayslipLine {
  const allowancesTotal = e.allowances.reduce((s, a) => s + a.amount, 0);
  const taxableAllowances = e.allowances.filter((a) => a.taxable).reduce((s, a) => s + a.amount, 0);
  const overtime = Math.max(0, Math.round(override.overtime ?? 0));
  const bonus = Math.max(0, Math.round(override.bonus ?? 0));
  const gross = e.basicSalary + allowancesTotal + overtime + bonus;
  const bpjs = computeBpjs(e.basicSalary + allowancesTotal, e.bpjs);
  const taxableGross = e.basicSalary + taxableAllowances + overtime + bonus + bpjs.taxableEmployerPremiums;
  const hasNpwp = Boolean(e.npwp && e.npwp.trim());
  const otherDeductions = e.deductions.reduce((s, d) => s + d.amount, 0);

  let pph21: PayslipLine["pph21"];
  let notes = override.notes;
  if (usesAnnualMethod(period, e.endDate)) {
    const year = period.slice(0, 4);
    const prior = priorRuns
      .filter((r) => r.period.slice(0, 4) === year && r.period < period)
      .flatMap((r) => r.lines.filter((l) => l.employeeId === e.id));
    const priorGross = prior.reduce((s, l) => s + (l.pph21.method === "ter" ? l.pph21.base : l.gross), 0);
    const priorJhtJp = prior.reduce((s, l) => s + l.employee.jht + l.employee.jp, 0);
    const withheld = prior.reduce((s, l) => s + l.pph21.amount, 0);
    const annual = pph21Annual({
      grossAnnual: priorGross + taxableGross, ptkpStatus: e.ptkpStatus, hasNpwp, employeeJhtJp: priorJhtJp + bpjs.employee.jht + bpjs.employee.jp,
      months: Math.min(12, prior.length + 1), withheldToDate: withheld,
    });
    pph21 = { method: "annual", base: annual.taxableIncome, amount: annual.due };
    const detail = `Annual true-up: tax ${annual.annualTax.toLocaleString("en-US")} − withheld ${withheld.toLocaleString("en-US")} over ${prior.length + 1} month(s)`;
    notes = notes ? `${notes}. ${detail}` : detail;
  } else {
    const m = pph21Monthly({ grossMonthly: taxableGross, ptkpStatus: e.ptkpStatus, hasNpwp });
    pph21 = { method: "ter", terCategory: m.category, rate: m.rate, base: m.base, amount: m.amount };
  }
  const netPay = gross - bpjs.employee.total - pph21.amount - otherDeductions;
  return {
    employeeId: e.id, employeeName: e.name, ptkpStatus: e.ptkpStatus, basicSalary: e.basicSalary, allowances: allowancesTotal, overtime, bonus, gross,
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
  const t = { gross: 0, pph21: 0, employerBpjs: 0, employeeBpjs: 0, netPay: 0, costToCompany: 0 };
  for (const l of lines) {
    t.gross += l.gross;
    t.pph21 += l.pph21.amount;
    t.employerBpjs += employerTotal(l);
    t.employeeBpjs += employeeTotal(l);
    t.netPay += l.netPay;
  }
  t.costToCompany = t.gross + t.employerBpjs;
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
 *   Dr salary expense (gross) · Dr BPJS employer expense · Cr PPh 21 payable · Cr BPJS payable (employer + employee)
 *   · Cr employee advances (other deductions, falls back to salaries payable) · Cr salaries payable 2-1500 (net).
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
    line(pph21, t.pph21, "credit", `PPh 21 withheld ${run.period}`),
    line(bpjsPay, t.employerBpjs + t.employeeBpjs, "credit", `BPJS payable (employer + employee) ${run.period}`),
    line(advances, otherDeductions, "credit", `Employee deductions ${run.period}`),
    line(salariesPayable, t.netPay, "credit", `Net salaries payable ${run.period}`),
  ].filter((l): l is JournalLine => l !== null);
  return lines;
}
