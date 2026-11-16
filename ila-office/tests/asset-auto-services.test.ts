import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Account, BankAccount, Entity, FixedAsset, JournalEntry } from "../lib/types";

/**
 * The services of lib/asset-auto.ts and the asset functions of lib/books.ts end to end on the file backend: a
 * purchase registers its asset, a void takes it back, depreciation waits for the review, a disposal catches up and
 * books its gain or loss, the daily run posts last month. Synthetic data only. lib/db.ts reads ILA_DATA_DIR when it
 * is first loaded, so the temp directory is set before the modules are imported, and the Supabase variables are
 * removed so a developer's environment can never be written to.
 */

const DIR = mkdtempSync(path.join(os.tmpdir(), "ila-assets-"));
process.env.ILA_DATA_DIR = DIR;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

let db: typeof import("../lib/db").db;
let B: typeof import("../lib/books");
let M: typeof import("../lib/money-moves");
let P: typeof import("../lib/posting");
let A: typeof import("../lib/asset-auto");
let accounts: Account[];
let bank: BankAccount;

const ENTITY = "ent-assets";
const OTHER = "ent-off";
const entity = (id: string, over: Partial<Entity> = {}): Entity => ({
  id, name: `PT Contoh ${id}`, legalName: `PT Contoh ${id}`, type: "pt_pma", country: "ID", isOwn: false, baseCurrency: "IDR", fiscalYearStartMonth: 1,
  tax: { regime: "normal_22", pkp: false, ppnRate: 0.11, lkpm: true, payroll: false }, status: "active", createdAt: "2026-01-01T00:00:00.000Z", ...over,
});
const code = (c: string) => accounts.find((a) => a.code === c)!;
const assetsOf = (entityId = ENTITY) => db.list("fixed_assets", { where: { entityId } });
const journalsOf = (where: Partial<JournalEntry>) => db.list("journal_entries", { where: { entityId: ENTITY, ...where }, orderBy: "date" });
const reload = async (a: FixedAsset) => (await db.get("fixed_assets", a.id))!;
const sum = (j: JournalEntry, accountId: string, side: "debit" | "credit") => j.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l[side], 0);

async function postedBill(date: string, lines: Array<{ description: string; amount: number; account: string }>) {
  const draft = await B.createBill(ENTITY, { vendor: { type: "other", name: "Toko Sanur" }, date, currency: "IDR", fxRate: 1, lines: lines.map((l) => ({ description: l.description, amount: l.amount, accountId: code(l.account).id, taxCode: "none", withholding: "none" })) });
  return B.postBill(ENTITY, draft.id);
}

before(async () => {
  ({ db } = await import("../lib/db"));
  B = await import("../lib/books");
  M = await import("../lib/money-moves");
  P = await import("../lib/posting");
  A = await import("../lib/asset-auto");
  const { buildAccounts } = await import("../lib/coa");
  await db.insert("entities", entity(ENTITY));
  await db.insert("entities", entity(OTHER, { autoDepreciation: false }));
  accounts = buildAccounts(ENTITY, () => db.newId());
  await db.insertMany("accounts", [...accounts, ...buildAccounts(OTHER, () => db.newId())]);
  bank = await B.createBankAccount(ENTITY, { name: "OCBC IDR", currency: "IDR", accountId: code("1-1100").id });
});
after(() => rmSync(DIR, { recursive: true, force: true }));

test("posting a bill registers its fixed-asset lines for review, once", async () => {
  const bill = await postedBill("2026-03-10", [{ description: "MacBook Pro 14", amount: 24_000_000, account: "1-2300" }, { description: "Setup fee", amount: 500_000, account: "6-1300" }]);
  const [a, ...rest] = await assetsOf();
  assert.equal(rest.length, 0, "the expense line registers nothing");
  assert.equal(a.name, "MacBook Pro 14");
  assert.deepEqual([a.cost, a.acquisitionDate, a.needsReview, a.status, a.billId, a.sourceJournalId, a.sourceLineIndex], [24_000_000, "2026-03-10", true, "active", bill.id, bill.journalId, 0]);
  assert.deepEqual([a.assetAccountId, a.accumDeprAccountId, a.deprExpenseAccountId], [code("1-2300").id, code("1-2310").id, code("6-2100").id]);
  assert.deepEqual([a.fiscalGroup, a.method, a.usefulLifeMonths], ["group1", "straight_line", 48]);
  const journal = (await db.get("journal_entries", bill.journalId!))!;
  assert.deepEqual(await A.registerAssetsFromJournal(ENTITY, journal, { billId: bill.id }), [], "registering the same journal again creates nothing");
  assert.equal((await assetsOf()).length, 1);
});

