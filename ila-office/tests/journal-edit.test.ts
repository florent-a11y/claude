import { test } from "node:test";
import assert from "node:assert/strict";
import { EDITABLE_SOURCES, applyJournalEdit, editProblem } from "../lib/posting";
import type { JournalEntry, JournalLine, JournalSource } from "../lib/types";

/** In-place editing of manual journal entries: who may be edited, and what the pure edit produces. */

const ENTITY = "ent-1";
const BANK = "acc-bank", AR = "acc-ar", EXPENSE = "acc-expense", RENT = "acc-rent";
const CODES: Record<string, string> = { [BANK]: "1-1100", [AR]: "1-1200", [EXPENSE]: "6-1000", [RENT]: "6-2000" };
const dr = (accountId: string, amt: number, extra: Partial<JournalLine> = {}): JournalLine => ({ accountId, accountCode: CODES[accountId], debit: amt, credit: 0, ...extra });
const cr = (accountId: string, amt: number, extra: Partial<JournalLine> = {}): JournalLine => ({ accountId, accountCode: CODES[accountId], debit: 0, credit: amt, ...extra });
const ALL_SOURCES: JournalSource[] = ["manual", "invoice", "bill", "receipt", "disbursement", "bank", "payroll", "depreciation", "withholding", "opening", "closing", "adjustment", "fx"];

function entry(over: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: "je-1", entityId: ENTITY, number: "JE-2026-0007", date: "2026-09-15", period: "2026-09", memo: "Office rent September", source: "manual",
    lines: [dr(RENT, 5_000_000, { description: "Rent" }), cr(BANK, 5_000_000)], status: "posted", postedAt: "2026-09-15T08:00:00.000Z",
    createdByUserId: "u-1", createdAt: "2026-09-15T08:00:00.000Z", ...over,
  };
}
const META = { at: "2026-10-01T03:00:00.000Z", byUserId: "u-2", byName: "Ayu" };
const OPTS = { bankAccountIds: [BANK] };

test("editProblem: hand-written sources may be edited, generated ones point at their document", () => {
  for (const source of ALL_SOURCES) {
    const problem = editProblem({ source, status: "posted" });
    if (EDITABLE_SOURCES.includes(source)) assert.equal(problem, null, source);
    else assert.equal(problem, "Only manual entries can be edited; edit the invoice/bill/payment instead", source);
  }
  assert.deepEqual([...EDITABLE_SOURCES].sort(), ["adjustment", "closing", "fx", "manual", "opening"]);
});

test("editProblem: drafts are editable, voided entries are not", () => {
  assert.equal(editProblem({ source: "manual", status: "draft" }), null);
  assert.equal(editProblem({ source: "adjustment", status: "draft" }), null);
  assert.equal(editProblem({ source: "manual", status: "void" }), "Voided entries cannot be edited");
  assert.equal(editProblem({ source: "opening", status: "void" }), "Voided entries cannot be edited");
  // A voided generated entry is refused for the more fundamental reason.
  assert.equal(editProblem({ source: "invoice", status: "void" }), "Only manual entries can be edited; edit the invoice/bill/payment instead");
});

test("applyJournalEdit: keeps id and number, replaces date/memo/source/lines, recomputes the period, appends the old version", () => {
  const before = entry();
  const snapshot = JSON.stringify(before);
  const after = applyJournalEdit(before, { date: "2026-10-03", memo: "  Office rent October  ", source: "adjustment", lines: [dr(RENT, 5_500_000), cr(BANK, 5_500_000)] }, META, OPTS);
  assert.equal(after.id, before.id);
  assert.equal(after.number, "JE-2026-0007");
  assert.equal(after.entityId, ENTITY);
  assert.equal(after.status, "posted");
  assert.equal(after.postedAt, before.postedAt);
  assert.equal(after.createdAt, before.createdAt);
  assert.equal(after.date, "2026-10-03");
  assert.equal(after.period, "2026-10");
  assert.equal(after.memo, "Office rent October");
  assert.equal(after.source, "adjustment");
  assert.equal(after.updatedAt, META.at);
  assert.deepEqual(after.lines.map((l) => [l.accountId, l.debit, l.credit]), [[RENT, 5_500_000, 0], [BANK, 0, 5_500_000]]);
  assert.equal(after.revisions?.length, 1);
  const rev = after.revisions![0];
  assert.deepEqual({ at: rev.at, byUserId: rev.byUserId, byName: rev.byName, date: rev.date, memo: rev.memo, source: rev.source }, { at: META.at, byUserId: "u-2", byName: "Ayu", date: "2026-09-15", memo: "Office rent September", source: "manual" });
  assert.deepEqual(rev.lines, before.lines);
  assert.equal(JSON.stringify(before), snapshot, "the input entry is not mutated");
});

