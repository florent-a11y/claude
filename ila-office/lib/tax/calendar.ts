import type { Entity, ObligationType, TaxObligation } from "../types";
import { OBLIGATION_LABELS } from "../types";
import { ANNUAL_DUE, DUE_DAYS } from "./constants";

/**
 * Compliance calendar generator. Pure: returns the obligations an entity's tax profile implies for a year with
 * deterministic ids `${entityId}:${type}:${period}` so the service layer can skip the ones that already exist.
 * Due dates that fall on a weekend roll forward to the next Monday (public holidays are not modelled).
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function dayOfWeek(d: string): number {
  return new Date(`${d}T00:00:00Z`).getUTCDay();
}

export function rollToWorkingDay(d: string): string {
  const dow = dayOfWeek(d);
  if (dow === 6) return shift(d, 2);
  if (dow === 0) return shift(d, 1);
  return d;
}

function shift(d: string, days: number): string {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
}

/** Day `day` of the month `monthsAfter` months after period YYYY-MM (clamped to month length). */
function dayAfterPeriod(period: string, monthsAfter: number, day: number): string {
  const [y, m] = period.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + monthsAfter, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(day, last));
}

function lastDayAfterPeriod(period: string, monthsAfter: number): string {
  return dayAfterPeriod(period, monthsAfter, 31);
}

const PT_TYPES: ReadonlySet<Entity["type"]> = new Set(["pt_pma", "pt_pmdn", "pt_perorangan"]);

export function isIndonesian(entity: Entity): boolean {
  return (entity.country || "ID").toUpperCase() === "ID";
}

export function isHongKong(entity: Entity): boolean {
  return entity.type === "hk_ltd" || entity.country.toUpperCase() === "HK";
}

/** Obligation types applying to an entity (used for matrix columns). */
export function obligationTypesFor(entity: Entity): ObligationType[] {
  const t: ObligationType[] = ["bookkeeping"];
  const id = isIndonesian(entity);
  const company = entity.type !== "individual";
  if (id && entity.tax.payroll) t.push("pph21");
  if (id && company) t.push("pph23", "pph26", "pph4_2");
  if (id && entity.tax.pkp) t.push("ppn");
  if (id && (entity.tax.pph25Monthly ?? 0) > 0) t.push("pph25");
  if (id && entity.tax.regime === "final_0_5") t.push("pph_final_umkm");
  if (id && (entity.tax.localTaxRate ?? 0) > 0) t.push("local_tax");
  if (entity.tax.payroll) t.push("bpjs", "payroll");
  if (id && entity.tax.lkpm) t.push("lkpm");
  if (id && company && entity.tax.regime !== "none") t.push("spt_badan");
  if (id && entity.type === "individual") t.push("spt_op");
  if (PT_TYPES.has(entity.type)) t.push("gms");
  if (isHongKong(entity)) t.push("annual_report");
  return t;
}

export function obligationId(entityId: string, type: ObligationType, period: string): string {
  return `${entityId}:${type}:${period}`;
}

