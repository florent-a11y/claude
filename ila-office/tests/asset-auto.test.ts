import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccounts } from "../lib/coa";
import { findByCode, validateLines } from "../lib/balances";
import { billJournalLines, billTotals, depreciationJournalLines, disposalJournalLines, disposalPreview, jl } from "../lib/ledger";
import {
  assetDraftsFromJournal, assetKeyOf, assetKindOf, assetSourceKey, autoDepreciationOn, autoRegisterSkipReason, defaultDeprExpenseAccount, fallbackDisposalAccount,
  findDisposalAccount, guessFiscalGroup, heldForFirstRun, isDisposalEntry, isUntouched, nextFreeCode, pairedAccumAccount, planAssetSync, registerNote, DISPOSAL_ACCOUNTS,
} from "../lib/asset-auto";
import type { Account, Bill, FixedAsset, JournalEntry, JournalLine, JournalSource } from "../lib/types";

let seq = 0;
const newId = () => `id-${++seq}`;
const ENTITY = "ent-1";
const accounts: Account[] = buildAccounts(ENTITY, newId);
const code = (c: string) => findByCode(accounts, c)!;
const on = (ls: JournalLine[], a: Account) => ls.filter((l) => l.accountId === a.id);

/** A posted journal as lib/posting.ts stores it (zero lines dropped), around the given lines. */
function journal(lines: JournalLine[], over: Partial<JournalEntry> = {}): JournalEntry {
  return { id: newId(), entityId: ENTITY, number: "JE-2026-0001", date: "2026-03-10", period: "2026-03", memo: "Journal memo", source: "manual" as JournalSource, lines: lines.filter((l) => l.debit !== 0 || l.credit !== 0), status: "posted", createdAt: "2026-03-10T00:00:00.000Z", ...over };
}

function bill(lines: Array<{ description: string; amount: number; account: string; ppn?: boolean }>): Bill {
  const input = lines.map((l) => ({ amount: l.amount, taxCode: l.ppn ? "ppn" as const : "none" as const, withholding: "none" as const }));
  const t = billTotals(input, { ppnRate: 0.11 });
  return {
    id: newId(), entityId: ENTITY, number: "BILL-2026-0007", vendor: { type: "other", name: "Toko Komputer Sanur" }, date: "2026-03-10", dueDate: "2026-03-24", currency: "IDR", fxRate: 1,
    lines: lines.map((l, i) => ({ id: newId(), description: l.description, amount: t.lines[i].amount, accountId: code(l.account).id, taxCode: input[i].taxCode, withholding: "none" })),
    subtotal: t.subtotal, ppnInput: t.ppnInput, withholdingTotal: t.withholdingTotal, total: t.total, amountPayable: t.amountPayable, amountPaid: 0, status: "sent", createdAt: "2026-03-10T00:00:00.000Z",
  };
}

const asset = (over: Partial<FixedAsset> = {}): FixedAsset => ({
  id: "fa-1", entityId: ENTITY, name: "Honda Vario", assetAccountId: code("1-2200").id, accumDeprAccountId: code("1-2210").id, deprExpenseAccountId: code("6-2100").id,
  acquisitionDate: "2026-01-15", cost: 48_000_000, salvageValue: 0, fiscalGroup: "group1", method: "straight_line", usefulLifeMonths: 48, accumulatedDepreciation: 0, status: "active", createdAt: "2026-01-15T00:00:00.000Z", ...over,
});

// ---------- Drafts ----------

