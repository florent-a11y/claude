import type { WithholdingSlip } from "../types";
import { NO_NPWP_PPH21_MULTIPLIER, NO_NPWP_PPH23_MULTIPLIER, PPH26_RATE, WITHHOLDING_OBJECTS, type WithholdingKind, type WithholdingObject } from "./constants";

/**
 * Withholding tax (bukti potong) arithmetic for the unified SPT Masa PPh. Pure.
 */

export function withholdingObject(code: string): WithholdingObject | undefined {
  return WITHHOLDING_OBJECTS.find((o) => o.code === code);
}

export function objectsForType(type: WithholdingKind): WithholdingObject[] {
  return WITHHOLDING_OBJECTS.filter((o) => o.type === type);
}

/** Default object code when a bill only tells us the withholding type. */
export function defaultObjectCode(type: WithholdingKind): string {
  const defaults: Record<WithholdingKind, string> = { pph23: "24-104-05", pph26: "27-104-01", pph4_2: "28-403-01", pph21: "21-100-03", pph15: "28-407-01", pph22: "22-100-01" };
  return defaults[type];
}

export interface WithholdingInput {
  type: WithholdingKind;
  objectCode: string;
  /** DPP (gross amount paid), IDR. */
  baseAmount: number;
  hasNpwp: boolean;
  /** PPh 26 only: the treaty rate when a valid DGT form is on file (e.g. 0.10); undefined → statutory 20%. */
  treatyRate?: number;
  /** Manual rate override (e.g. an SKB or a non-listed object). */
  rateOverride?: number;
}

export interface WithholdingResult {
  type: WithholdingKind;
  objectCode: string;
  objectLabel: string;
  baseAmount: number;
  /** Statutory rate of the object before surcharges. */
  statutoryRate: number;
  /** Rate actually applied (after treaty / no-NPWP adjustments). */
  rate: number;
  taxAmount: number;
  treatyApplied: boolean;
  noNpwpSurchargeApplied: boolean;
  final: boolean;
}

function floorRp(n: number): number {
  return Math.floor(n + 1e-9);
}

export function computeWithholding(input: WithholdingInput): WithholdingResult {
  const obj = withholdingObject(input.objectCode);
  const statutoryRate = input.rateOverride ?? obj?.rate ?? (input.type === "pph26" ? PPH26_RATE : 0);
  let rate = statutoryRate;
  let treatyApplied = false;
  let noNpwpSurchargeApplied = false;
  if (input.type === "pph26" && input.treatyRate !== undefined && input.rateOverride === undefined) {
    rate = input.treatyRate;
    treatyApplied = true;
  }
  if (!input.hasNpwp && input.rateOverride === undefined) {
    if (obj?.noNpwpSurcharge === "double" || (input.type === "pph23" && !obj)) { rate = statutoryRate * NO_NPWP_PPH23_MULTIPLIER; noNpwpSurchargeApplied = true; }
    else if (obj?.noNpwpSurcharge === "plus20") { rate = statutoryRate * NO_NPWP_PPH21_MULTIPLIER; noNpwpSurchargeApplied = true; }
  }
  const baseAmount = floorRp(Math.max(0, input.baseAmount));
  const taxAmount = floorRp(baseAmount * rate);
  return { type: input.type, objectCode: input.objectCode, objectLabel: obj?.label ?? input.objectCode, baseAmount, statutoryRate, rate, taxAmount, treatyApplied, noNpwpSurchargeApplied, final: Boolean(obj?.final) };
}

export const WITHHOLDING_TYPE_LABELS: Record<WithholdingKind, string> = {
  pph21: "PPh 21", pph23: "PPh 23", pph26: "PPh 26", pph4_2: "PPh 4(2)", pph15: "PPh 15", pph22: "PPh 22",
};

export interface WithholdingSummaryRow { type: WithholdingKind; count: number; baseAmount: number; taxAmount: number; issued: number; reported: number }

/** Per-type totals for a set of slips (one period). */
export function summariseSlips(slips: WithholdingSlip[]): WithholdingSummaryRow[] {
  const map = new Map<WithholdingKind, WithholdingSummaryRow>();
  for (const s of slips) {
    const row = map.get(s.type) ?? { type: s.type, count: 0, baseAmount: 0, taxAmount: 0, issued: 0, reported: 0 };
    row.count += 1;
    row.baseAmount += s.baseAmount;
    row.taxAmount += s.taxAmount;
    if (s.status !== "draft") row.issued += 1;
    if (s.status === "reported") row.reported += 1;
    map.set(s.type, row);
  }
  return [...map.values()].sort((a, b) => a.type.localeCompare(b.type));
}

/** Column layout modelled on the DJP e-Bupot Unifikasi bulk-import template (one row per bukti potong). */
export const EBUPOT_HEADER = [
  "No", "Tgl Pemotongan", "Jenis Pajak", "Kode Objek Pajak", "Nama Objek Pajak", "NPWP/NIK Penerima", "Nama Penerima", "Alamat Penerima", "Negara",
  "Nomor Bukti Potong", "Masa Pajak", "Penghasilan Bruto (DPP)", "Tarif (%)", "PPh Dipotong", "Fasilitas (DGT/SKB)", "Jenis Dokumen", "Nomor Dokumen", "Keterangan", "NTPN", "Status",
] as const;

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const JENIS: Record<WithholdingKind, string> = { pph21: "PPh Pasal 21", pph23: "PPh Pasal 23", pph26: "PPh Pasal 26", pph4_2: "PPh Pasal 4 ayat (2)", pph15: "PPh Pasal 15", pph22: "PPh Pasal 22" };

export function ebupotRows(slips: WithholdingSlip[], billNumbers: Map<string, string> = new Map()): unknown[][] {
  return slips.map((s, i) => [
    i + 1, ddmmyyyy(s.date), JENIS[s.type], s.objectCode, s.objectLabel, s.counterparty.npwp ?? s.counterparty.nik ?? "", s.counterparty.name, s.counterparty.address ?? "",
    s.counterparty.country ?? "ID", s.number, s.period, s.baseAmount, (s.rate * 100).toFixed(2), s.taxAmount, s.treatyApplied ? "DGT" : "N",
    s.billId ? "Invoice" : "", s.billId ? billNumbers.get(s.billId) ?? s.billId : "", s.description ?? "", s.ntpn ?? "", s.status,
  ]);
}