export function generateObligations(entity: Entity, year: number): TaxObligation[] {
  const types = new Set(obligationTypesFor(entity));
  const out: TaxObligation[] = [];
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
  const add = (type: ObligationType, period: string, dates: { dataDue?: string; paymentDue?: string; reportDue: string }, label = OBLIGATION_LABELS[type]) => {
    out.push({
      id: obligationId(entity.id, type, period), entityId: entity.id, type, period, label,
      dataDue: dates.dataDue ? rollToWorkingDay(dates.dataDue) : undefined,
      paymentDue: dates.paymentDue ? rollToWorkingDay(dates.paymentDue) : undefined,
      reportDue: rollToWorkingDay(dates.reportDue), status: "not_started", generated: true,
    });
  };

  for (const p of months) {
    const dataDue = dayAfterPeriod(p, 1, DUE_DAYS.clientData);
    const unifiedPay = dayAfterPeriod(p, 1, DUE_DAYS.unifiedPayment);
    const unifiedReport = dayAfterPeriod(p, 1, DUE_DAYS.unifiedReport);
    if (types.has("bookkeeping")) add("bookkeeping", p, { dataDue, reportDue: dayAfterPeriod(p, 1, DUE_DAYS.bookkeepingReport) });
    if (types.has("pph21")) add("pph21", p, { dataDue, paymentDue: unifiedPay, reportDue: unifiedReport });
    for (const t of ["pph23", "pph26", "pph4_2"] as const) if (types.has(t)) add(t, p, { dataDue, paymentDue: unifiedPay, reportDue: unifiedReport });
    if (types.has("ppn")) add("ppn", p, { dataDue, paymentDue: lastDayAfterPeriod(p, 1), reportDue: lastDayAfterPeriod(p, 1) });
    if (types.has("pph25")) add("pph25", p, { paymentDue: dayAfterPeriod(p, 1, DUE_DAYS.pph25), reportDue: dayAfterPeriod(p, 1, DUE_DAYS.pph25) });
    if (types.has("pph_final_umkm")) add("pph_final_umkm", p, { dataDue, paymentDue: dayAfterPeriod(p, 1, DUE_DAYS.umkmFinal), reportDue: dayAfterPeriod(p, 1, DUE_DAYS.umkmFinal) });
    if (types.has("local_tax")) add("local_tax", p, { dataDue, paymentDue: dayAfterPeriod(p, 1, DUE_DAYS.localTax), reportDue: dayAfterPeriod(p, 1, DUE_DAYS.localTax) });
    if (types.has("bpjs")) add("bpjs", p, { paymentDue: dayAfterPeriod(p, 1, DUE_DAYS.bpjs), reportDue: dayAfterPeriod(p, 1, DUE_DAYS.bpjs) });
    if (types.has("payroll")) add("payroll", p, { dataDue: dayAfterPeriod(p, 0, DUE_DAYS.payrollReminder), paymentDue: dayAfterPeriod(p, 1, DUE_DAYS.payrollPay), reportDue: dayAfterPeriod(p, 1, DUE_DAYS.payrollPay) });
  }
  if (types.has("lkpm")) {
    for (let q = 1; q <= 4; q++) {
      const lastMonth = `${year}-${pad(q * 3)}`;
      add("lkpm", `${year}-Q${q}`, { dataDue: dayAfterPeriod(lastMonth, 1, DUE_DAYS.clientData), reportDue: dayAfterPeriod(lastMonth, 1, DUE_DAYS.lkpm) });
    }
  }
  const y = String(year);
  if (types.has("spt_badan")) add("spt_badan", y, { dataDue: iso(year + 1, 1, 31), reportDue: `${year + 1}-${ANNUAL_DUE.sptBadan}` });
  if (types.has("spt_op")) add("spt_op", y, { dataDue: iso(year + 1, 1, 31), reportDue: `${year + 1}-${ANNUAL_DUE.sptOp}` });
  if (types.has("gms")) add("gms", y, { reportDue: `${year + 1}-${ANNUAL_DUE.gms}` });
  if (types.has("annual_report")) add("annual_report", y, { reportDue: `${year + 1}-${ANNUAL_DUE.hkAnnual}` }, "Annual return / Business Registration renewal (HK)");
  return out;
}

/** True when the obligation is past its final due date and not closed. */
export function isOverdue(o: TaxObligation, today: string): boolean {
  if (o.status === "paid" || o.status === "reported" || o.status === "nil") return false;
  return o.reportDue < today;
}

/** Year of a period in any of the three formats. */
export function yearOfPeriod(period: string): number {
  return Number(period.slice(0, 4));
}

/** The month (YYYY-MM) in which the work for this obligation is due (its report due date). */
export function dueMonth(o: TaxObligation): string {
  return o.reportDue.slice(0, 7);
}

export const STATUS_ORDER: Record<TaxObligation["status"], number> = {
  late: 0, not_started: 1, data_requested: 2, data_received: 3, in_preparation: 4, awaiting_approval: 5, paid: 6, reported: 7, nil: 8,
};