test("a bill journal with two asset lines gives two drafts; expense, PPN and payable lines are ignored", () => {
  const b = bill([{ description: "MacBook Pro 14 finance", amount: 25_000_000, account: "1-2300", ppn: true }, { description: "Honda Vario 160", amount: 32_000_000, account: "1-2200", ppn: true }, { description: "Delivery and setup", amount: 1_500_000, account: "6-1300" }]);
  const j = journal(billJournalLines(b, accounts, { ppnCreditable: true }), { source: "bill", sourceId: b.id, date: b.date, memo: `Bill ${b.number} — ${b.vendor.name}` });
  assert.equal(validateLines(j.lines), null);
  assert.equal(j.lines.length, 5, "two assets, one expense, PPN input, payable");
  const drafts = assetDraftsFromJournal(j, accounts);
  assert.equal(drafts.length, 2);
  assert.deepEqual(drafts.map((d) => d.lineIndex), [0, 1]);
  assert.deepEqual(drafts.map((d) => d.name), ["MacBook Pro 14 finance", "Honda Vario 160"], "the line description names the asset");
  assert.deepEqual(drafts.map((d) => d.cost), [25_000_000, 32_000_000], "cost is the debit, without the creditable PPN");
  assert.deepEqual(drafts.map((d) => d.acquisitionDate), ["2026-03-10", "2026-03-10"]);
  assert.deepEqual(drafts.map((d) => d.assetAccountId), [code("1-2300").id, code("1-2200").id]);
  assert.deepEqual(drafts.map((d) => d.accumDeprAccountId), [code("1-2310").id, code("1-2210").id]);
  assert.deepEqual(drafts.map((d) => d.deprExpenseAccountId), [code("6-2100").id, code("6-2100").id]);
  assert.deepEqual(drafts.map((d) => [d.fiscalGroup, d.method, d.usefulLifeMonths]), [["group1", "straight_line", 48], ["group2", "straight_line", 96]]);
});

test("when the PPN is not creditable it is part of the asset's cost, as posted", () => {
  const b = bill([{ description: "Espresso machine", amount: 20_000_000, account: "1-2300", ppn: true }]);
  const j = journal(billJournalLines(b, accounts, { ppnCreditable: false }), { source: "bill", sourceId: b.id });
  const [d] = assetDraftsFromJournal(j, accounts);
  assert.equal(d.cost, 22_200_000);
  assert.equal(on(j.lines, code("1-2300"))[0].debit, d.cost);
});

test("credit lines on a fixed-asset account never register: a sale by journal, and the old asset of a trade-in", () => {
  const sale = journal([jl(code("1-1100"), 10_000_000, 0), jl(code("1-2200"), 0, 10_000_000, { description: "Old scooter sold" })]);
  assert.deepEqual(assetDraftsFromJournal(sale, accounts), []);
  const tradeIn = journal([jl(code("1-2200"), 300_000_000, 0, { description: "Toyota Avanza 2026" }), jl(code("1-2200"), 0, 100_000_000, { description: "Trade-in Avanza 2019" }), jl(code("1-1100"), 0, 200_000_000)]);
  const drafts = assetDraftsFromJournal(tradeIn, accounts);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].name, "Toyota Avanza 2026");
  assert.equal(drafts[0].cost, 300_000_000);
});

test("a line without description takes the journal memo; cents of the purchase survive in the cost", () => {
  const j = journal([jl(code("1-2300"), 15_250_000.5, 0), jl(code("1-1100"), 0, 15_250_000.5)], { memo: "  Projector for the meeting room " });
  const [d] = assetDraftsFromJournal(j, accounts);
  assert.equal(d.name, "Projector for the meeting room");
  assert.equal(d.cost, 15_250_000.5);
});

// ---------- Pairing and guesses ----------

test("account pairing and fiscal group per template account", () => {
  const expected: Array<[asset: string, accum: string, expense: string, group: string, months: number]> = [
    ["1-2000", "1-2110", "6-2100", "land", 0], // no accumulated account in its family: the first active one
    ["1-2100", "1-2110", "6-2100", "building_permanent", 240],
    ["1-2200", "1-2210", "6-2100", "group2", 96],
    ["1-2300", "1-2310", "6-2100", "group1", 48],
    ["1-2400", "1-2410", "6-2110", "group4", 240], // leasehold: amortisation expense, group IV as a placeholder
  ];
  for (const [a, accum, expense, group, months] of expected) {
    const j = journal([jl(code(a), 1_000_000, 0, { description: `Purchase on ${a}` }), jl(code("1-1100"), 0, 1_000_000)]);
    const [d] = assetDraftsFromJournal(j, accounts);
    assert.equal(findByCode(accounts, accum)!.id, d.accumDeprAccountId, `${a} pairs with ${accum}`);
    assert.equal(findByCode(accounts, expense)!.id, d.deprExpenseAccountId, `${a} expenses to ${expense}`);
    assert.equal(d.fiscalGroup, group, `${a} is guessed ${group}`);
    assert.equal(d.usefulLifeMonths, months);
    assert.equal(d.method, "straight_line");
  }
});

