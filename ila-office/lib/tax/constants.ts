import type { PtkpStatus } from "../types";

/**
 * Indonesian tax rates, thresholds and lookup tables used by the Tax and Payroll modules.
 * Everything that can change by regulation lives here so it can be updated in one place.
 * Pure data: no imports from next/* or lib/db.
 */

// ---------- PPh 21: PTKP (Penghasilan Tidak Kena Pajak) — PMK 101/PMK.010/2016 ----------

/** Annual PTKP for a single taxpayer without dependents (TK/0). */
export const PTKP_BASE = 54_000_000;
/** Additional PTKP for a married taxpayer (K/-). */
export const PTKP_MARRIED = 4_500_000;
/** Additional PTKP per dependent, maximum 3. */
export const PTKP_PER_DEPENDENT = 4_500_000;
export const PTKP_MAX_DEPENDENTS = 3;

export function ptkpAnnual(status: PtkpStatus): number {
  const married = status.startsWith("K");
  const dependents = Math.min(PTKP_MAX_DEPENDENTS, Number(status.split("/")[1] ?? 0));
  return PTKP_BASE + (married ? PTKP_MARRIED : 0) + dependents * PTKP_PER_DEPENDENT;
}

/** Full table for display: TK/0 54 M … K/3 72 M. */
export const PTKP_TABLE: Record<PtkpStatus, number> = {
  "TK/0": 54_000_000, "TK/1": 58_500_000, "TK/2": 63_000_000, "TK/3": 67_500_000,
  "K/0": 58_500_000, "K/1": 63_000_000, "K/2": 67_500_000, "K/3": 72_000_000,
};

// ---------- PPh 21: TER (Tarif Efektif Rata-rata) — PP 58/2023 and PMK 168/2023 ----------

export type TerCategory = "A" | "B" | "C";

/** PTKP status → TER category (PP 58/2023 art. 2). */
export const TER_CATEGORY: Record<PtkpStatus, TerCategory> = {
  "TK/0": "A", "TK/1": "A", "K/0": "A",
  "TK/2": "B", "TK/3": "B", "K/1": "B", "K/2": "B",
  "K/3": "C",
};

/** Bracket = [upper bound of monthly gross income (inclusive), effective rate]. The last bound is open. */
export type TerBracket = readonly [upper: number, rate: number];

export const TER_TABLE_A: readonly TerBracket[] = [
  [5_400_000, 0], [5_650_000, 0.0025], [5_950_000, 0.005], [6_300_000, 0.0075], [6_750_000, 0.01], [7_500_000, 0.0125],
  [8_550_000, 0.015], [9_650_000, 0.0175], [10_050_000, 0.02], [10_350_000, 0.0225], [10_700_000, 0.025], [11_050_000, 0.03],
  [11_600_000, 0.035], [12_500_000, 0.04], [13_750_000, 0.05], [15_100_000, 0.06], [16_950_000, 0.07], [19_750_000, 0.08],
  [24_150_000, 0.09], [26_450_000, 0.10], [28_000_000, 0.11], [30_050_000, 0.12], [32_400_000, 0.13], [35_400_000, 0.14],
  [39_100_000, 0.15], [43_850_000, 0.16], [47_800_000, 0.17], [51_400_000, 0.18], [56_300_000, 0.19], [62_200_000, 0.20],
  [68_600_000, 0.21], [77_500_000, 0.22], [89_000_000, 0.23], [103_000_000, 0.24], [125_000_000, 0.25], [157_000_000, 0.26],
  [206_000_000, 0.27], [337_000_000, 0.28], [454_000_000, 0.29], [550_000_000, 0.30], [695_000_000, 0.31], [910_000_000, 0.32],
  [1_400_000_000, 0.33], [Infinity, 0.34],
];

export const TER_TABLE_B: readonly TerBracket[] = [
  [6_200_000, 0], [6_500_000, 0.0025], [6_850_000, 0.005], [7_300_000, 0.0075], [9_200_000, 0.01], [10_750_000, 0.015],
  [11_250_000, 0.02], [11_600_000, 0.025], [12_600_000, 0.03], [13_600_000, 0.04], [14_950_000, 0.05], [16_400_000, 0.06],
  [18_450_000, 0.07], [21_850_000, 0.08], [26_000_000, 0.09], [27_700_000, 0.10], [29_350_000, 0.11], [31_450_000, 0.12],
  [33_950_000, 0.13], [37_100_000, 0.14], [41_100_000, 0.15], [45_800_000, 0.16], [49_500_000, 0.17], [53_800_000, 0.18],
  [58_500_000, 0.19], [64_000_000, 0.20], [71_000_000, 0.21], [80_000_000, 0.22], [93_000_000, 0.23], [109_000_000, 0.24],
  [129_000_000, 0.25], [163_000_000, 0.26], [211_000_000, 0.27], [374_000_000, 0.28], [459_000_000, 0.29], [555_000_000, 0.30],
  [704_000_000, 0.31], [957_000_000, 0.32], [1_405_000_000, 0.33], [Infinity, 0.34],
];