test("an asset waiting for review is not depreciated and cannot be disposed of; confirming it starts depreciation", async () => {
  const [a] = await assetsOf();
  const idle = await B.runDepreciation(ENTITY, "2026-04");
  assert.equal(idle.journal, undefined);
  await assert.rejects(B.disposeAsset(ENTITY, a.id, { date: "2026-05-01" }), /Confirm this asset first/);
  const confirmed = await B.updateAsset(ENTITY, a.id, { name: "MacBook Pro 14 — finance", confirm: true });
  assert.deepEqual([confirmed.needsReview, confirmed.name, confirmed.usefulLifeMonths], [false, "MacBook Pro 14 — finance", 48]);
  assert.equal((await B.runDepreciation(ENTITY, "2026-02")).journal, undefined, "acquired after the period: nothing");
  const run = await B.runDepreciation(ENTITY, "2026-04");
  assert.equal(run.journal?.date, "2026-04-30");
  assert.deepEqual(run.runs.map((r) => [r.amount, r.periods]), [[1_000_000, ["2026-03", "2026-04"]]], "500,000 a month from the acquisition month");
  const after = await reload(a);
  assert.deepEqual([after.accumulatedDepreciation, after.depreciatedThrough], [1_000_000, "2026-04"]);
  await assert.rejects(B.updateAsset(ENTITY, a.id, { usefulLifeMonths: 96 }), /can no longer change/);
  assert.equal((await B.updateAsset(ENTITY, a.id, { notes: "Serial C02XK0AAJGH5" })).notes, "Serial C02XK0AAJGH5", "notes and accounts stay open");
});

test("voiding the purchase: an untouched asset leaves the register, a depreciated one stays with a note", async () => {
  const fresh = await postedBill("2026-05-05", [{ description: "Office chairs", amount: 6_000_000, account: "1-2300" }]);
  assert.equal((await assetsOf()).length, 2);
  await B.voidBill(ENTITY, fresh.id);
  assert.deepEqual((await assetsOf()).map((x) => x.name), ["MacBook Pro 14 — finance"], "nothing was posted on the chairs: removed");
  const [mac] = await assetsOf();
  await B.voidBill(ENTITY, mac.billId!);
  const kept = await reload(mac);
  assert.equal(kept.needsReview, true);
  assert.match(kept.notes ?? "", /bill BILL-\d{4}-\d{4} this asset was registered from was voided/);
  assert.equal(kept.accumulatedDepreciation, 1_000_000, "the register still shows what was posted");
  await B.deleteAsset(ENTITY, kept.id).then(() => assert.fail("a depreciated asset must not be deleted"), (e) => assert.match(String(e), /already posted/));
  // Clean slate for the next tests: the depreciation entry is voided and the asset taken out by hand.
  for (const j of await journalsOf({ source: "depreciation", status: "posted" })) await P.voidJournal(ENTITY, j.id);
  await db.remove("fixed_assets", kept.id);
});

test("an expense on a fixed-asset account registers the asset; a deposit never does; voiding the expense removes it", async () => {
  const r = await M.recordMoneyMove(ENTITY, { kind: "expense", bankAccountId: bank.id, date: "2026-01-15", payee: "Honda Denpasar", memo: "Honda Vario 160", lines: [{ accountId: code("1-2200").id, amount: 48_000_000 }] });
  assert.equal(r.assets.length, 1);
  const [a] = await assetsOf();
  assert.deepEqual([a.name, a.cost, a.paymentId, a.sourceJournalId, a.fiscalGroup, a.usefulLifeMonths, a.needsReview], ["Honda Vario 160", 48_000_000, r.payment.id, r.journal.id, "group2", 96, true]);
  const deposit = await M.recordMoneyMove(ENTITY, { kind: "deposit", bankAccountId: bank.id, date: "2026-01-20", memo: "Refund with a correction", lines: [{ accountId: code("7-1200").id, amount: 2_000_000 }, { accountId: code("1-2200").id, amount: -500_000 }] });
  assert.deepEqual(deposit.assets, [], "a debit on a fixed-asset account inside a deposit is not a purchase");
  const second = await M.recordMoneyMove(ENTITY, { kind: "expense", bankAccountId: bank.id, date: "2026-02-01", memo: "Helmet rack", lines: [{ accountId: code("1-2300").id, amount: 3_000_000 }] });
  assert.equal((await assetsOf()).length, 2);
  await M.voidMoneyMove(ENTITY, second.payment.id);
  assert.deepEqual((await assetsOf()).map((x) => x.name), ["Honda Vario 160"]);
});

