"use server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { lockPeriod, unlockPeriod, lockThrough, closeYear } from "@/lib/books";
import { fiscalYearPeriods } from "@/lib/ledger";
import { str } from "@/lib/util";
import { act, base } from "../shared";

const period = z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM");

export async function lockPeriodAction(entityId: string, p: string, locked: boolean, year: string) {
  const to = `${base(entityId)}/periods?year=${year}`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const v = period.parse(p);
    if (locked) await lockPeriod(entityId, v, user.id); else await unlockPeriod(entityId, v, user.id);
    return `${to}&ok=${encodeURIComponent(`${v} ${locked ? "locked" : "unlocked"}`)}`;
  }, to);
}

export async function lockThroughAction(entityId: string, fiscalYearStartMonth: number, fd: FormData) {
  const through = str(fd, "through") ?? "";
  const year = str(fd, "year") ?? through.slice(0, 4);
  const to = `${base(entityId)}/periods?year=${year}`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const v = period.parse(through);
    await lockThrough(entityId, fiscalYearPeriods(`${v}-01`, fiscalYearStartMonth), v, user.id);
    return `${to}&ok=${encodeURIComponent(`Locked every month of the fiscal year through ${v}`)}`;
  }, to);
}

export async function closeYearAction(entityId: string, fiscalYearEnd: string, year: string) {
  const to = `${base(entityId)}/periods?year=${year}`;
  await act(entityId, async () => {
    const user = await requirePermission("admin");
    const j = await closeYear(entityId, fiscalYearEnd, user.id);
    return `${to}&ok=${encodeURIComponent(j ? `Year closed: ${j.number} moved the result to retained earnings` : "Nothing to close: no revenue or expense balance in this year")}`;
  }, to);
}
