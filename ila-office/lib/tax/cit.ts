import type { Account, JournalEntry, TaxRegime } from "../types";
import { accountBalances, naturalBalance } from "../balances";
import { ART_31E_DISCOUNT, ART_31E_MAX_TURNOVER, ART_31E_SMALL_TURNOVER, CIT_RATE, HK_TWO_TIER, TAXABLE_INCOME_ROUNDING, UMKM_FINAL_RATE } from "./constants";

/**
 * Annual corporate income tax computation. Pure: the ledger slice (accounts + posted entries) is passed in.
 */

export interface CitScheduleLine { label: string; amount: number; note?: string; emphasis?: boolean }

export interface CitInput {
  regime: TaxRegime;
  fiscalYear: number;
  /** First and last day of the fiscal year. */
  from: string;
  to: string;
  accounts: Account[];
  entries: JournalEntry[];
  /** Manual fiscal adjustments (positive increases taxable income). */
  adjustments?: { nonTaxableIncome?: number; otherPositive?: number; otherNegative?: number; note?: string };
  /** Loss carried forward from prior years (max 5 years, UU PPh art. 6(2)). */
  lossCarryForward?: number;
}

export interface CitResult {
  regime: TaxRegime;
  fiscalYear: number;
  revenue: number;
  /** Gross turnover (peredaran bruto): revenue accounts of subtype `sales`, or all revenue when none. */
  turnover: number;
  expenses: number;
  accountingProfit: number;
  nonDeductibleExpenses: Array<{ code: string; name: string; amount: number }>;
  nonDeductibleTotal: number;
  nonTaxableIncome: number;
  otherAdjustments: number;
  fiscalProfit: number;
  lossCarryForward: number;
  taxableIncome: number;
  /** Tax computation by regime, as displayable lines. */
  taxLines: CitScheduleLine[];
  cit: number;
  /** PP 55 final tax on turnover (regime final_0_5), monthly schedule. */
  finalTax?: { rate: number; total: number; monthly: Array<{ period: string; turnover: number; tax: number }> };
  credits: { pph25: number; pph23: number; pph22: number; total: number };
  /** Positive = PPh 29 payable; negative = PPh 28A overpaid. */
  pph29: number;
  nextPph25Monthly: number;
}

function floorRp(n: number): number {
  return Math.floor(n + 1e-9);
}

export function roundTaxableIncome(n: number): number {
  return Math.floor(Math.max(0, n) / TAXABLE_INCOME_ROUNDING) * TAXABLE_INCOME_ROUNDING;
}

/** Tax on taxable income under a regime. Pure arithmetic shared by the UI calculator and the ledger computation. */
export function taxByRegime(regime: TaxRegime, taxableIncome: number, turnover: number): { cit: number; lines: CitScheduleLine[] } {
  const ti = Math.max(0, taxableIncome);
  const lines: CitScheduleLine[] = [];
  switch (regime) {
    case "normal_22": {
      const cit = floorRp(ti * CIT_RATE);
      lines.push({ label: `Taxable income × ${CIT_RATE * 100}% (UU PPh art. 17(1b))`, amount: cit });
      return { cit, lines };
    }
    case "art_31e": {
      if (turnover <= ART_31E_SMALL_TURNOVER) {
        const cit = floorRp(ti * CIT_RATE * ART_31E_DISCOUNT);
        lines.push({ label: `Turnover ≤ 4.8 bn: taxable income × 50% × ${CIT_RATE * 100}% (art. 31E(1))`, amount: cit });
        return { cit, lines };
      }
      if (turnover <= ART_31E_MAX_TURNOVER) {
        const facilitated = floorRp((ART_31E_SMALL_TURNOVER / turnover) * ti);
        const rest = ti - facilitated;
        const t1 = floorRp(facilitated * CIT_RATE * ART_31E_DISCOUNT);
        const t2 = floorRp(rest * CIT_RATE);
        lines.push({ label: `Facilitated part: 4.8 bn / turnover × taxable income = ${facilitated.toLocaleString("en-US")} × 11%`, amount: t1 });
        lines.push({ label: `Remainder ${rest.toLocaleString("en-US")} × ${CIT_RATE * 100}%`, amount: t2 });
        return { cit: t1 + t2, lines };
      }
      const cit = floorRp(ti * CIT_RATE);
      lines.push({ label: `Turnover > 50 bn: art. 31E not available, taxable income × ${CIT_RATE * 100}%`, amount: cit });
      return { cit, lines };
    }
    case "hk_profits_tax": {
      const lower = Math.min(ti, HK_TWO_TIER.threshold);
      const upper = Math.max(0, ti - HK_TWO_TIER.threshold);
      const t1 = floorRp(lower * HK_TWO_TIER.lowerRate);
      const t2 = floorRp(upper * HK_TWO_TIER.upperRate);
      lines.push({ label: `First ${HK_TWO_TIER.threshold.toLocaleString("en-US")} (base currency) × ${HK_TWO_TIER.lowerRate * 100}%`, amount: t1 });
      if (upper > 0) lines.push({ label: `Above threshold ${upper.toLocaleString("en-US")} × ${HK_TWO_TIER.upperRate * 100}%`, amount: t2 });
      return { cit: t1 + t2, lines };
    }
    case "final_0_5":
      lines.push({ label: "Income taxed under PP 55/2022 final 0.5% of turnover: no annual CIT on this income", amount: 0 });
      return { cit: 0, lines };
    case "none":
    default:
      lines.push({ label: "No corporate income tax for this entity", amount: 0 });
      return { cit: 0, lines };
  }
}

