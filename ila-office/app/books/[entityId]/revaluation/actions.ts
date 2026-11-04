"use server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { postRevaluation, voidRevaluation } from "@/lib/fx-revaluation-services";
import { periodLabel } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { rateOf, str } from "@/lib/util";
import { act, base } from "../shared";

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM");

/** Closing rates (`rate_<CCY>`) and typed foreign balances (`fc_<bankId>`) from the revaluation form. */
function readRevaluationForm(fd: FormData): { rates: Record<string, number>; overrides: Record<string, number> } {
  const rates: Record<string, number> = {};
  const overrides: Record<string, number> = {};
  for (const key of fd.keys()) {
    if (key.startsWith("rate_")) { const r = rateOf(fd, key); if (r > 0) rates[key.slice(5).toUpperCase()] = r; }
    else if (key.startsWith("fc_")) { const v = str(fd, key); if (v !== undefined) overrides[key.slice(3)] = parseMoney(v); }
  }
  return { rates, overrides };
}

export async function postRevaluationAction(entityId: string, fd: FormData) {
  const period = str(fd, "period") ?? "";
  const to = `${base(entityId)}/revaluation?period=${period}`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    const p = periodSchema.parse(period);
    const { rates, overrides } = readRevaluationForm(fd);
    const r = await postRevaluation(entityId, { period: p, rates, overrides }, user.id);
    return `${to}&ok=${encodeURIComponent(`${r.journal.number} posted: ${periodLabel(p)} revalued at the closing rates`)}`;
  }, to);
}

export async function voidRevaluationAction(entityId: string, period: string) {
  const to = `${base(entityId)}/revaluation?period=${period}`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    const j = await voidRevaluation(entityId, periodSchema.parse(period));
    return `${to}&ok=${encodeURIComponent(`${j.number} voided; post the revaluation again when ready`)}`;
  }, to);
}