test("guesses follow the account name on a chart with other codes, and fall back when accounts are missing or inactive", () => {
  const acct = (c: string, name: string, subtype: Account["subtype"], over: Partial<Account> = {}): Account => ({ id: `x-${c}`, entityId: "ent-2", code: c, name, type: subtype === "depreciation" ? "expense" : "asset", subtype, normalBalance: "debit", isSystem: false, active: true, ...over });
  const car = acct("15100", "Kendaraan operasional", "fixed_asset");
  const villa = acct("15200", "Villa Canggu", "fixed_asset");
  const misc = acct("15900", "Other fixed assets", "fixed_asset");
  const accumCar = acct("15110", "Akumulasi penyusutan kendaraan", "accum_depr");
  const accumOld = acct("15010", "Accumulated depreciation (old)", "accum_depr", { active: false });
  const depr = acct("61500", "Beban penyusutan", "depreciation");
  const amort = acct("61600", "Beban amortisasi", "depreciation");
  const chart = [car, villa, misc, accumOld, accumCar, depr, amort];
  assert.equal(assetKindOf(car), "vehicle");
  assert.equal(guessFiscalGroup(car), "group2");
  assert.equal(guessFiscalGroup(villa), "building_permanent");
  assert.equal(guessFiscalGroup(misc), "group1", "an account that says nothing is treated as equipment");
  assert.equal(guessFiscalGroup({ code: "1-2400", name: "Long-term rights" }), "group4", "the template's code family is the fallback");
  assert.equal(pairedAccumAccount(car, chart)?.id, accumCar.id);
  assert.equal(pairedAccumAccount(villa, chart)?.id, accumCar.id, "no account in the family: the first active one, never the inactive one");
  assert.equal(defaultDeprExpenseAccount(car, chart)?.id, depr.id, "no 6-2100: the first active depreciation account");
  assert.equal(defaultDeprExpenseAccount(acct("15300", "Hak sewa tanah (leasehold)", "fixed_asset"), chart)?.id, amort.id, "leasehold goes to the amortisation account");
  // A chart without accumulated-depreciation or depreciation accounts still registers the asset; the accounts are chosen on review.
  const bare = [misc, acct("11000", "Bank", "bank")];
  const [d] = assetDraftsFromJournal({ id: "j", source: "manual", status: "posted", date: "2026-05-02", memo: "Generator", lines: [{ accountId: misc.id, accountCode: misc.code, debit: 9_000_000, credit: 0 }, { accountId: "x-11000", accountCode: "11000", debit: 0, credit: 9_000_000 }] }, bare);
  assert.equal(d.accumDeprAccountId, "");
  assert.equal(d.deprExpenseAccountId, "");
  assert.equal(d.name, "Generator");
});

// ---------- Idempotency and exclusions ----------

test("one asset per journal line: the key that makes registration idempotent", () => {
  const j = journal([jl(code("1-2300"), 5_000_000, 0, { description: "Printer" }), jl(code("1-2300"), 7_000_000, 0, { description: "Scanner" }), jl(code("1-1100"), 0, 12_000_000)]);
  const drafts = assetDraftsFromJournal(j, accounts);
  assert.deepEqual(drafts.map((d) => assetSourceKey(j.id, d.lineIndex)), [`${j.id}:0`, `${j.id}:1`]);
  assert.equal(assetKeyOf({ sourceJournalId: j.id, sourceLineIndex: 0 }), `${j.id}:0`);
  assert.equal(assetKeyOf({ sourceJournalId: j.id }), undefined, "an asset registered by hand has no key");
  assert.equal(assetKeyOf({}), undefined);
  // Registering again: the printer already has its asset, only the scanner is left.
  const taken = new Set([asset({ sourceJournalId: j.id, sourceLineIndex: 0 })].map(assetKeyOf));
  assert.deepEqual(drafts.filter((d) => !taken.has(assetSourceKey(j.id, d.lineIndex))).map((d) => d.name), ["Scanner"]);
  // The same line of another journal is another asset.
  assert.notEqual(assetSourceKey("other", 0), assetSourceKey(j.id, 0));
});

test("excluded sources: opening, closing, fx, depreciation and document flows other than bill / expense / manual", () => {
  const lines = [jl(code("1-2300"), 5_000_000, 0, { description: "Opening equipment" }), jl(code("3-1000"), 0, 5_000_000)];
  for (const source of ["opening", "closing", "fx", "depreciation", "payroll", "withholding", "invoice", "receipt", "disbursement"] as JournalSource[]) {
    assert.deepEqual(assetDraftsFromJournal(journal(lines, { source }), accounts), [], `${source} never registers`);
    assert.match(autoRegisterSkipReason(journal(lines, { source }))!, /do not register/);
  }
  for (const source of ["bill", "bank", "manual", "adjustment"] as JournalSource[]) {
    assert.equal(autoRegisterSkipReason(journal(lines, { source })), null);
    assert.equal(assetDraftsFromJournal(journal(lines, { source }), accounts).length, 1, `${source} registers`);
  }
});

