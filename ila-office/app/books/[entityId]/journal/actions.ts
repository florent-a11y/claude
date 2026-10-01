"use server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { postJournal, voidJournal } from "@/lib/posting";
import { entityAccounts } from "@/lib/books";
import { accountById } from "@/lib/ledger";
import { str } from "@/lib/util";
import type { JournalLine } from "@/lib/types";
import { act, base } from "../shared";

const lineSchema = z.object({ accountId: z.string().min(1, "Every line needs an account"), description: z.string().max(200).optional(), debit: z.number().min(0), credit: z.number().min(0), counterpartyName: z.string().max(120).optional() });
const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  memo: z.string().min(1, "Memo is required").max(300),
  source: z.enum(["manual", "adjustment", "opening", "closing", "fx"]).default("manual"),
  lines: z.array(lineSchema).min(2, "At least two lines"),
});

export async function createJournalAction(entityId: string, fd: FormData) {
  const to = `${base(entityId)}/journal/new`;
  await act(entityId, async () => {
    const user = await requirePermission("books:write");
    let raw: unknown;
    try { raw = JSON.parse(String(fd.get("lines") ?? "[]")); } catch { throw new Error("Lines could not be read."); }
    const v = schema.parse({ date: str(fd, "date"), memo: str(fd, "memo"), source: str(fd, "source") ?? "manual", lines: raw });
    const accounts = await entityAccounts(entityId);
    const lines: JournalLine[] = v.lines.filter((l) => l.debit > 0 || l.credit > 0).map((l) => {
      const a = accountById(accounts, l.accountId);
      if (!a.active) throw new Error(`Account ${a.code} is inactive.`);
      return { accountId: a.id, accountCode: a.code, description: l.description || undefined, debit: Math.round(l.debit), credit: Math.round(l.credit), counterpartyName: l.counterpartyName || undefined };
    });
    const entry = await postJournal(entityId, { date: v.date, memo: v.memo, source: v.source, lines, createdByUserId: user.id });
    return `${base(entityId)}/journal/${entry.id}?ok=${encodeURIComponent(`${entry.number} posted`)}`;
  }, to);
}

export async function voidJournalAction(entityId: string, journalId: string) {
  const to = `${base(entityId)}/journal/${journalId}`;
  await act(entityId, async () => {
    await requirePermission("books:write");
    await voidJournal(entityId, journalId);
    return `${to}?ok=${encodeURIComponent("Entry voided")}`;
  }, to);
}
