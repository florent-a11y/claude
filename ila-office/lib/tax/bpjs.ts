import type { Employee } from "../types";
import { BPJS_JHT, BPJS_JKK_RATES, BPJS_JKM_RATE, BPJS_JP, BPJS_KESEHATAN } from "./constants";

/**
 * BPJS Kesehatan and BPJS Ketenagakerjaan contributions for one employee-month. Pure.
 * The wage base is the fixed monthly wage (basic salary + fixed allowances, PP 35/2021 "upah"); overtime and bonuses are excluded.
 * Each programme applies only when the employee's flag is on.
 */

export type BpjsFlags = Employee["bpjs"];

export interface BpjsResult {
  wageBase: number;
  employer: { bpjsKesehatan: number; jht: number; jp: number; jkk: number; jkm: number; total: number };
  employee: { bpjsKesehatan: number; jht: number; jp: number; total: number };
  /** Employer premiums that count as taxable income for PPh 21 (Kesehatan, JKK, JKM). JHT/JP employer parts are not. */
  taxableEmployerPremiums: number;
}

function rp(n: number): number {
  return Math.round(n + Number.EPSILON);
}

export function computeBpjs(wageBase: number, flags: BpjsFlags): BpjsResult {
  const base = Math.max(0, wageBase);
  const kesBase = Math.min(base, BPJS_KESEHATAN.wageCap);
  const jpBase = Math.min(base, BPJS_JP.wageCap);
  const employer = {
    bpjsKesehatan: flags.kesehatan ? rp(kesBase * BPJS_KESEHATAN.employer) : 0,
    jht: flags.jht ? rp(base * BPJS_JHT.employer) : 0,
    jp: flags.jp ? rp(jpBase * BPJS_JP.employer) : 0,
    jkk: flags.jkk ? rp(base * (BPJS_JKK_RATES[flags.jkkRiskClass] ?? BPJS_JKK_RATES[1])) : 0,
    jkm: flags.jkm ? rp(base * BPJS_JKM_RATE) : 0,
    total: 0,
  };
  employer.total = employer.bpjsKesehatan + employer.jht + employer.jp + employer.jkk + employer.jkm;
  const employee = {
    bpjsKesehatan: flags.kesehatan ? rp(kesBase * BPJS_KESEHATAN.employee) : 0,
    jht: flags.jht ? rp(base * BPJS_JHT.employee) : 0,
    jp: flags.jp ? rp(jpBase * BPJS_JP.employee) : 0,
    total: 0,
  };
  employee.total = employee.bpjsKesehatan + employee.jht + employee.jp;
  return { wageBase: base, employer, employee, taxableEmployerPremiums: employer.bpjsKesehatan + employer.jkk + employer.jkm };
}