test("excluded journals: QuickBooks history, entries that are not posted, and the disposal entry itself", () => {
  const lines = [jl(code("1-2200"), 80_000_000, 0, { description: "Pickup truck" }), jl(code("1-1100"), 0, 80_000_000)];
  assert.deepEqual(assetDraftsFromJournal(journal(lines, { source: "manual", sourceId: "qbo:Journal Entry:118:2025-06-30" }), accounts), []);
  assert.deepEqual(assetDraftsFromJournal(journal(lines, { source: "opening", sourceId: "qbo:tb:2025-12-31" }), accounts), []);
  assert.equal(assetDraftsFromJournal(journal(lines, { source: "manual", sourceId: "recurring-template-id" }), accounts).length, 1, "any other sourceId is fine");
  assert.deepEqual(assetDraftsFromJournal(journal(lines, { status: "void" }), accounts), []);
  assert.deepEqual(assetDraftsFromJournal(journal(lines, { status: "draft" }), accounts), []);
  const sold = asset({ id: "fa-sold", status: "disposed", disposalJournalId: "je-disposal" });
  const legacy = asset({ id: "fa-legacy", status: "disposed" });
  assert.equal(isDisposalEntry({ id: "je-disposal", source: "adjustment", status: "posted" }, [sold]), true);
  assert.equal(isDisposalEntry({ id: "je-x", source: "adjustment", sourceId: "fa-legacy", status: "posted" }, [legacy]), true, "disposals posted before the entry id was stored");
  assert.equal(isDisposalEntry({ id: "je-x", source: "manual", sourceId: "fa-legacy", status: "posted" }, [legacy]), false);
  assert.deepEqual(assetDraftsFromJournal(journal(lines, { id: "je-disposal", source: "adjustment", sourceId: "fa-sold" }), accounts, [sold]), []);
  assert.equal(assetDraftsFromJournal(journal(lines, { source: "adjustment" }), accounts, [sold, legacy]).length, 1, "an ordinary adjustment still registers");
});

// ---------- Editing the journal ----------

test("an edited journal: assets follow their line, a corrected amount is kept, a removed line orphans, a new line registers", () => {
  const draftsOf = (j: JournalEntry) => assetDraftsFromJournal(j, accounts);
  const before = journal([jl(code("1-2300"), 5_000_000, 0, { description: "Printer" }), jl(code("1-2200"), 30_000_000, 0, { description: "Scooter" }), jl(code("1-1100"), 0, 35_000_000)]);
  const printer = { id: "fa-printer", sourceLineIndex: 0 };
  const scooter = { id: "fa-scooter", sourceLineIndex: 1 };

  // Lines swapped and a memo fix: nothing to create or remove, the assets point at the new positions.
  const swapped = journal([jl(code("1-2200"), 30_000_000, 0, { description: "Scooter Vario" }), jl(code("1-2300"), 5_000_000, 0, { description: "Printer" }), jl(code("1-1100"), 0, 35_000_000)], { id: before.id });
  let plan = planAssetSync(draftsOf(before), draftsOf(swapped), [printer, scooter]);
  assert.deepEqual(plan.keep.map((k) => [k.asset.id, k.draft.lineIndex]), [["fa-printer", 1], ["fa-scooter", 0]]);
  assert.deepEqual([plan.orphans, plan.create], [[], []]);

  // The scooter's amount corrected in place: same asset, new cost.
  const repriced = journal([jl(code("1-2300"), 5_000_000, 0, { description: "Printer" }), jl(code("1-2200"), 31_500_000, 0, { description: "Scooter" }), jl(code("1-1100"), 0, 36_500_000)], { id: before.id });
  plan = planAssetSync(draftsOf(before), draftsOf(repriced), [printer, scooter]);
  assert.deepEqual(plan.keep.map((k) => [k.asset.id, k.draft.cost]), [["fa-printer", 5_000_000], ["fa-scooter", 31_500_000]]);
  assert.deepEqual([plan.orphans, plan.create], [[], []]);

  // The printer was an expense after all, and a laptop was added: one orphan, one asset to create.
  const reworked = journal([jl(code("6-1700"), 5_000_000, 0, { description: "Printer" }), jl(code("1-2200"), 30_000_000, 0, { description: "Scooter" }), jl(code("1-2300"), 18_000_000, 0, { description: "Laptop" }), jl(code("1-1100"), 0, 53_000_000)], { id: before.id });
  plan = planAssetSync(draftsOf(before), draftsOf(reworked), [printer, scooter]);
  assert.deepEqual(plan.keep.map((k) => k.asset.id), ["fa-scooter"]);
  assert.deepEqual(plan.orphans.map((a) => a.id), ["fa-printer"]);
  assert.deepEqual(plan.create.map((d) => [d.name, d.lineIndex]), [["Laptop", 2]]);

  // The printer's asset was removed from the register on review: an unrelated edit does not bring it back.
  plan = planAssetSync(draftsOf(before), draftsOf(swapped), [scooter]);
  assert.deepEqual(plan.keep.map((k) => k.asset.id), ["fa-scooter"]);
  assert.deepEqual([plan.orphans, plan.create], [[], []]);

  // Re-tagged as opening balances: no purchase any more, both assets are orphans.
  plan = planAssetSync(draftsOf(before), draftsOf({ ...before, source: "opening" }), [printer, scooter]);
  assert.deepEqual(plan.orphans.map((a) => a.id), ["fa-printer", "fa-scooter"]);
  assert.deepEqual([plan.keep, plan.create], [[], []]);
});

