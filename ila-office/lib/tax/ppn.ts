import type { Bill, Invoice, VatTransaction } from "../types";

/**
 * SPT Masa PPN register builder. Pure: takes the entity's invoices, bills and manual VAT rows and returns the
 * output/input rows of a period plus the summary (output − creditable input → payable or overpaid/carried forward).
 */

export interface PpnRow {
  key: string;
  direction: "output" | "input";
  date: string;
  counterparty: string;
  npwp?: string;
  fakturNumber?: string;
  docNumber: string;
  dpp: number;
  ppn: number;
  rate: number;
  creditable: boolean;
  source: "invoice" | "bill" | "manual";
  sourceId: string;
  notes?: string;
}

export interface PpnSummary {
  period: string;
  outputDpp: number;
  outputPpn: number;
  inputDpp: number;
  inputPpn: number;
  /** Input PPN with a valid e-Faktur number (creditable). */
  creditableInputPpn: number;
  nonCreditableInputPpn: number;
  carriedForwardIn: number;
  /** Positive = PPN kurang bayar (payable); negative = lebih bayar (overpaid, carried forward). */
  net: number;
  payable: number;
  overpaid: number;
}

function floorRp(n: number): number {
  return Math.floor(n + 1e-9);
}

function isPosted(status: Invoice["status"] | Bill["status"]): boolean {
  return status !== "draft" && status !== "void";
}

export interface PpnRegisterInput {
  period: string;
  invoices: Invoice[];
  bills: Bill[];
  manual: VatTransaction[];
  /** Overpayment carried forward from the previous period (lebih bayar dikompensasikan). */
  carriedForwardIn?: number;
}

export function buildPpnRegister(input: PpnRegisterInput): { rows: PpnRow[]; summary: PpnSummary } {
  const rows: PpnRow[] = [];
  for (const inv of input.invoices) {
    if (!isPosted(inv.status) || inv.date.slice(0, 7) !== input.period || inv.ppnAmount <= 0) continue;
    const fx = inv.fxRate || 1;
    const dpp = floorRp(inv.lines.filter((l) => l.taxCode === "ppn").reduce((s, l) => s + l.amount, 0) * fx);
    const ppn = floorRp(inv.ppnAmount * fx);
    rows.push({ key: `inv:${inv.id}`, direction: "output", date: inv.date, counterparty: inv.customer.name, npwp: inv.customer.npwp, fakturNumber: inv.fakturNumber, docNumber: inv.number, dpp, ppn, rate: dpp > 0 ? ppn / dpp : 0, creditable: true, source: "invoice", sourceId: inv.id });
  }
  for (const bill of input.bills) {
    if (!isPosted(bill.status) || bill.date.slice(0, 7) !== input.period || bill.ppnInput <= 0) continue;
    const fx = bill.fxRate || 1;
    const dpp = floorRp(bill.lines.filter((l) => l.taxCode === "ppn").reduce((s, l) => s + l.amount, 0) * fx);
    const ppn = floorRp(bill.ppnInput * fx);
    rows.push({ key: `bill:${bill.id}`, direction: "input", date: bill.date, counterparty: bill.vendor.name, npwp: bill.vendor.npwp, fakturNumber: bill.fakturNumber, docNumber: bill.number, dpp, ppn, rate: dpp > 0 ? ppn / dpp : 0, creditable: Boolean(bill.fakturNumber), source: "bill", sourceId: bill.id });
  }
  for (const v of input.manual) {
    if (v.period !== input.period) continue;
    rows.push({ key: `vat:${v.id}`, direction: v.direction, date: v.date, counterparty: v.counterparty.name, npwp: v.counterparty.npwp, fakturNumber: v.fakturNumber, docNumber: v.invoiceId ?? v.billId ?? "manual", dpp: v.dpp, ppn: v.ppn, rate: v.rate, creditable: v.direction === "output" ? true : v.creditable, source: "manual", sourceId: v.id, notes: v.notes });
  }
  rows.sort((a, b) => (a.direction === b.direction ? a.date.localeCompare(b.date) : a.direction === "output" ? -1 : 1));
  const out = rows.filter((r) => r.direction === "output");
  const inp = rows.filter((r) => r.direction === "input");
  const outputPpn = out.reduce((s, r) => s + r.ppn, 0);
  const inputPpn = inp.reduce((s, r) => s + r.ppn, 0);
  const creditableInputPpn = inp.filter((r) => r.creditable).reduce((s, r) => s + r.ppn, 0);
  const carriedForwardIn = Math.max(0, input.carriedForwardIn ?? 0);
  const net = outputPpn - creditableInputPpn - carriedForwardIn;
  return {
    rows,
    summary: {
      period: input.period, outputDpp: out.reduce((s, r) => s + r.dpp, 0), outputPpn, inputDpp: inp.reduce((s, r) => s + r.dpp, 0), inputPpn,
      creditableInputPpn, nonCreditableInputPpn: inputPpn - creditableInputPpn, carriedForwardIn, net, payable: Math.max(0, net), overpaid: Math.max(0, -net),
    },
  };
}

/** Output PPN for a sale: rate × DPP; with the 2025 regime the DPP is 11/12 of the price at the statutory 12%. */
export function ppnOnSale(amount: number, rate: number, dppFraction = 1): { dpp: number; ppn: number } {
  const dpp = floorRp(amount * dppFraction);
  return { dpp, ppn: floorRp(dpp * rate) };
}