test("a sale from a statement line: depreciation is caught up, the gain goes to its own account, the line is matched", async () => {
  const [vario] = await assetsOf();
  // Group I over 48 months so the figures are round: 1,000,000 a month from January 2026.
  await B.updateAsset(ENTITY, vario.id, { fiscalGroup: "group1", confirm: true });
  await B.runDepreciation(ENTITY, "2026-03");
  assert.deepEqual([(await reload(vario)).accumulatedDepreciation, (await reload(vario)).depreciatedThrough], [3_000_000, "2026-03"]);
  await db.insert("bank_transactions", { id: "tx-sale", entityId: ENTITY, bankAccountId: bank.id, date: "2026-08-20", description: "TRSF E-BANKING CR PEMBELIAN MOTOR", amount: 43_500_000, hash: "h-sale", status: "unmatched", createdAt: "2026-08-21T00:00:00.000Z" });
  await assert.rejects(B.disposeAsset(ENTITY, vario.id, { date: "2026-08-20", proceeds: 40_000_000, bankTransactionId: "tx-sale" }), /must equal the statement line/);
  assert.equal((await reload(vario)).depreciatedThrough, "2026-03", "a refused disposal posts nothing");

  const disposal = await B.disposeAsset(ENTITY, vario.id, { date: "2026-08-20", proceeds: 43_500_000, bankTransactionId: "tx-sale" });
  const [catchUp] = await journalsOf({ sourceId: `${vario.id}:catchup` });
  assert.deepEqual([catchUp.source, catchUp.date, catchUp.status], ["depreciation", "2026-07-31", "posted"], "one journal dated the last day of the month before the disposal");
  assert.equal(sum(catchUp, code("6-2100").id, "debit"), 4_000_000, "April to July");
  assert.equal(sum(catchUp, code("1-2210").id, "credit"), 4_000_000, "on the vehicles' accumulated depreciation account");

  const chart = await B.entityAccounts(ENTITY);
  const gain = chart.find((x) => x.code === "7-1210")!;
  assert.deepEqual([gain.name, gain.type, gain.subtype], ["Gain on disposal of fixed assets", "revenue", "other_income"], "created on first use");
  assert.deepEqual([disposal.source, disposal.sourceId, disposal.date], ["adjustment", vario.id, "2026-08-20"]);
  assert.equal(sum(disposal, code("1-2210").id, "debit"), 7_000_000);
  assert.equal(sum(disposal, code("1-1100").id, "debit"), 43_500_000);
  assert.equal(sum(disposal, code("1-2200").id, "credit"), 48_000_000);
  assert.equal(sum(disposal, gain.id, "credit"), 2_500_000);
  const sold = await reload(vario);
  assert.deepEqual([sold.status, sold.disposedAt, sold.disposalProceeds, sold.disposalJournalId, sold.disposalGainLoss, sold.accumulatedDepreciation, sold.depreciatedThrough], ["disposed", "2026-08-20", 43_500_000, disposal.id, 2_500_000, 7_000_000, "2026-07"]);
  const line = (await db.get("bank_transactions", "tx-sale"))!;
  assert.deepEqual([line.status, line.matchedJournalId], ["matched", disposal.id]);
  await assert.rejects(B.disposeAsset(ENTITY, vario.id, { date: "2026-09-01" }), /already disposed/);
  assert.deepEqual(await A.registerAssetsFromJournal(ENTITY, disposal), [], "the disposal entry never registers an asset");
});

test("voiding the disposal entry puts the asset back in use and frees the statement line; scrapping it books a loss", async () => {
  const [vario] = await assetsOf();
  const outcome = await A.afterJournalVoided(ENTITY, await P.voidJournal(ENTITY, vario.disposalJournalId!));
  assert.equal(outcome.reopened, 1);
  const back = await reload(vario);
  assert.deepEqual([back.status, back.disposedAt, back.disposalJournalId, back.disposalGainLoss, back.accumulatedDepreciation], ["active", undefined, undefined, undefined, 7_000_000], "the catch-up depreciation stays: it was due anyway");
  assert.equal((await db.get("bank_transactions", "tx-sale"))!.status, "unmatched");

  const writeOff = await B.disposeAsset(ENTITY, vario.id, { date: "2026-08-25" });
  assert.equal((await journalsOf({ sourceId: `${vario.id}:catchup`, status: "posted" })).length, 1, "already caught up through July: no second catch-up");
  const loss = (await B.entityAccounts(ENTITY)).find((x) => x.code === "8-1210")!;
  assert.equal(loss.name, "Loss on disposal of fixed assets");
  assert.equal(sum(writeOff, loss.id, "debit"), 41_000_000);
  assert.equal(writeOff.lines.length, 3, "accumulated depreciation, loss, cost: no proceeds line");
  assert.equal((await reload(vario)).disposalGainLoss, -41_000_000);
});