test("applyJournalEdit: a second edit appends to revisions (newest last) and keeps the first revision intact", () => {
  const v1 = entry();
  const v2 = applyJournalEdit(v1, { date: "2026-09-16", memo: "Rent (corrected date)", source: "manual", lines: v1.lines }, { at: "2026-09-20T00:00:00.000Z", byName: "Ayu" }, OPTS);
  const v3 = applyJournalEdit(v2, { date: "2026-09-16", memo: "Rent (corrected amount)", source: "manual", lines: [dr(RENT, 4_000_000), cr(BANK, 4_000_000)] }, { at: "2026-09-21T00:00:00.000Z", byName: "Budi" }, OPTS);
  assert.equal(v3.revisions?.length, 2);
  assert.deepEqual(v3.revisions!.map((r) => [r.at, r.byName, r.date, r.memo]), [
    ["2026-09-20T00:00:00.000Z", "Ayu", "2026-09-15", "Office rent September"],
    ["2026-09-21T00:00:00.000Z", "Budi", "2026-09-16", "Rent (corrected date)"],
  ]);
  assert.equal(v3.revisions![1].lines[0].debit, 5_000_000);
  assert.equal(v3.lines[0].debit, 4_000_000);
  assert.equal(v3.number, v1.number);
});

test("applyJournalEdit: rounds to whole rupiah, drops empty lines, and keeps line details for unchanged lines", () => {
  const before = entry({ lines: [dr(RENT, 5_000_000, { description: "Rent", counterpartyName: "PT Landlord" }), cr(BANK, 5_000_000, { description: "OCBC transfer" })] });
  const after = applyJournalEdit(before, {
    date: before.date, memo: before.memo, source: "manual",
    lines: [{ accountId: RENT, accountCode: CODES[RENT], debit: 5_000_000.4, credit: 0 }, { accountId: BANK, accountCode: CODES[BANK], debit: 0, credit: 4_999_999.6 }, { accountId: AR, accountCode: CODES[AR], debit: 0, credit: 0 }],
  }, META, OPTS);
  assert.equal(after.lines.length, 2);
  assert.deepEqual(after.lines.map((l) => [l.debit, l.credit]), [[5_000_000, 0], [0, 5_000_000]]);
  assert.equal(after.lines[0].counterpartyName, "PT Landlord", "an unchanged line inherits the counterparty the form did not carry");
  assert.equal(after.lines[0].description, "Rent");
  assert.equal(after.lines[1].description, "OCBC transfer");
  // A changed line does not inherit stale details.
  const changed = applyJournalEdit(before, { date: before.date, memo: before.memo, source: "manual", lines: [dr(RENT, 6_000_000), cr(BANK, 6_000_000)] }, META, OPTS);
  assert.equal(changed.lines[0].counterpartyName, undefined);
  assert.equal(changed.lines[0].description, undefined);
});

test("applyJournalEdit: rejects unbalanced, one-sided, single-line, undated, memo-less and non-editable input", () => {
  const base = entry();
  const edit = (input: Partial<Parameters<typeof applyJournalEdit>[1]>, e: JournalEntry = base) =>
    applyJournalEdit(e, { date: e.date, memo: e.memo, source: "manual", lines: e.lines, ...input }, META, OPTS);
  assert.throws(() => edit({ lines: [dr(RENT, 5_000_000), cr(BANK, 4_000_000)] }), /do not balance/);
  assert.throws(() => edit({ lines: [{ ...dr(RENT, 100), credit: 100 }, cr(BANK, 100)] }), /either a debit or a credit/);
  assert.throws(() => edit({ lines: [dr(RENT, 100)] }), /at least two lines/);
  assert.throws(() => edit({ lines: [dr("", 100), cr(BANK, 100)] }), /needs an account/);
  assert.throws(() => edit({ date: "15/09/2026" }), /Date is required/);
  assert.throws(() => edit({ memo: "   " }), /Memo is required/);
  assert.throws(() => edit({ source: "invoice" }), /reserved for generated entries/);
  assert.throws(() => edit({}, entry({ status: "void" })), /Voided entries cannot be edited/);
  assert.throws(() => edit({}, entry({ source: "bill", sourceId: "bill-1" })), /Only manual entries can be edited/);
  // The entry is untouched after a refused edit.
  assert.equal(base.revisions, undefined);
  assert.equal(base.lines[0].debit, 5_000_000);
});

