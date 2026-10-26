import type { PtkpStatus } from "../types";
import {
  BIAYA_JABATAN_MAX_ANNUAL, BIAYA_JABATAN_MAX_MONTHLY, BIAYA_JABATAN_RATE, NO_NPWP_PPH21_MULTIPLIER, PROGRESSIVE_BRACKETS,
  TAXABLE_INCOME_ROUNDING, TER_CATEGORY, TER_TABLES, ptkpAnnual, type TerCategory,
} from "./constants";

/**
 * PPh 21 for employees. Pure functions.
 * - January–November (and any month when the employee is still on payroll at year end): monthly TER on gross income
 *   (PP 58/2023, PMK 168/2023), category by PTKP status.
 * - December or the termination month: annual progressive computation (UU PPh art. 17) minus what was withheld so far.
 * Amounts are whole rupiah: tax bases are rounded down (roundTaxDown semantics without importing lib/money, to keep this module dependency-light).
 */

function floorRp(n: number): number {
  return Math.floor(n + 1e-9);
}

export function terCategoryOf(status: PtkpStatus): TerCategory {
  return TER_CATEGORY[status];
}

/** Effective monthly rate for a category and monthly gross. */
export function terRate(category: TerCategory, monthlyGross: number): number {
  for (const [upper, rate] of TER_TABLES[category]) if (monthlyGross <= upper) return rate;
  return TER_TABLES[category][TER_TABLES[category].length - 1][1];
}

export interface Pph21MonthlyInput {
  /** Monthly gross for PPh 21: salary + taxable allowances + overtime + bonus + employer BPJS Kesehatan/JKK/JKM premiums. */
  grossMonthly: number;
  ptkpStatus: PtkpStatus;
  hasNpwp: boolean;
}

export interface Pph21MonthlyResult {
  method: "ter";
  category: TerCategory;
  rate: number;
  base: number;
  /** Tax before the no-NPWP surcharge. */
  taxBeforeSurcharge: number;
  surcharge: number;
  amount: number;
}

/** Monthly PPh 21 with the TER method. */
export function pph21Monthly(input: Pph21MonthlyInput): Pph21MonthlyResult {
  const base = floorRp(Math.max(0, input.grossMonthly));
  const category = terCategoryOf(input.ptkpStatus);
  const rate = terRate(category, base);
  const taxBeforeSurcharge = floorRp(base * rate);
  const amount = input.hasNpwp ? taxBeforeSurcharge : floorRp(taxBeforeSurcharge * NO_NPWP_PPH21_MULTIPLIER);
  return { method: "ter", category, rate, base, taxBeforeSurcharge, surcharge: amount - taxBeforeSurcharge, amount };
}

export interface ProgressiveStep { upTo: number; rate: number; base: number; tax: number }

/** Applies the art. 17 progressive brackets to a taxable income; returns the steps for display. */
export function progressiveTax(taxableIncome: number): { tax: number; steps: ProgressiveStep[] } {
  const steps: ProgressiveStep[] = [];
  let remaining = Math.max(0, taxableIncome);
  let lower = 0;
  let tax = 0;
  for (const [upper, rate] of PROGRESSIVE_BRACKETS) {
    if (remaining <= 0) break;
    const width = upper === Infinity ? remaining : Math.min(remaining, upper - lower);
    const t = floorRp(width * rate);
    steps.push({ upTo: upper, rate, base: width, tax: t });
    tax += t;
    remaining -= width;
    lower = upper;
  }
  return { tax, steps };
}

export function biayaJabatan(grossAnnual: number, months: number): number {
  const cap = Math.min(BIAYA_JABATAN_MAX_ANNUAL, BIAYA_JABATAN_MAX_MONTHLY * Math.max(1, Math.min(12, months)));
  return Math.min(floorRp(grossAnnual * BIAYA_JABATAN_RATE), cap);
}

export function roundTaxableIncome(n: number): number {
  return Math.max(0, Math.floor(n / TAXABLE_INCOME_ROUNDING) * TAXABLE_INCOME_ROUNDING);
}

export interface Pph21AnnualInput {
  /** Gross income for the year to date, including the final month (same composition as the monthly TER base). */
  grossAnnual: number;
  ptkpStatus: PtkpStatus;
  hasNpwp: boolean;
  /** Employee JHT + JP contributions for the year (deductible). */
  employeeJhtJp: number;
  /** Months worked in the year including the final month (1–12), drives the biaya jabatan cap. */
  months: number;
  /** PPh 21 already withheld January–November (or until the month before termination). */
  withheldToDate: number;
}

export interface Pph21AnnualResult {
  method: "annual";
  grossAnnual: number;
  biayaJabatan: number;
  employeeJhtJp: number;
  netIncome: number;
  ptkp: number;
  taxableIncome: number;
  steps: ProgressiveStep[];
  taxBeforeSurcharge: number;
  surcharge: number;
  annualTax: number;
  withheldToDate: number;
  /** Amount to withhold in the final month; negative means over-withheld (refund to the employee). */
  due: number;
}

/** Annual PPh 21 (December / termination true-up). */
export function pph21Annual(input: Pph21AnnualInput): Pph21AnnualResult {
  const grossAnnual = floorRp(Math.max(0, input.grossAnnual));
  const bj = biayaJabatan(grossAnnual, input.months);
  const employeeJhtJp = floorRp(Math.max(0, input.employeeJhtJp));
  const netIncome = grossAnnual - bj - employeeJhtJp;
  const ptkp = ptkpAnnual(input.ptkpStatus);
  const taxableIncome = roundTaxableIncome(netIncome - ptkp);
  const { tax, steps } = progressiveTax(taxableIncome);
  const annualTax = input.hasNpwp ? tax : floorRp(tax * NO_NPWP_PPH21_MULTIPLIER);
  return {
    method: "annual", grossAnnual, biayaJabatan: bj, employeeJhtJp, netIncome, ptkp, taxableIncome, steps,
    taxBeforeSurcharge: tax, surcharge: annualTax - tax, annualTax, withheldToDate: input.withheldToDate, due: annualTax - input.withheldToDate,
  };
}

/** Whether the final-month (annual) method applies: December, or the month the employee leaves. */
export function usesAnnualMethod(period: string, endDate?: string): boolean {
  const month = Number(period.slice(5, 7));
  if (month === 12) return true;
  return Boolean(endDate && endDate.slice(0, 7) === period);
}
