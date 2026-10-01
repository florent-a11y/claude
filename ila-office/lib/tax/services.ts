import { db } from "../db";
import { postedEntries } from "../posting";
import type { Entity, PayrollRun, TaxObligation, WithholdingSlip } from "../types";
import { generateObligations } from "./calendar";
import { computeCit, type CitInput, type CitResult } from "./cit";
import { buildLkpmPack, type LkpmPack } from "./lkpm";
import { buildPpnRegister } from "./ppn";
import { computeWithholding, type WithholdingInput } from "./withholding";

/** Db-coupled helpers for the Tax module. The arithmetic lives in the pure modules next to this file. */

/** Inserts the obligations of a year that do not exist yet. Returns the number inserted. Idempotent. */
export async function ensureObligations(entity: Entity, year: number): Promise<number> {
  const wanted = generateObligations(entity, year);
  const existing = await db.getMany("tax_obligations", wanted.map((o) => o.id));
  const missing = wanted.filter((o) => !existing.has(o.id));
  if (missing.length) await db.insertMany("tax_obligations", missing);
  return missing.length;
}

export async function ensureObligationsForAll(year: number): Promise<{ entities: number; inserted: number }> {
  const entities = await db.list("entities", { where: { status: "active" } });
  let inserted = 0;
  for (const e of entities) inserted += await ensureObligations(e, year);
  return { entities: entities.length, inserted };
}

export function fiscalYearRange(entity: Entity, year: number): { from: string; to: string } {
  const start = entity.fiscalYearStartMonth || 1;
  const from = `${year}-${String(start).padStart(2, "0")}-01`;
  const endYear = start === 1 ? year : year + 1;
  const endMonth = start === 1 ? 12 : start - 1;
  const last = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  return { from, to: `${endYear}-${String(endMonth).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
}

export async function computeCitForEntity(entity: Entity, year: number, adjustments?: CitInput["adjustments"], lossCarryForward?: number): Promise<CitResult> {
  const [accounts, entries] = await Promise.all([db.list("accounts", { where: { entityId: entity.id } }), postedEntries(entity.id)]);
  const { from, to } = fiscalYearRange(entity, year);
  return computeCit({ regime: entity.tax.regime, fiscalYear: year, from, to, accounts, entries, adjustments, lossCarryForward });
}

export async function ppnRegisterForEntity(entityId: string, period: string, carriedForwardIn = 0) {
  const [invoices, bills, manual] = await Promise.all([
    db.list("invoices", { where: { entityId } }), db.list("bills", { where: { entityId } }), db.list("vat_transactions", { where: { entityId, period } }),
  ]);
  return buildPpnRegister({ period, invoices, bills, manual, carriedForwardIn });
}

export async function lkpmPackForEntity(entityId: string, quarter: string): Promise<LkpmPack> {
  const [accounts, entries, employees, fixedAssets, obligations] = await Promise.all([
    db.list("accounts", { where: { entityId } }), postedEntries(entityId), db.list("employees", { where: { entityId } }),
    db.list("fixed_assets", { where: { entityId } }), db.list("tax_obligations", { where: { entityId } }),
  ]);
  return buildLkpmPack({ quarter, accounts, entries, employees, fixedAssets, obligations });
}

export interface NewSlipInput extends WithholdingInput {
  entityId: string;
  period: string;
  date: string;
  counterparty: WithholdingSlip["counterparty"];
  description?: string;
  billId?: string;
  payrollRunId?: string;
}

export async function createSlip(input: NewSlipInput): Promise<WithholdingSlip> {
  const calc = computeWithholding(input);
  const slip: WithholdingSlip = {
    id: db.newId(), entityId: input.entityId, type: input.type, number: await db.nextNumber(input.entityId, "BP", new Date(input.date)), period: input.period, date: input.date,
    counterparty: input.counterparty, objectCode: calc.objectCode, objectLabel: calc.objectLabel, description: input.description, baseAmount: calc.baseAmount, rate: calc.rate,
    taxAmount: calc.taxAmount, treatyApplied: calc.treatyApplied || undefined, billId: input.billId, payrollRunId: input.payrollRunId, status: "draft", createdAt: new Date().toISOString(),
  };
  await db.insert("withholding_slips", slip);
  return slip;
}

/** Payroll runs of a year for the PPh 21 annual true-up table. */
export async function payrollRunsOfYear(entityId: string, year: number): Promise<PayrollRun[]> {
  return db.list("payroll_runs", { where: (r) => r.entityId === entityId && r.period.startsWith(`${year}-`), orderBy: "period" });
}

export async function obligationsOf(entityId: string, year?: number): Promise<TaxObligation[]> {
  return db.list("tax_obligations", { where: (o) => o.entityId === entityId && (year === undefined || o.period.startsWith(String(year))) });
}