// ---------- Disposal ----------

test("catch-up depreciation before a disposal, and gain or loss lines that balance", () => {
  // 48,000,000 over 48 months from January 2026 = 1,000,000 a month; posted through March.
  const a = asset({ depreciatedThrough: "2026-03", accumulatedDepreciation: 3_000_000 });
  const p = disposalPreview(a, "2026-08-20", 43_500_000);
  assert.equal(p.through, "2026-07", "the disposal month itself is not depreciated");
  assert.deepEqual(p.catchUp, { amount: 4_000_000, periods: ["2026-04", "2026-05", "2026-06", "2026-07"] });
  assert.equal(p.accumulated, 7_000_000);
  assert.equal(p.netBookValue, 41_000_000);
  assert.equal(p.gainLoss, 2_500_000);
  assert.equal(p.postedAhead, false);

  const catchUp = depreciationJournalLines([{ asset: a, amount: p.catchUp.amount }], accounts);
  assert.equal(validateLines(catchUp), null);
  assert.equal(on(catchUp, code("6-2100"))[0].debit, 4_000_000);
  assert.equal(on(catchUp, code("1-2210"))[0].credit, 4_000_000);

  const caughtUp = { ...a, accumulatedDepreciation: p.accumulated, depreciatedThrough: p.through };
  const gain = disposalJournalLines({ asset: caughtUp, proceedsIDR: p.proceeds, proceedsAccount: code("1-1100"), gainAccount: code("7-1200"), lossAccount: code("8-1200"), accounts });
  assert.equal(validateLines(gain), null);
  assert.equal(on(gain, code("1-2210"))[0].debit, 7_000_000);
  assert.equal(on(gain, code("1-1100"))[0].debit, 43_500_000);
  assert.equal(on(gain, code("1-2200"))[0].credit, 48_000_000);
  assert.equal(on(gain, code("7-1200"))[0].credit, p.gainLoss, "the preview's gain is the one posted");
  assert.equal(on(gain, code("8-1200")).length, 0);
  assert.equal(disposalPreview(caughtUp, "2026-08-20", 43_500_000).catchUp.amount, 0, "once caught up nothing more is due");

  // Sold below book value on credit: a loss, the proceeds on other receivables.
  const low = disposalPreview(a, "2026-08-20", 30_000_000);
  assert.equal(low.gainLoss, -11_000_000);
  const loss = disposalJournalLines({ asset: caughtUp, proceedsIDR: low.proceeds, proceedsAccount: code("1-1210"), gainAccount: code("7-1200"), lossAccount: code("8-1200"), accounts });
  assert.equal(validateLines(loss), null);
  assert.equal(on(loss, code("8-1200"))[0].debit, 11_000_000);
  assert.equal(on(loss, code("1-1210"))[0].debit, 30_000_000);

  // Scrapped: no proceeds line, the whole net book value is the loss.
  const scrapped = disposalPreview(a, "2026-08-20", 0);
  assert.equal(scrapped.gainLoss, -41_000_000);
  const writeOff = disposalJournalLines({ asset: caughtUp, proceedsIDR: 0, gainAccount: code("7-1200"), lossAccount: code("8-1200"), accounts });
  assert.equal(validateLines(writeOff), null);
  assert.equal(writeOff.length, 3);
  assert.equal(on(writeOff, code("8-1200"))[0].debit, 41_000_000);

  // Sold exactly at book value: neither a gain nor a loss line.
  const even = disposalJournalLines({ asset: caughtUp, proceedsIDR: 41_000_000, proceedsAccount: code("1-1100"), gainAccount: code("7-1200"), lossAccount: code("8-1200"), accounts });
  assert.equal(validateLines(even), null);
  assert.equal(disposalPreview(a, "2026-08-20", 41_000_000).gainLoss, 0);
  assert.equal(on(even, code("7-1200")).length + on(even, code("8-1200")).length, 0);
});