export function computeCit(input: CitInput): CitResult {
  const range = { from: input.from, to: input.to };
  const balances = accountBalances(input.entries, range);
  const nat = (a: Account) => naturalBalance(a, balances.get(a.id));
  const revenueAccounts = input.accounts.filter((a) => a.type === "revenue");
  const expenseAccounts = input.accounts.filter((a) => a.type === "expense");
  const revenue = revenueAccounts.reduce((s, a) => s + nat(a), 0);
  const expenses = expenseAccounts.reduce((s, a) => s + nat(a), 0);
  const salesAccounts = revenueAccounts.filter((a) => a.subtype === "sales");
  const turnover = (salesAccounts.length ? salesAccounts : revenueAccounts).reduce((s, a) => s + nat(a), 0);
  const accountingProfit = revenue - expenses;
  const nonDeductibleExpenses = expenseAccounts.filter((a) => a.deductible === false).map((a) => ({ code: a.code, name: a.name, amount: nat(a) })).filter((x) => x.amount !== 0);
  const nonDeductibleTotal = nonDeductibleExpenses.reduce((s, x) => s + x.amount, 0);
  const adj = input.adjustments ?? {};
  const nonTaxableIncome = Math.max(0, adj.nonTaxableIncome ?? 0);
  const otherAdjustments = (adj.otherPositive ?? 0) - (adj.otherNegative ?? 0);
  const fiscalProfit = accountingProfit + nonDeductibleTotal - nonTaxableIncome + otherAdjustments;
  const lossCarryForward = Math.min(Math.max(0, input.lossCarryForward ?? 0), Math.max(0, fiscalProfit));
  const taxableIncome = input.regime === "final_0_5" ? 0 : roundTaxableIncome(fiscalProfit - lossCarryForward);
  const { cit, lines } = taxByRegime(input.regime, taxableIncome, turnover);

  let finalTax: CitResult["finalTax"];
  if (input.regime === "final_0_5") {
    const monthly: Array<{ period: string; turnover: number; tax: number }> = [];
    const byPeriod = new Map<string, number>();
    for (const e of input.entries) {
      if (e.status !== "posted" || e.date < input.from || e.date > input.to) continue;
      for (const l of e.lines) {
        const acc = salesAccounts.find((a) => a.id === l.accountId) ?? (salesAccounts.length ? undefined : revenueAccounts.find((a) => a.id === l.accountId));
        if (!acc) continue;
        byPeriod.set(e.period, (byPeriod.get(e.period) ?? 0) + (l.credit - l.debit));
      }
    }
    for (const period of [...byPeriod.keys()].sort()) {
      const t = byPeriod.get(period) ?? 0;
      monthly.push({ period, turnover: t, tax: floorRp(Math.max(0, t) * UMKM_FINAL_RATE) });
    }
    finalTax = { rate: UMKM_FINAL_RATE, total: monthly.reduce((s, m) => s + m.tax, 0), monthly };
  }

  const credit = (tag: Account["taxTag"]) => input.accounts.filter((a) => a.taxTag === tag).reduce((s, a) => s + Math.max(0, nat(a)), 0);
  const credits = { pph25: credit("pph25_prepaid"), pph23: credit("pph23_prepaid"), pph22: credit("pph22_prepaid"), total: 0 };
  credits.total = credits.pph25 + credits.pph23 + credits.pph22;
  const pph29 = cit - credits.total;
  const nextPph25Monthly = input.regime === "final_0_5" || input.regime === "none" || input.regime === "hk_profits_tax" ? 0 : Math.max(0, floorRp((cit - credits.pph23 - credits.pph22) / 12));
  return {
    regime: input.regime, fiscalYear: input.fiscalYear, revenue, turnover, expenses, accountingProfit, nonDeductibleExpenses, nonDeductibleTotal, nonTaxableIncome,
    otherAdjustments, fiscalProfit, lossCarryForward, taxableIncome, taxLines: lines, cit, finalTax, credits, pph29, nextPph25Monthly,
  };
}