export const TER_TABLE_C: readonly TerBracket[] = [
  [6_600_000, 0], [6_950_000, 0.0025], [7_350_000, 0.005], [7_800_000, 0.0075], [8_850_000, 0.01], [9_800_000, 0.0125],
  [10_950_000, 0.015], [11_200_000, 0.0175], [12_050_000, 0.02], [12_950_000, 0.03], [14_150_000, 0.04], [15_550_000, 0.05],
  [17_050_000, 0.06], [19_500_000, 0.07], [22_700_000, 0.08], [26_600_000, 0.09], [28_100_000, 0.10], [30_100_000, 0.11],
  [32_600_000, 0.12], [35_400_000, 0.13], [38_900_000, 0.14], [43_000_000, 0.15], [47_400_000, 0.16], [51_200_000, 0.17],
  [55_800_000, 0.18], [60_400_000, 0.19], [66_700_000, 0.20], [74_500_000, 0.21], [83_200_000, 0.22], [95_600_000, 0.23],
  [110_000_000, 0.24], [134_000_000, 0.25], [169_000_000, 0.26], [221_000_000, 0.27], [390_000_000, 0.28], [463_000_000, 0.29],
  [561_000_000, 0.30], [709_000_000, 0.31], [965_000_000, 0.32], [1_419_000_000, 0.33], [Infinity, 0.34],
];

export const TER_TABLES: Record<TerCategory, readonly TerBracket[]> = { A: TER_TABLE_A, B: TER_TABLE_B, C: TER_TABLE_C };

// ---------- PPh 21 / PPh OP: annual progressive rates — UU PPh art. 17 as amended by UU HPP 7/2021 ----------

/** [upper bound of taxable income (inclusive), marginal rate]. */
export const PROGRESSIVE_BRACKETS: readonly (readonly [upper: number, rate: number])[] = [
  [60_000_000, 0.05], [250_000_000, 0.15], [500_000_000, 0.25], [5_000_000_000, 0.30], [Infinity, 0.35],
];

/** Biaya jabatan (occupational expense deduction): 5% of gross, capped per month / per year (PMK 250/PMK.03/2008). */
export const BIAYA_JABATAN_RATE = 0.05;
export const BIAYA_JABATAN_MAX_MONTHLY = 500_000;
export const BIAYA_JABATAN_MAX_ANNUAL = 6_000_000;

/** Taxpayers without NPWP pay 120% of the PPh 21 due (UU PPh art. 21(5a)). */
export const NO_NPWP_PPH21_MULTIPLIER = 1.2;

/** Annual taxable income is rounded down to the nearest thousand rupiah. */
export const TAXABLE_INCOME_ROUNDING = 1_000;

// ---------- BPJS ----------

/** BPJS Kesehatan (Perpres 82/2018 and 64/2020): 5% of wage, employer 4%, employee 1%, wage base capped. */
export const BPJS_KESEHATAN = { employer: 0.04, employee: 0.01, wageCap: 12_000_000 };
/** BPJS Ketenagakerjaan JHT (PP 46/2015): 5.7% of wage, employer 3.7%, employee 2%. No cap. */
export const BPJS_JHT = { employer: 0.037, employee: 0.02 };
/** BPJS Ketenagakerjaan JP (PP 45/2015): 3% of wage, employer 2%, employee 1%. Wage base capped (2025 ceiling, adjusted each March). */
export const BPJS_JP = { employer: 0.02, employee: 0.01, wageCap: 10_547_400 };
/** JKK (work accident) employer rate by risk class I–V (PP 44/2015). */
export const BPJS_JKK_RATES: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0.0024, 2: 0.0054, 3: 0.0089, 4: 0.0127, 5: 0.0174 };
/** JKM (death) employer rate (PP 44/2015). */
export const BPJS_JKM_RATE = 0.003;

// ---------- Withholding taxes (unified SPT Masa PPh / e-Bupot Unifikasi) ----------

export type WithholdingKind = "pph21" | "pph23" | "pph26" | "pph4_2" | "pph15" | "pph22";

