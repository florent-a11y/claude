import type { Entity, WithholdingFacility, WithholdingSlip } from "../types";
import { WITHHOLDING_DOCUMENT_LABELS, WITHHOLDING_FACILITY_LABELS } from "../types";
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
  /** Amount entered, IDR: the DPP, or the gross when `grossAmount` is set (then the DPP is derived with `dppPercent`). */
  baseAmount: number;
  /** Penghasilan bruto; when given, DPP = gross × dppPercent / 100. */
  grossAmount?: number;
  /** Overrides the object's deemed DPP percentage (default: the object's, else 100). */
  dppPercent?: number;
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
  grossAmount: number;
  dppPercent: number;
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
  const dppPercent = input.dppPercent ?? obj?.dppPercent ?? 100;
  const grossAmount = floorRp(Math.max(0, input.grossAmount ?? (dppPercent === 100 ? input.baseAmount : input.baseAmount * 100 / dppPercent)));
  const baseAmount = input.grossAmount !== undefined || dppPercent !== 100 ? floorRp(grossAmount * dppPercent / 100) : floorRp(Math.max(0, input.baseAmount));
  const taxAmount = floorRp(baseAmount * rate);
  return { type: input.type, objectCode: input.objectCode, objectLabel: obj?.label ?? input.objectCode, grossAmount, dppPercent, baseAmount, statutoryRate, rate, taxAmount, treatyApplied, noNpwpSurchargeApplied, final: Boolean(obj?.final) };
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

// ---------- Identifiers, form kinds and Coretax export ----------

/** Digits of an NPWP/NIK in the 16-digit Coretax form: a 15-digit NPWP gets a leading 0; a 16-digit NIK/NPWP stays. */
export function npwp16(id?: string | null): string {
  const d = (id ?? "").replace(/\D/g, "");
  if (d.length === 15) return `0${d}`;
  return d;
}

/** NITKU: the stored one, else NPWP16 + "000000" (head office). */
export function nitkuOf(id?: string | null, nitku?: string | null): string {
  const stored = (nitku ?? "").replace(/\D/g, "");
  if (stored.length === 22) return stored;
  const n = npwp16(id);
  return n.length === 16 ? `${n}000000` : "";
}