test("disposal preview at the edges: never depreciated, same month as the purchase, back-dated, fully depreciated, land, cents", () => {
  // Never depreciated: everything from the acquisition month to the month before the disposal is caught up.
  const fresh = disposalPreview(asset(), "2026-04-02", 46_000_000);
  assert.deepEqual(fresh.catchUp.periods, ["2026-01", "2026-02", "2026-03"]);
  assert.equal(fresh.netBookValue, 45_000_000);
  assert.equal(fresh.gainLoss, 1_000_000);
  // Sold in the month it was bought: no depreciation at all.
  const sameMonth = disposalPreview(asset(), "2026-01-28", 47_000_000);
  assert.equal(sameMonth.catchUp.amount, 0);
  assert.equal(sameMonth.gainLoss, -1_000_000);
  // Back-dated disposal after later months were posted: the books' figure is used and flagged.
  const ahead = disposalPreview(asset({ depreciatedThrough: "2026-06", accumulatedDepreciation: 6_000_000 }), "2026-05-10", 42_000_000);
  assert.equal(ahead.catchUp.amount, 0);
  assert.equal(ahead.postedAhead, true);
  assert.equal(ahead.netBookValue, 42_000_000);
  // Fully depreciated and scrapped: nothing to catch up, no result.
  const done = disposalPreview(asset({ status: "fully_depreciated", accumulatedDepreciation: 48_000_000, depreciatedThrough: "2029-12" }), "2031-02-01", 0);
  assert.deepEqual([done.catchUp.amount, done.netBookValue, done.gainLoss], [0, 0, 0]);
  // Land is not depreciated: the gain is proceeds minus cost.
  const land = disposalPreview(asset({ fiscalGroup: "land", usefulLifeMonths: 0, cost: 900_000_000 }), "2030-06-30", 1_250_000_000);
  assert.deepEqual([land.catchUp.amount, land.gainLoss], [0, 350_000_000]);
  // A purchase with cents: the entry still balances to the cent.
  const cents = asset({ cost: 48_000_000.5, depreciatedThrough: "2026-03", accumulatedDepreciation: 3_000_000 });
  const p = disposalPreview(cents, "2026-08-20", 43_500_000.25);
  const lines = disposalJournalLines({ asset: { ...cents, accumulatedDepreciation: p.accumulated }, proceedsIDR: p.proceeds, proceedsAccount: code("1-1100"), gainAccount: code("7-1200"), lossAccount: code("8-1200"), accounts });
  assert.equal(validateLines(lines), null);
  assert.equal(on(lines, code("7-1200"))[0].credit, p.gainLoss);
});

