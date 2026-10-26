"use server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { periodLabel } from "@/lib/dates";
import { buildReconciliation } from "@/lib/reconciliation";
import { str } from "@/lib/util";
import type { BankReconciliation } from "@/lib/types";
import { act, requireEntity, withFlash } from "../../../shared";

const here = (entityId: string, bankAccountId: string, period: string) => `/books/${entityId}/bank/${bankAccountId}/reconcile?period=${period}`;

async function loadBank(entityId: string, bankAccountId: string) {
  const bank = await db.get("bank_accounts", bankAccountId);
  if (!bank || bank.entityId !== entityId) throw new Error("Bank account not found.");
  return bank;
}

/** Ticks (or unticks) a ledger entry as appearing on the bank statement, for entries whose statement line was never imported. */
export async function setJournalCleared(entityId: string, bankAccountId: string, journalId: string, period: string, cleared: boolean) {
  const back = here(entityId, bankAccountId, period);
  return act(entityId, async () => {
    await requirePermission("books:write");
    await requireEntity(entityId);
    await loadBank(entityId, bankAccountId);
    const j = await db.get("journal_entries", journalId);
    if (!j || j.entityId !== entityId) throw new Error("Journal entry not found.");
    const map = { ...(j.bankCleared ?? {}) };
    if (cleared) map[bankAccountId] = period; else delete map[bankAccountId];
    await db.update("journal_entries", journalId, { bankCleared: map });
  }, back);
}

/** Signs the month off: statement balance and books agree once the outstanding items are listed. */
export async function signOff(entityId: string, bankAccountId: string, fd: FormData) {
  const period = str(fd, "period") ?? "";
  const back = here(entityId, bankAccountId, period);
  return act(entityId, async () => {
    const user = await requirePermission("books:write");
    await requireEntity(entityId);
    const bank = await loadBank(entityId, bankAccountId);
    if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Pick a month.");
    const manual = str(fd, "statementBalance");
    const statementBalance = manual === undefined ? undefined : Number(manual.replace(/[^0-9.-]/g, ""));
    const [transactions, entries] = await Promise.all([db.list("bank_transactions", { where: { bankAccountId } }), db.list("journal_entries", { where: { entityId, status: "posted" } })]);
    const r = buildReconciliation({ bank, transactions, entries, period, statementBalance });
    if (r.statementBalance === null) throw new Error("Enter the closing balance shown on the bank statement first.");
    if (!r.balanced) throw new Error("Not balanced yet: book or exclude the statement lines, and tick the ledger entries that appear on the statement.");
    const rec: BankReconciliation = {
      period, endDate: r.endDate, statementBalance: r.statementBalance, ledgerBalance: r.ledgerBalance, difference: r.difference ?? 0,
      unbookedCount: r.unbookedStatement.length, unpresentedCount: r.unpresentedLedger.length, note: str(fd, "note"), at: new Date().toISOString(), byUserId: user.id, byName: user.name,
    };
    const list = (bank.reconciliations ?? []).filter((x) => x.period !== period).concat(rec).sort((a, b) => a.period.localeCompare(b.period));
    await db.update("bank_accounts", bankAccountId, { reconciliations: list, reconciledThrough: list[list.length - 1].endDate });
    return withFlash(back, `${periodLabel(period)} reconciled and signed off.`);
  }, back);
}

/** Removes a sign-off (the latest one only) so the month can be reworked. */
export async function undoSignOff(entityId: string, bankAccountId: string, period: string) {
  const back = here(entityId, bankAccountId, period);
  return act(entityId, async () => {
    await requirePermission("books:write");
    await requireEntity(entityId);
    const bank = await loadBank(entityId, bankAccountId);
    const list = (bank.reconciliations ?? []).sort((a, b) => a.period.localeCompare(b.period));
    const last = list[list.length - 1];
    if (!last || last.period !== period) throw new Error("Only the most recent sign-off can be undone.");
    const remaining = list.slice(0, -1);
    await db.update("bank_accounts", bankAccountId, { reconciliations: remaining, reconciledThrough: remaining[remaining.length - 1]?.endDate });
    return withFlash(back, `Sign-off for ${periodLabel(period)} removed.`);
  }, back);
}