export interface WithholdingObject {
  code: string;
  type: WithholdingKind;
  label: string;
  rate: number;
  /** Rate is doubled (PPh 23) or raised by 20% (PPh 21) when the recipient has no NPWP. */
  noNpwpSurcharge?: "double" | "plus20";
  /** PPh 26: treaty rate may replace the statutory 20% when a DGT form is on file. */
  treatyEligible?: boolean;
  final?: boolean;
}

/** DJP income-type codes (Kode Objek Pajak) as used in e-Bupot Unifikasi (PER-24/PJ/2021). Rates per UU PPh and PMK 141/2015, PP 9/2022. */
export const WITHHOLDING_OBJECTS: readonly WithholdingObject[] = [
  // PPh 23 (UU PPh art. 23): 15% dividends/interest/royalties/prizes, 2% rent of movable assets and services; ×2 without NPWP.
  { code: "24-100-01", type: "pph23", label: "Dividen (dividends)", rate: 0.15, noNpwpSurcharge: "double" },
  { code: "24-101-01", type: "pph23", label: "Bunga (interest)", rate: 0.15, noNpwpSurcharge: "double" },
  { code: "24-102-01", type: "pph23", label: "Royalti (royalties)", rate: 0.15, noNpwpSurcharge: "double" },
  { code: "24-103-01", type: "pph23", label: "Hadiah dan penghargaan (prizes and awards)", rate: 0.15, noNpwpSurcharge: "double" },
  { code: "24-104-01", type: "pph23", label: "Sewa harta selain tanah/bangunan (rent of movable assets)", rate: 0.02, noNpwpSurcharge: "double" },
  { code: "24-104-02", type: "pph23", label: "Jasa teknik (technical services)", rate: 0.02, noNpwpSurcharge: "double" },
  { code: "24-104-03", type: "pph23", label: "Jasa manajemen (management services)", rate: 0.02, noNpwpSurcharge: "double" },
  { code: "24-104-04", type: "pph23", label: "Jasa konsultan (consulting services)", rate: 0.02, noNpwpSurcharge: "double" },
  { code: "24-104-05", type: "pph23", label: "Jasa lain PMK 141/2015 (other services: accounting, legal, cleaning, catering, IT…)", rate: 0.02, noNpwpSurcharge: "double" },
  // PPh 26 (UU PPh art. 26): 20% on payments to non-residents; treaty rate with DGT form (PER-25/PJ/2018).
  { code: "27-100-01", type: "pph26", label: "Dividen kepada WPLN (dividends to non-residents)", rate: 0.20, treatyEligible: true },
  { code: "27-101-01", type: "pph26", label: "Bunga kepada WPLN (interest to non-residents)", rate: 0.20, treatyEligible: true },
  { code: "27-102-01", type: "pph26", label: "Royalti kepada WPLN (royalties to non-residents)", rate: 0.20, treatyEligible: true },
  { code: "27-103-01", type: "pph26", label: "Sewa dan penghasilan lain penggunaan harta (rent to non-residents)", rate: 0.20, treatyEligible: true },
  { code: "27-104-01", type: "pph26", label: "Imbalan jasa, pekerjaan, kegiatan (services by non-residents)", rate: 0.20, treatyEligible: true },
  { code: "27-105-01", type: "pph26", label: "Hadiah dan penghargaan (prizes to non-residents)", rate: 0.20, treatyEligible: true },
  // PPh 4(2) final (UU PPh art. 4(2); PP 34/2017 rent; PP 9/2022 construction; PP 55/2022 UMKM).
  { code: "28-403-01", type: "pph4_2", label: "Persewaan tanah dan/atau bangunan (land/building rent)", rate: 0.10, final: true },
  { code: "28-409-01", type: "pph4_2", label: "Jasa konstruksi: pelaksana, kualifikasi kecil bersertifikat (construction, certified small)", rate: 0.0175, final: true },
  { code: "28-409-02", type: "pph4_2", label: "Jasa konstruksi: pelaksana tanpa sertifikat (construction, uncertified)", rate: 0.04, final: true },
  { code: "28-409-03", type: "pph4_2", label: "Jasa konstruksi: pelaksana, kualifikasi lain bersertifikat (construction, other certified)", rate: 0.0265, final: true },
  { code: "28-409-04", type: "pph4_2", label: "Jasa konstruksi: perencana/pengawas bersertifikat (design/supervision, certified)", rate: 0.035, final: true },
  { code: "28-409-05", type: "pph4_2", label: "Jasa konstruksi: perencana/pengawas tanpa sertifikat (design/supervision, uncertified)", rate: 0.06, final: true },
  { code: "28-423-01", type: "pph4_2", label: "PPh final UMKM PP 55/2022 (0.5% of gross turnover)", rate: 0.005, final: true },
  { code: "28-404-01", type: "pph4_2", label: "Hadiah undian (lottery prizes)", rate: 0.25, final: true },
  // PPh 21 non-employee (bukan pegawai, PER-16/PJ/2016): 50% of gross × art. 17 rate (5% on the first 60 M); +20% without NPWP.
  { code: "21-100-03", type: "pph21", label: "Bukan pegawai: imbalan jasa (non-employee fees, 50% × 5%)", rate: 0.025, noNpwpSurcharge: "plus20" },
  // PPh 15 (shipping) and PPh 22 (import) — rarely used by ILA clients; included for completeness.
  { code: "28-407-01", type: "pph15", label: "Pelayaran dalam negeri (domestic shipping)", rate: 0.012, final: true },
  { code: "28-408-01", type: "pph15", label: "Pelayaran/penerbangan luar negeri (foreign shipping/airline)", rate: 0.0264, final: true },
  { code: "22-100-01", type: "pph22", label: "PPh 22 impor dengan API (import with API)", rate: 0.025 },
  { code: "22-100-02", type: "pph22", label: "PPh 22 impor tanpa API (import without API)", rate: 0.075 },
];