test("applyJournalEdit: drafts can be edited and stay drafts", () => {
  const draft = entry({ status: "draft", postedAt: undefined });
  const after = applyJournalEdit(draft, { date: "2026-09-20", memo: "Draft rent", source: "manual", lines: draft.lines }, META, OPTS);
  assert.equal(after.status, "draft");
  assert.equal(after.postedAt, undefined);
  assert.equal(after.revisions?.length, 1);
});

test("applyJournalEdit: bankCleared survives edits that leave the bank lines alone", () => {
  const cleared = { "bank-ocbc": "2026-09" };
  const before = entry({ bankCleared: cleared });
  const memoOnly = applyJournalEdit(before, { date: before.date, memo: "Rent (memo fixed)", source: "manual", lines: before.lines }, META, OPTS);
  assert.deepEqual(memoOnly.bankCleared, cleared);
  const otherAccount = applyJournalEdit(before, { date: before.date, memo: before.memo, source: "manual", lines: [dr(EXPENSE, 5_000_000), cr(BANK, 5_000_000)] }, META, OPTS);
  assert.deepEqual(otherAccount.bankCleared, cleared, "changing the expense account keeps the statement tick");
  const split = applyJournalEdit(before, { date: before.date, memo: before.memo, source: "manual", lines: [dr(RENT, 3_000_000), dr(EXPENSE, 2_000_000), cr(BANK, 5_000_000)] }, META, OPTS);
  assert.deepEqual(split.bankCleared, cleared, "splitting the non-bank side keeps the statement tick");
  const dateMoved = applyJournalEdit(before, { date: "2026-10-01", memo: before.memo, source: "manual", lines: before.lines }, META, OPTS);
  assert.deepEqual(dateMoved.bankCleared, cleared);
  assert.equal(before.bankCleared, cleared, "input untouched");
});

test("applyJournalEdit: bankCleared is dropped when a bank line changes, is removed or is added", () => {
  const cleared = { "bank-ocbc": "2026-09" };
  const before = entry({ bankCleared: cleared });
  const amount = applyJournalEdit(before, { date: before.date, memo: before.memo, source: "manual", lines: [dr(RENT, 5_500_000), cr(BANK, 5_500_000)] }, META, OPTS);
  assert.equal(amount.bankCleared, undefined, "bank amount changed");
  assert.equal("bankCleared" in amount, false);
  const removed = applyJournalEdit(before, { date: before.date, memo: before.memo, source: "manual", lines: [dr(RENT, 5_000_000), cr(AR, 5_000_000)] }, META, OPTS);
  assert.equal(removed.bankCleared, undefined, "bank line replaced by a receivable");
  const side = applyJournalEdit(before, { date: before.date, memo: before.memo, source: "manual", lines: [cr(RENT, 5_000_000), dr(BANK, 5_000_000)] }, META, OPTS);
  assert.equal(side.bankCleared, undefined, "bank side flipped");
  const added = applyJournalEdit(before, { date: before.date, memo: before.memo, source: "manual", lines: [dr(RENT, 6_000_000), cr(BANK, 5_000_000), cr(BANK, 1_000_000)] }, META, OPTS);
  assert.equal(added.bankCleared, undefined, "second bank line added");
  // Without the list of bank accounts every line counts, so any line change drops the tick.
  const conservative = applyJournalEdit(before, { date: before.date, memo: before.memo, source: "manual", lines: [dr(EXPENSE, 5_000_000), cr(BANK, 5_000_000)] }, META);
  assert.equal(conservative.bankCleared, undefined);
  // Entries never ticked stay without the field.
  const never = applyJournalEdit(entry(), { date: "2026-09-15", memo: "x", source: "manual", lines: [dr(RENT, 1), cr(BANK, 1)] }, META, OPTS);
  assert.equal("bankCleared" in never, false);
});