test("gain and loss accounts: found by name, numbered 7-1210 / 8-1210 or the next free code, general accounts as the fallback", () => {
  assert.equal(findDisposalAccount(accounts, "gain"), undefined, "the template has no dedicated account: it is created on first use");
  assert.equal(findDisposalAccount(accounts, "loss"), undefined);
  assert.equal(nextFreeCode(accounts, DISPOSAL_ACCOUNTS.gain.code), "7-1210");
  assert.equal(nextFreeCode(accounts, DISPOSAL_ACCOUNTS.loss.code), "8-1210");
  assert.equal(fallbackDisposalAccount(accounts, "gain")?.code, "7-1200");
  assert.equal(fallbackDisposalAccount(accounts, "loss")?.code, "8-1200");
  const other: Account = { ...code("7-1200"), id: "x-dividend", code: "7-1210", name: "Dividend income" };
  const gain: Account = { ...code("7-1200"), id: "x-gain", code: "7-1215", name: "Gain on sale of assets" };
  const loss: Account = { ...code("8-1200"), id: "x-loss", code: "8-1210", name: "Loss on disposal of fixed assets" };
  const chart = [...accounts, other, gain, loss];
  assert.equal(nextFreeCode(chart, "7-1210"), "7-1211", "7-1210 is taken by another account");
  assert.equal(nextFreeCode([...chart, { code: "7-1211" }], "7-1210"), "7-1212");
  assert.equal(findDisposalAccount(chart, "gain")?.id, "x-gain", "an existing account is recognised by its name, whatever its code");
  assert.equal(findDisposalAccount(chart, "loss")?.id, "x-loss");
  assert.equal(findDisposalAccount([...accounts, { ...loss, active: false }], "loss"), undefined, "an inactive account is not used");
  assert.equal(findDisposalAccount([...accounts, { ...gain, type: "expense" }], "gain"), undefined, "nor one of the wrong type");
});

// ---------- Leaving the register, automatic run ----------

test("voiding the purchase: an untouched asset can leave the register, one with depreciation, a disposal or documents cannot", () => {
  assert.equal(isUntouched(asset()), true);
  assert.equal(isUntouched(asset({ needsReview: true, sourceJournalId: "j" })), true);
  assert.equal(isUntouched(asset({ accumulatedDepreciation: 1_000_000, depreciatedThrough: "2026-01" })), false);
  assert.equal(isUntouched(asset({ status: "disposed" })), false);
  assert.equal(isUntouched(asset({ status: "fully_depreciated", accumulatedDepreciation: 48_000_000 })), false);
  assert.equal(isUntouched(asset({ attachments: [{ id: "f", name: "invoice.pdf", size: 1, type: "application/pdf", path: "p", uploadedAt: "2026-01-15T00:00:00.000Z" }] })), false);
});

test("automatic run: on by default, and never the first to post back months on a hand-registered asset", () => {
  assert.equal(autoDepreciationOn({}), true);
  assert.equal(autoDepreciationOn({ autoDepreciation: true }), true);
  assert.equal(autoDepreciationOn({ autoDepreciation: false }), false);
  // Registered by hand in January, never depreciated, run for October: nine earlier months would be posted unasked.
  assert.equal(heldForFirstRun(asset(), "2026-10"), true);
  assert.equal(heldForFirstRun(asset({ acquisitionDate: "2026-10-03" }), "2026-10"), false, "bought in the month being posted: nothing reaches back");
  assert.equal(heldForFirstRun(asset({ depreciatedThrough: "2026-08", accumulatedDepreciation: 8_000_000 }), "2026-10"), false, "already started: skipped months are caught up");
  assert.equal(heldForFirstRun(asset({ sourceJournalId: "je-1", sourceLineIndex: 0 }), "2026-10"), false, "registered from its purchase: its cost and date come from the ledger");
  assert.equal(heldForFirstRun(asset({ needsReview: true }), "2026-10"), false, "waiting for review: not depreciated at all, so not held either");
  assert.equal(heldForFirstRun(asset({ fiscalGroup: "land", usefulLifeMonths: 0 }), "2026-10"), false);
  assert.equal(heldForFirstRun(asset({ status: "disposed" }), "2026-10"), false);
});

test("the note added to the flash message says what happened to the register, or nothing", () => {
  const none = { created: [], updated: 0, removed: 0, flagged: 0, reopened: 0 };
  assert.equal(registerNote(none), "");
  assert.equal(registerNote({ ...none, created: [asset()] }), "; 1 asset registered automatically (review under Assets)");
  assert.equal(registerNote({ ...none, created: [asset(), asset()] }), "; 2 assets registered automatically (review under Assets)");
  assert.match(registerNote({ ...none, removed: 1, flagged: 2 }), /^; 1 asset removed from the register; 2 assets kept in the register with a note/);
  assert.equal(registerNote({ ...none, reopened: 1 }), "; 1 asset back in use");
  assert.match(registerNote({ ...none, error: "fixed_assets insert: timeout" }), /could not be updated \(fixed_assets insert: timeout\)/);
});