/** Multiplier applied to PPh 23 when the recipient has no NPWP (UU PPh art. 23(1a)): 100% higher. */
export const NO_NPWP_PPH23_MULTIPLIER = 2;
/** Statutory PPh 26 rate. */
export const PPH26_RATE = 0.20;

// ---------- PPN (VAT) — UU HPP 7/2021, PMK 131/2024 ----------

/** PPN rate options. 2025: statutory 12% applied on a DPP of 11/12 of the price for most goods/services = effective 11%. */
export const PPN_RATES = { standard_11: 0.11, statutory_12: 0.12 } as const;
export const PPN_DPP_FRACTION_2025 = 11 / 12;
export const PPN_DEFAULT_RATE = 0.11;

// ---------- Corporate income tax — UU PPh art. 17(1b), 31E; PP 55/2022; HK IRO ----------

export const CIT_RATE = 0.22;
/** Art. 31E: 50% discount on the part of taxable income attributable to turnover up to 4.8 bn, for turnover ≤ 50 bn. */
export const ART_31E_DISCOUNT = 0.5;
export const ART_31E_SMALL_TURNOVER = 4_800_000_000;
export const ART_31E_MAX_TURNOVER = 50_000_000_000;
/** PP 55/2022 (ex PP 23/2018): final 0.5% of monthly gross turnover for eligible SMEs (turnover < 4.8 bn). */
export const UMKM_FINAL_RATE = 0.005;
export const UMKM_TURNOVER_CEILING = 4_800_000_000;
/** Hong Kong two-tier profits tax (IRO): 8.25% on the first HKD 2,000,000 of assessable profits, 16.5% above. Threshold in the entity's base currency. */
export const HK_TWO_TIER = { lowerRate: 0.0825, upperRate: 0.165, threshold: 2_000_000 };

// ---------- Compliance calendar due-day rules ----------

export const DUE_DAYS = {
  /** Client data for month M is due by the 5th of M+1 (ILA SOP: 3rd–5th). */
  clientData: 5,
  /** Unified SPT Masa PPh (21/23/26/4(2)): payment by the 10th, report by the 20th of M+1 (PMK 242/2014, PMK 243/2014). */
  unifiedPayment: 10,
  unifiedReport: 20,
  /** PPh 25 instalment and PPh final 0.5%: by the 15th of M+1. */
  pph25: 15,
  umkmFinal: 15,
  /** Regional tax (PB1 / PBJT): by the 15th of M+1 (Perda; varies by regency). */
  localTax: 15,
  /** BPJS contributions: by the 15th of the following month. */
  bpjs: 15,
  /** Salaries paid on the 1st of M+1; payroll reminder to clients from the 20th of M. */
  payrollPay: 1,
  payrollReminder: 20,
  /** LKPM: by the 10th of the month following the quarter (Perka BKPM 5/2021). */
  lkpm: 10,
  /** Monthly bookkeeping report stored in the client's Drive by the 20th of M+1. */
  bookkeepingReport: 20,
} as const;

/** Annual deadlines (month-day) applied to year+1. */
export const ANNUAL_DUE = {
  sptOp: "03-31",
  sptBadan: "04-30",
  gms: "06-30",
  /** Hong Kong: Business Registration renewal / annual return; set to the anniversary in practice — default end of April. */
  hkAnnual: "04-30",
} as const;
