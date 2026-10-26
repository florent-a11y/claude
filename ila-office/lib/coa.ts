import type { Account, AccountSubtype, AccountType, TaxTag } from "./types";

/**
 * Standard chart of accounts for an Indonesian PT (PSAK-style numbering, bilingual names) used when a new
 * entity's books are initialised. Tax tags let the tax and payroll modules find the right accounts.
 */
type Row = [code: string, name: string, nameId: string, type: AccountType, subtype: AccountSubtype, taxTag?: TaxTag, deductible?: boolean];

export const COA_TEMPLATE: Row[] = [
  // Assets
  ["1-1000", "Cash on hand", "Kas", "asset", "cash"],
  ["1-1100", "Bank IDR", "Bank IDR", "asset", "bank", "bank_default"],
  ["1-1110", "Bank USD", "Bank USD", "asset", "bank"],
  ["1-1200", "Accounts receivable", "Piutang usaha", "asset", "ar", "ar_trade"],
  ["1-1210", "Other receivables", "Piutang lain-lain", "asset", "other_receivable"],
  ["1-1220", "Employee advances", "Uang muka karyawan", "asset", "other_receivable"],
  ["1-1300", "Prepaid expenses", "Biaya dibayar di muka", "asset", "prepaid"],
  ["1-1310", "Deposits paid", "Jaminan / deposit", "asset", "prepaid"],
  ["1-1400", "Prepaid tax PPh 25", "PPh 25 dibayar di muka", "asset", "prepaid_tax", "pph25_prepaid"],
  ["1-1410", "Prepaid tax PPh 23 (withheld by customers)", "PPh 23 dipotong pelanggan", "asset", "prepaid_tax", "pph23_prepaid"],
  ["1-1420", "Prepaid tax PPh 22", "PPh 22 dibayar di muka", "asset", "prepaid_tax", "pph22_prepaid"],
  ["1-1430", "VAT input (PPN Masukan)", "PPN Masukan", "asset", "prepaid_tax", "ppn_input"],
  ["1-1500", "Inventory", "Persediaan", "asset", "inventory"],
  ["1-2000", "Land", "Tanah", "asset", "fixed_asset"],
  ["1-2100", "Buildings", "Bangunan", "asset", "fixed_asset"],
  ["1-2110", "Accumulated depreciation - buildings", "Akumulasi penyusutan bangunan", "asset", "accum_depr"],
  ["1-2200", "Vehicles", "Kendaraan", "asset", "fixed_asset"],
  ["1-2210", "Accumulated depreciation - vehicles", "Akumulasi penyusutan kendaraan", "asset", "accum_depr"],
  ["1-2300", "Equipment and furniture", "Peralatan dan perlengkapan", "asset", "fixed_asset"],
  ["1-2310", "Accumulated depreciation - equipment", "Akumulasi penyusutan peralatan", "asset", "accum_depr"],
  ["1-2400", "Leasehold rights (HGB / sewa jangka panjang)", "Hak sewa / HGB", "asset", "fixed_asset"],
  ["1-2410", "Accumulated amortisation - leasehold", "Akumulasi amortisasi hak sewa", "asset", "accum_depr"],
  ["1-2500", "Construction in progress", "Aset dalam penyelesaian", "asset", "other_asset"],
  ["1-9000", "Suspense", "Akun sementara", "asset", "other_asset", "suspense"],
  // Liabilities
  ["2-1000", "Accounts payable", "Utang usaha", "liability", "ap", "ap_trade"],
  ["2-1100", "Accrued expenses", "Biaya yang masih harus dibayar", "liability", "accrued"],
  ["2-1200", "Customer deposits / unearned revenue", "Uang muka pelanggan", "liability", "customer_deposit"],
  ["2-1300", "PPh 21 payable", "Utang PPh 21", "liability", "tax_payable", "pph21_payable"],
  ["2-1310", "PPh 23 payable", "Utang PPh 23", "liability", "tax_payable", "pph23_payable"],
  ["2-1320", "PPh 26 payable", "Utang PPh 26", "liability", "tax_payable", "pph26_payable"],
  ["2-1330", "PPh 4(2) final payable", "Utang PPh Pasal 4 ayat (2)", "liability", "tax_payable", "pph4_2_payable"],
  ["2-1340", "VAT output (PPN Keluaran)", "PPN Keluaran", "liability", "tax_payable", "ppn_output"],
  ["2-1350", "Corporate income tax payable", "Utang PPh Badan", "liability", "tax_payable", "cit_payable"],
  ["2-1360", "Regional tax payable (PB1 / PBJT)", "Utang pajak daerah", "liability", "tax_payable", "local_tax_payable"],
  ["2-1400", "BPJS payable", "Utang BPJS", "liability", "tax_payable", "bpjs_payable"],
  ["2-1500", "Salaries payable", "Utang gaji", "liability", "accrued"],
  ["2-1600", "Dividends payable", "Utang dividen", "liability", "other_liability"],
  ["2-2000", "Shareholder loans", "Pinjaman pemegang saham", "liability", "loan"],
  ["2-2100", "Bank loans", "Pinjaman bank", "liability", "loan"],
  ["2-2200", "Security deposits received", "Jaminan diterima", "liability", "other_liability"],
  // Equity
  ["3-1000", "Share capital (paid-up)", "Modal disetor", "equity", "share_capital"],
  ["3-1100", "Additional paid-in capital", "Agio saham", "equity", "share_capital"],
  ["3-2000", "Retained earnings", "Laba ditahan", "equity", "retained_earnings", "retained_earnings"],
  ["3-2100", "Current year earnings", "Laba tahun berjalan", "equity", "current_earnings", "current_earnings"],
  ["3-3000", "Dividends declared", "Dividen", "equity", "dividend"],
  // Revenue
  ["4-1000", "Service revenue", "Pendapatan jasa", "revenue", "sales", "sales_default"],
  ["4-1100", "Rental revenue (villa / property)", "Pendapatan sewa", "revenue", "sales"],
  ["4-1200", "Sales of goods", "Penjualan barang", "revenue", "sales"],
  ["4-1300", "Management fees", "Pendapatan jasa manajemen", "revenue", "sales"],
  ["4-1900", "Sales discounts", "Potongan penjualan", "revenue", "sales"],
  ["7-1000", "Interest income", "Pendapatan bunga", "revenue", "other_income"],
  ["7-1100", "Foreign exchange gain", "Laba selisih kurs", "revenue", "fx_gain", "fx_gain"],
  ["7-1200", "Other income", "Pendapatan lain-lain", "revenue", "other_income"],
  // Cost of sales
  ["5-1000", "Cost of services - government fees and disbursements", "Beban jasa - biaya pemerintah", "expense", "cogs"],
  ["5-1100", "Cost of services - notary and agents", "Beban jasa - notaris dan agen", "expense", "cogs"],
  ["5-1200", "Cost of goods sold", "Harga pokok penjualan", "expense", "cogs"],
  ["5-1300", "Subcontractors", "Subkontraktor", "expense", "cogs"],
  // Operating expenses
  ["6-1000", "Salaries and wages", "Gaji dan upah", "expense", "payroll", "salary_expense"],
  ["6-1010", "Allowances and bonuses", "Tunjangan dan bonus", "expense", "payroll"],
  ["6-1020", "BPJS employer contributions", "BPJS beban perusahaan", "expense", "payroll", "bpjs_expense"],
  ["6-1030", "Severance and benefits", "Pesangon dan imbalan kerja", "expense", "payroll"],
  ["6-1100", "Office rent", "Sewa kantor", "expense", "opex"],
  ["6-1110", "Virtual office / commercial address", "Alamat usaha / kantor virtual", "expense", "opex"],
  ["6-1200", "Utilities and internet", "Listrik, air, internet", "expense", "opex"],
  ["6-1300", "Professional fees (legal, accounting, consulting)", "Jasa profesional", "expense", "opex"],
  ["6-1310", "Resident director / nominee fees", "Jasa direktur / nominee", "expense", "opex"],
  ["6-1400", "Licences, permits and government fees", "Perizinan dan biaya pemerintah", "expense", "opex"],
  ["6-1500", "Marketing and advertising", "Pemasaran dan iklan", "expense", "opex"],
  ["6-1510", "Entertainment (with nominative list)", "Jamuan (dengan daftar nominatif)", "expense", "opex"],
  ["6-1600", "Travel and transport", "Perjalanan dinas dan transportasi", "expense", "opex"],
  ["6-1700", "Office supplies and software", "Perlengkapan kantor dan perangkat lunak", "expense", "opex"],
  ["6-1800", "Repairs and maintenance", "Perbaikan dan pemeliharaan", "expense", "opex"],
  ["6-1900", "Insurance", "Asuransi", "expense", "opex"],
  ["6-2000", "Bank charges", "Biaya administrasi bank", "expense", "opex"],
  ["6-2100", "Depreciation expense", "Beban penyusutan", "expense", "depreciation"],
  ["6-2110", "Amortisation expense", "Beban amortisasi", "expense", "depreciation"],
  ["6-2200", "Donations and gifts (non-deductible)", "Sumbangan (tidak dapat dikurangkan)", "expense", "opex", undefined, false],
  ["6-2300", "Tax penalties and fines (non-deductible)", "Sanksi pajak (tidak dapat dikurangkan)", "expense", "opex", undefined, false],
  ["6-2400", "Benefits in kind (natura)", "Natura", "expense", "opex"],
  ["6-9000", "Other operating expenses", "Beban operasional lainnya", "expense", "opex"],
  ["8-1000", "Interest expense", "Beban bunga", "expense", "other_expense"],
  ["8-1100", "Foreign exchange loss", "Rugi selisih kurs", "expense", "fx_loss", "fx_loss"],
  ["8-1200", "Other expenses", "Beban lain-lain", "expense", "other_expense"],
  ["9-1000", "Corporate income tax expense", "Beban PPh Badan", "expense", "tax_expense", "cit_expense", false],
  ["9-1100", "Final tax expense (PPh final)", "Beban PPh final", "expense", "tax_expense", undefined, false],
];

/** Hong Kong companies keep the same structure with HK-specific tax lines. */
export const COA_HK_EXTRA: Row[] = [
  ["2-1370", "Profits tax payable", "Profits tax payable", "liability", "tax_payable", "cit_payable"],
  ["9-1200", "Profits tax expense", "Profits tax expense", "expense", "tax_expense", "cit_expense", false],
];

export function normalBalanceOf(type: AccountType): "debit" | "credit" {
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

export function buildAccounts(entityId: string, newId: () => string, opts: { country?: string } = {}): Account[] {
  const rows = opts.country === "HK" ? [...COA_TEMPLATE, ...COA_HK_EXTRA] : COA_TEMPLATE;
  return rows.map(([code, name, nameId, type, subtype, taxTag, deductible]) => ({
    id: newId(), entityId, code, name, nameId, type, subtype, normalBalance: normalBalanceOf(type), taxTag,
    deductible: deductible ?? (type === "expense" ? true : undefined), isSystem: Boolean(taxTag), active: true,
  }));
}
