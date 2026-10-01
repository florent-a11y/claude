import type { Account, Employee, FixedAsset, JournalEntry, TaxObligation } from "../types";
import { accountBalances, naturalBalance } from "../balances";

/**
 * LKPM (Laporan Kegiatan Penanaman Modal) quarterly data pack. Pure: assembles the figures BKPM's OSS form asks for
 * from the ledger, the employee register and the fixed-asset register.
 */

export type LkpmAssetCategory = "land" | "buildings" | "machinery" | "other";
export const LKPM_ASSET_LABELS: Record<LkpmAssetCategory, string> = { land: "Tanah (land)", buildings: "Bangunan (buildings)", machinery: "Mesin/peralatan/kendaraan (machinery, equipment, vehicles)", other: "Lain-lain (other fixed assets)" };

export interface LkpmPack {
  quarter: string;
  from: string;
  to: string;
  fixedAssets: Record<LkpmAssetCategory, number>;
  fixedAssetsTotal: number;
  /** Fixed-asset register additions during the quarter. */
  assetAdditions: Array<{ name: string; date: string; cost: number; category: LkpmAssetCategory }>;
  /** Working capital = operating expenses of the quarter (excluding depreciation and tax expense). */
  workingCapital: number;
  /** Realisasi investasi to date = fixed assets (cumulative) + working capital of the quarter. */
  investmentRealisation: number;
  paidUpCapital: number;
  revenueQuarter: number;
  expensesQuarter: number;
  headcount: { local: number; foreign: number; total: number };
  foreignEmployees: Array<{ name: string; position?: string; passportNumber?: string }>;
  outstandingObligations: TaxObligation[];
}

export function quarterRange(quarter: string): { from: string; to: string } {
  const y = Number(quarter.slice(0, 4));
  const q = Number(quarter.slice(6));
  const m1 = (q - 1) * 3 + 1;
  const lastDay = new Date(Date.UTC(y, m1 + 2, 0)).getUTCDate();
  return { from: `${y}-${String(m1).padStart(2, "0")}-01`, to: `${y}-${String(m1 + 2).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` };
}

export function assetCategoryOf(account: Pick<Account, "name" | "nameId" | "code">): LkpmAssetCategory {
  const s = `${account.name} ${account.nameId ?? ""}`.toLowerCase();
  if (/\b(land|tanah)\b/.test(s)) return "land";
  if (/(building|bangunan|gedung)/.test(s)) return "buildings";
  if (/(vehicle|kendaraan|machin|mesin|equipment|peralatan|computer|komputer|furniture)/.test(s)) return "machinery";
  return "other";
}

export interface LkpmInput {
  quarter: string;
  accounts: Account[];
  entries: JournalEntry[];
  employees: Employee[];
  fixedAssets: FixedAsset[];
  obligations: TaxObligation[];
}

export function buildLkpmPack(input: LkpmInput): LkpmPack {
  const { from, to } = quarterRange(input.quarter);
  const cumulative = accountBalances(input.entries, { to });
  const quarterly = accountBalances(input.entries, { from, to });
  const natC = (a: Account) => naturalBalance(a, cumulative.get(a.id));
  const natQ = (a: Account) => naturalBalance(a, quarterly.get(a.id));
  const fixedAssets: Record<LkpmAssetCategory, number> = { land: 0, buildings: 0, machinery: 0, other: 0 };
  for (const a of input.accounts) if (a.subtype === "fixed_asset") fixedAssets[assetCategoryOf(a)] += natC(a);
  const fixedAssetsTotal = fixedAssets.land + fixedAssets.buildings + fixedAssets.machinery + fixedAssets.other;
  const byId = new Map(input.accounts.map((a) => [a.id, a]));
  const assetAdditions = input.fixedAssets.filter((f) => f.acquisitionDate >= from && f.acquisitionDate <= to).map((f) => {
    const acc = byId.get(f.assetAccountId);
    return { name: f.name, date: f.acquisitionDate, cost: f.cost, category: acc ? assetCategoryOf(acc) : ("other" as LkpmAssetCategory) };
  });
  const workingCapital = input.accounts.filter((a) => a.type === "expense" && a.subtype !== "depreciation" && a.subtype !== "tax_expense").reduce((s, a) => s + natQ(a), 0);
  const expensesQuarter = input.accounts.filter((a) => a.type === "expense").reduce((s, a) => s + natQ(a), 0);
  const revenueQuarter = input.accounts.filter((a) => a.type === "revenue").reduce((s, a) => s + natQ(a), 0);
  const paidUpCapital = input.accounts.filter((a) => a.subtype === "share_capital").reduce((s, a) => s + natC(a), 0);
  const staff = input.employees.filter((e) => e.joinDate <= to && (e.endDate ? e.endDate >= from : e.active));
  const foreign = staff.filter((e) => e.isForeign);
  const outstandingObligations = input.obligations.filter((o) => o.reportDue <= to && o.status !== "reported" && o.status !== "nil" && o.status !== "paid").sort((a, b) => a.reportDue.localeCompare(b.reportDue));
  return {
    quarter: input.quarter, from, to, fixedAssets, fixedAssetsTotal, assetAdditions, workingCapital,
    investmentRealisation: fixedAssetsTotal + Math.max(0, workingCapital), paidUpCapital, revenueQuarter, expensesQuarter,
    headcount: { local: staff.length - foreign.length, foreign: foreign.length, total: staff.length },
    foreignEmployees: foreign.map((e) => ({ name: e.name, position: e.position, passportNumber: e.passportNumber })),
    outstandingObligations,
  };
}

export function quartersOf(year: number): string[] {
  return [1, 2, 3, 4].map((q) => `${year}-Q${q}`);
}