test("editing a hand-written journal re-prices its asset and registers a line that was added", async () => {
  const lines = (amount: number, extra = 0) => [
    { accountId: code("1-2300").id, accountCode: "1-2300", description: "Projector", debit: amount, credit: 0 },
    ...(extra ? [{ accountId: code("1-2100").id, accountCode: "1-2100", description: "Carport", debit: extra, credit: 0 }] : []),
    { accountId: code("1-1100").id, accountCode: "1-1100", debit: 0, credit: amount + extra },
  ];
  const entry = await P.postJournal(ENTITY, { date: "2026-09-03", memo: "Projector bought in cash", source: "manual", lines: lines(12_000_000) });
  assert.equal((await A.autoRegisterAssets(ENTITY, entry)).created.length, 1);
  const edited = await P.updateJournal(ENTITY, entry.id, { date: "2026-09-04", memo: entry.memo, source: "manual", lines: lines(12_500_000, 80_000_000) });
  const outcome = await A.syncAssetsAfterJournalEdit(ENTITY, entry, edited);
  assert.deepEqual([outcome.updated, outcome.created.length, outcome.removed, outcome.flagged, outcome.error], [1, 1, 0, 0, undefined]);
  const linked = (await assetsOf()).filter((x) => x.sourceJournalId === entry.id).sort((x, y) => x.sourceLineIndex! - y.sourceLineIndex!);
  assert.deepEqual(linked.map((x) => [x.name, x.cost, x.acquisitionDate, x.fiscalGroup]), [["Projector", 12_500_000, "2026-09-04", "group1"], ["Carport", 80_000_000, "2026-09-04", "building_permanent"]]);
  // Voided from the Journal page: both leave the register, nothing was posted on them.
  assert.equal((await A.afterJournalVoided(ENTITY, await P.voidJournal(ENTITY, entry.id))).removed, 2);
});

test("the daily run posts last month once, reports a locked period, leaves switched-off entities and held assets alone", async () => {
  const fresh = await postedBill("2026-09-10", [{ description: "Server rack", amount: 9_600_000, account: "1-2300" }]);
  const rack = (await assetsOf()).find((x) => x.billId === fresh.id)!;
  let first = await A.runAutoDepreciation("2026-11-01");
  assert.deepEqual([first.period, first.entities, first.posted, first.skipped], ["2026-10", 0, [], []], "the only active asset still waits for review");
  await B.updateAsset(ENTITY, rack.id, { confirm: true });
  // The other entity has automatic depreciation off; this one also holds a hand-registered asset that was never depreciated.
  const otherChart = await B.entityAccounts(OTHER);
  const oc = (c: string) => otherChart.find((x) => x.code === c)!.id;
  await B.createAsset(OTHER, { name: "Generator", assetAccountId: oc("1-2300"), accumDeprAccountId: oc("1-2310"), deprExpenseAccountId: oc("6-2100"), acquisitionDate: "2026-06-01", cost: 4_800_000, fiscalGroup: "group1" });
  const old = await B.createAsset(ENTITY, { name: "Old photocopier (migrated)", assetAccountId: code("1-2300").id, accumDeprAccountId: code("1-2310").id, deprExpenseAccountId: code("6-2100").id, acquisitionDate: "2024-02-01", cost: 9_600_000, fiscalGroup: "group1" });

  await B.lockPeriod(ENTITY, "2026-10");
  const locked = await A.runAutoDepreciation("2026-11-01");
  assert.equal(locked.entities, 1);
  assert.deepEqual(locked.posted, []);
  assert.match(locked.skipped.find((s) => s.entityId === ENTITY)!.reason, /Period 2026-10 is locked/);
  await B.unlockPeriod(ENTITY, "2026-10");

  first = await A.runAutoDepreciation("2026-11-01");
  assert.equal(first.entities, 1, "the entity with automatic depreciation off is not run");
  assert.deepEqual(first.posted.map((p) => [p.entityId, p.amount]), [[ENTITY, 400_000]], "September and October of the rack, 200,000 each");
  assert.match(first.skipped[0].reason, /1 asset registered by hand and never depreciated \(Old photocopier \(migrated\)\)/);
  assert.equal((await reload(old)).accumulatedDepreciation, 0, "the automatic run does not start a hand-registered asset's back months");
  assert.deepEqual([(await reload(rack)).accumulatedDepreciation, (await reload(rack)).depreciatedThrough], [400_000, "2026-10"]);
  assert.equal((await assetsOf(OTHER))[0].accumulatedDepreciation, 0);

  const again = await A.runAutoDepreciation("2026-11-02");
  assert.deepEqual(again.posted, [], "the next day finds nothing due");
  // One manual run releases the held asset; from then on the automatic run carries it.
  const manual = await B.runDepreciation(ENTITY, "2026-10");
  assert.equal(manual.runs.find((r) => r.asset.id === old.id)!.periods.length, 33, "February 2024 to October 2026");
  const december = await A.runAutoDepreciation("2026-12-01");
  assert.deepEqual([december.period, december.posted.map((p) => p.amount), december.skipped], ["2026-11", [400_000], []], "200,000 each for the rack and the photocopier");
});
