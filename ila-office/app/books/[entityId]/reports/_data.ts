import { db } from "@/lib/db";
import { entityAccounts, entityEntries } from "@/lib/books";
import { fiscalYearStartOf } from "@/lib/ledger";
import { addDays, todayISO, lastDayOfMonth, periodOf } from "@/lib/dates";
import type { Account, Entity, JournalEntry } from "@/lib/types";

export interface ReportData { entity: Entity; accounts: Account[]; entries: JournalEntry[] }

export async function loadReportData(entityId: string): Promise<ReportData | null> {
  const entity = await db.get("entities", entityId);
  if (!entity) return null;
  const [accounts, entries] = await Promise.all([entityAccounts(entityId), entityEntries(entityId)]);
  return { entity, accounts, entries };
}

/** Default report range: fiscal year to date. */
export function defaultRange(entity: Entity, sp: { from?: string; to?: string; asOf?: string }): { from: string; to: string; asOf: string } {
  const today = todayISO();
  const asOf = sp.asOf ?? sp.to ?? today;
  const from = sp.from ?? fiscalYearStartOf(asOf, entity.fiscalYearStartMonth);
  const to = sp.to ?? asOf;
  return { from, to, asOf };
}

/** The range immediately before [from, to] with the same length (for the P&L comparison column). */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const len = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  const prevTo = addDays(from, -1);
  return { from: addDays(prevTo, -(len - 1)), to: prevTo };
}

export function monthEnd(d: string): string {
  return lastDayOfMonth(periodOf(d));
}