/** "123456789012345" → "12.345.678.9-012.345"; 16 digits are shown as-is in groups of four. */
export function formatTaxId(id?: string | null): string {
  const d = (id ?? "").replace(/\D/g, "");
  if (d.length === 15) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}.${d.slice(8, 9)}-${d.slice(9, 12)}.${d.slice(12)}`;
  return d || (id ?? "");
}

/** Which official form a slip prints on: BP21 for PPh 21 (non-employees), BPPU (unifikasi) for everything else. */
export function bupotKind(type: WithholdingKind): "BPPU" | "BP21" {
  return type === "pph21" ? "BP21" : "BPPU";
}

export const BUPOT_TITLES: Record<"BPPU" | "BP21", string[]> = {
  BPPU: ["BUKTI PEMOTONGAN DAN/ATAU PEMUNGUTAN PPh", "UNIFIKASI BERFORMAT STANDAR"],
  BP21: ["BUKTI PEMOTONGAN", "PAJAK PENGHASILAN PASAL 21 YANG TIDAK", "BERSIFAT FINAL DAN PAJAK PENGHASILAN", "PASAL 21 YANG BERSIFAT FINAL"],
};

export const JENIS_PPH: Record<WithholdingKind, string> = { pph21: "Pasal 21", pph23: "Pasal 23", pph26: "Pasal 26", pph4_2: "Pasal 4 ayat (2)", pph15: "Pasal 15", pph22: "Pasal 22" };

export function facilityOf(slip: Pick<WithholdingSlip, "facility" | "treatyApplied">): WithholdingFacility {
  return slip.facility ?? (slip.treatyApplied ? "p3b" : "none");
}

export function facilityLabel(slip: Pick<WithholdingSlip, "facility" | "treatyApplied">): string {
  return WITHHOLDING_FACILITY_LABELS[facilityOf(slip)];
}

export function documentLabel(slip: Pick<WithholdingSlip, "document" | "billId">): string {
  if (slip.document) return WITHHOLDING_DOCUMENT_LABELS[slip.document.type];
  return slip.billId ? WITHHOLDING_DOCUMENT_LABELS.invoice : "";
}

/** Sifat pemotongan: final or not, from the object table. */
export function isFinal(slip: Pick<WithholdingSlip, "objectCode" | "type">): boolean {
  return Boolean(withholdingObject(slip.objectCode)?.final) || slip.type === "pph4_2" || slip.type === "pph15";
}

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Coretax bulk-import layout, one row per bukti potong. Column names follow the fields of the Coretax BPPU / BP21
 * import templates; verify the order against the template downloaded from Coretax (e-Bupot › Impor › Unduh template)
 * before uploading, and adjust here if DJP changes it.
 */
export const CORETAX_HEADER = [
  "Jenis Bukti Potong", "NPWP Pemotong", "NITKU Pemotong", "Masa Pajak (Bulan)", "Tahun Pajak", "Sifat Pemotongan", "Status Bukti Potong",
  "NPWP/NIK Penerima", "NITKU Penerima", "Nama Penerima", "Negara", "Jenis Fasilitas", "Jenis PPh", "Kode Objek Pajak", "Nama Objek Pajak",
  "Penghasilan Bruto", "DPP (%)", "DPP", "Tarif (%)", "PPh Dipotong", "Tanggal Pemotongan", "Jenis Dokumen", "Nomor Dokumen", "Tanggal Dokumen",
  "Nama Penandatangan", "Nomor Internal", "Nomor Coretax", "NTPN", "Status Internal",
] as const;

export function coretaxRows(slips: WithholdingSlip[], entity: Pick<Entity, "npwp" | "nitku" | "tax">, billNumbers: Map<string, string> = new Map()): unknown[][] {
  return slips.map((s) => {
    const kind = bupotKind(s.type);
    const [year, month] = s.period.split("-");
    const docNumber = s.document?.number ?? (s.billId ? billNumbers.get(s.billId) ?? s.billId : "");
    const docDate = s.document?.date ?? s.date;
    return [
      kind, npwp16(entity.npwp), nitkuOf(entity.npwp, entity.nitku), Number(month), Number(year), isFinal(s) ? "FINAL" : "TIDAK FINAL", s.correction ? "PEMBETULAN" : "NORMAL",
      npwp16(s.counterparty.npwp ?? s.counterparty.nik), nitkuOf(s.counterparty.npwp ?? s.counterparty.nik, s.counterparty.nitku), s.counterparty.name, s.counterparty.country ?? "ID", facilityLabel(s), JENIS_PPH[s.type], s.objectCode, s.objectLabel,
      s.grossAmount ?? s.baseAmount, s.dppPercent ?? 100, s.baseAmount, Number((s.rate * 100).toFixed(2)), s.taxAmount, ddmmyyyy(s.date), documentLabel(s), docNumber, docDate ? ddmmyyyy(docDate) : "",
      entity.tax.signerName ?? "", s.number, s.coretaxNumber ?? "", s.ntpn ?? "", s.status,
    ];
  });
}

function xmlEscape(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Draft XML in the shape of the Coretax bukti potong import (one file per form kind: BPPU and BP21).
 * Tag names follow DJP's published import format as far as known; compare with the template from Coretax before
 * uploading and report differences so the tags can be corrected.
 */
export function coretaxXml(slips: WithholdingSlip[], entity: Pick<Entity, "npwp" | "nitku" | "tax">, kind: "BPPU" | "BP21", billNumbers: Map<string, string> = new Map()): string {
  const rows = slips.filter((s) => bupotKind(s.type) === kind);
  const tin = npwp16(entity.npwp);
  const items = rows.map((s) => {
    const [year, month] = s.period.split("-");
    const docNumber = s.document?.number ?? (s.billId ? billNumbers.get(s.billId) ?? s.billId : "");
    const docDate = s.document?.date ?? s.date;
    const fac = facilityOf(s);
    const facilityCode = fac === "none" ? "N" : fac === "skb" ? "SKB" : fac === "dtp" ? "DTP" : "P3B";
    const fields: Array<[string, unknown]> = [
      ["TaxPeriodMonth", Number(month)], ["TaxPeriodYear", Number(year)],
      ["CounterpartTin", npwp16(s.counterparty.npwp ?? s.counterparty.nik)],
      ["IDPlaceOfBusinessActivityOfIncomeRecipient", nitkuOf(s.counterparty.npwp ?? s.counterparty.nik, s.counterparty.nitku)],
      ["TaxCertificate", facilityCode], ["TaxObjectCode", s.objectCode],
      ...(kind === "BP21" ? [["Gross", s.grossAmount ?? s.baseAmount] as [string, unknown], ["Deemed", s.dppPercent ?? 100] as [string, unknown]] : []),
      ["TaxBase", s.baseAmount], ["Rate", Number((s.rate * 100).toFixed(2))], ["WithholdingDate", s.date],
      ["DocumentType", documentLabel(s)], ["DocumentNumber", docNumber], ["DocumentDate", docDate],
      ["IDPlaceOfBusinessActivity", nitkuOf(entity.npwp, entity.nitku)], ["Signer", entity.tax.signerName ?? ""],
      ...(s.correction ? [["Status", "PEMBETULAN"] as [string, unknown]] : []),
    ];
    return `    <Bupot>\n${fields.map(([k, v]) => `      <${k}>${xmlEscape(v)}</${k}>`).join("\n")}\n    </Bupot>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Draft of the Coretax ${kind} import: check the tag names against the template from Coretax (e-Bupot › Impor) before uploading. -->\n<${kind}>\n  <TIN>${xmlEscape(tin)}</TIN>\n  <ListOfBupot>\n${items.join("\n")}\n  </ListOfBupot>\n</${kind}>\n`;
}
