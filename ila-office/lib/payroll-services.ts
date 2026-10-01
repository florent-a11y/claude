import { db } from "./db";
import { postJournal } from "./posting";
import { computePayroll, payrollJournalLines, type LineOverride } from "./payroll";
import type { PayrollRun } from "./types";

/** Payroll runs: create (draft), recalculate, approve (posts the journal), mark paid, delete draft. */

export async function priorRunsOf(entityId: string, period: string): Promise<PayrollRun[]> {
  return db.list("payroll_runs", { where: (r) => r.entityId === entityId && r.period < period && r.period.slice(0, 4) === period.slice(0, 4), orderBy: "period" });
}

export async function previewRun(entityId: string, period: string, overrides: Record<string, LineOverride> = {}) {
  const [employees, priorRuns] = await Promise.all([db.list("employees", { where: { entityId } }), priorRunsOf(entityId, period)]);
  return computePayroll({ period, employees, priorRuns, overrides });
}

export async function createRun(entityId: string, period: string, payDate: string, overrides: Record<string, LineOverride> = {}): Promise<PayrollRun> {
  const exists = await db.list("payroll_runs", { where: { entityId, period } });
  if (exists.length) throw new Error(`A payroll run for ${period} already exists.`);
  const { lines, totals } = await previewRun(entityId, period, overrides);
  if (lines.length === 0) throw new Error("No active employee for this period. Add employees first.");
  const now = new Date().toISOString();
  const run: PayrollRun = { id: db.newId(), entityId, period, payDate, lines, totals, status: "draft", createdAt: now };
  await db.insert("payroll_runs", run);
  return run;
}

export async function recalculateRun(runId: string, overrides: Record<string, LineOverride>, payDate?: string): Promise<PayrollRun> {
  const run = await db.get("payroll_runs", runId);
  if (!run) throw new Error("Payroll run not found");
  if (run.status !== "draft") throw new Error("Only draft runs can be recalculated");
  const { lines, totals } = await previewRun(run.entityId, run.period, overrides);
  const updated = await db.update("payroll_runs", runId, { lines, totals, payDate: payDate ?? run.payDate, updatedAt: new Date().toISOString() });
  return updated!;
}

export async function approveRun(runId: string, userId: string): Promise<PayrollRun> {
  const run = await db.get("payroll_runs", runId);
  if (!run) throw new Error("Payroll run not found");
  if (run.status !== "draft") throw new Error("Run is already approved");
  const accounts = await db.list("accounts", { where: { entityId: run.entityId } });
  const lines = payrollJournalLines(run, accounts);
  const entry = await postJournal(run.entityId, { date: run.payDate, memo: `Payroll ${run.period}`, source: "payroll", sourceId: run.id, lines, createdByUserId: userId });
  const now = new Date().toISOString();
  const updated = await db.update("payroll_runs", runId, { status: "approved", journalId: entry.id, approvedByUserId: userId, approvedAt: now, updatedAt: now });
  // Best effort: carry the amounts into the compliance calendar when the rows exist.
  const payrollObl = await db.get("tax_obligations", `${run.entityId}:payroll:${run.period}`);
  if (payrollObl) await db.update("tax_obligations", payrollObl.id, { amount: run.totals.netPay, updatedAt: now });
  const pph21Obl = await db.get("tax_obligations", `${run.entityId}:pph21:${run.period}`);
  if (pph21Obl) await db.update("tax_obligations", pph21Obl.id, { amount: run.totals.pph21, updatedAt: now });
  const bpjsObl = await db.get("tax_obligations", `${run.entityId}:bpjs:${run.period}`);
  if (bpjsObl) await db.update("tax_obligations", bpjsObl.id, { amount: run.totals.employerBpjs + run.totals.employeeBpjs, updatedAt: now });
  return updated!;
}

export async function markRunPaid(runId: string): Promise<PayrollRun> {
  const run = await db.get("payroll_runs", runId);
  if (!run) throw new Error("Payroll run not found");
  if (run.status !== "approved") throw new Error("Approve the run before marking it paid");
  const now = new Date().toISOString();
  return (await db.update("payroll_runs", runId, { status: "paid", paidAt: now, updatedAt: now }))!;
}

export async function deleteDraftRun(runId: string): Promise<void> {
  const run = await db.get("payroll_runs", runId);
  if (!run) return;
  if (run.status !== "draft") throw new Error("Only draft runs can be deleted");
  await db.remove("payroll_runs", runId);
}
