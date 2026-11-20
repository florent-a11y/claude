import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import type { Account, BankAccount, Entity, FixedAsset, JournalEntry, JournalLine } from "../lib/types";

/**
 * The take-on end to end on the file backend (lib/asset-takeon-services.ts, the asset functions of lib/books.ts and
 * the hook of lib/qbo-migration-services.ts): a ledger that arrives with fixed assets and their accumulated
 * depreciation, the assets brought into the register once, their review and confirmation, the monthly run that
 * posts only the months after the previous books, the disposal with the right net book value, the automatic run
 * that is not held, and a QuickBooks migration that fills the register on its own. Invented data only. lib/db.ts
 * reads ILA_DATA_DIR when it is first loaded, so the temp directory is set before the modules are imported, and the
 * Supabase variables are removed so a developer's environment can never be written to.
 */

const DIR = mkdtempSync(path.join(os.tmpdir(), "ila-takeon-"));
process.env.ILA_DATA_DIR = DIR;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

let db: typeof import("../lib/db").db;
let B: typeof import("../lib/books");
let P: typeof import("../lib/posting");
let A: typeof import("../lib/asset-auto");
let T: typeof import("../lib/asset-takeon-services");
let S: typeof import("../lib/qbo-migration-services");
let accounts: Account[];
let bank: BankAccount;
let vehicle: Account, accumVehicle: Account, deprVehicle: Account, equipment: Account, accumEquipment: Account, building: Account;
let opening: JournalEntry;

const ENTITY = "ent-takeon";
const entity = (id: string, over: Partial<Entity> = {}): Entity => ({
  id, name: `PT Contoh ${id}`, legalName: `PT Contoh ${id}`, type: "pt_pma", country: "ID", isOwn: false, baseCurrency: "IDR", fiscalYearStartMonth: 1,
  tax: { regime: "normal_22", pkp: false, ppnRate: 0.11, lkpm: true, payroll: false }, status: "active", createdAt: "2026-01-01T00:00:00.000Z", ...over,
});
const code = (c: string) => accounts.find((a) => a.code === c)!;
const assetsOf = (entityId = ENTITY) => db.list("fixed_assets", { where: { entityId } });
const named = async (name: string) => (await assetsOf()).find((a) => a.name === name)!;
const reload = async (a: FixedAsset) => (await db.get("fixed_assets", a.id))!;
const sum = (j: JournalEntry, accountId: string, side: "debit" | "credit") => j.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l[side], 0);
const dr = (a: Account, amount: number, description?: string): JournalLine => ({ accountId: a.id, accountCode: a.code, debit: amount, credit: 0, description });
const cr = (a: Account, amount: number, description?: string): JournalLine => ({ accountId: a.id, accountCode: a.code, debit: 0, credit: amount, description });
const lastDay = (period: string) => { const [y, m] = period.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
let qbo = 0;
/** A journal as the QuickBooks import posts it: hand-written source, `sourceId` "qbo:…". */
const history = (date: string, memo: string, lines: JournalLine[]) => P.postJournal(ENTITY, { date, memo: `QBO Journal Entry ${++qbo} · ${memo}`, source: "manual", sourceId: `qbo:Journal Entry:${qbo}:${date}`, lines });
const row = async (accountId: string) => (await T.takeOnPreview(ENTITY)).ledgerVsRegister.find((r) => r.accountId === accountId)!;

before(async () => {
  ({ db } = await import("../lib/db"));
  B = await import("../lib/books");
  P = await import("../lib/posting");
  A = await import("../lib/asset-auto");
  T = await import("../lib/asset-takeon-services");
  S = await import("../lib/qbo-migration-services");
  const { buildAccounts } = await import("../lib/coa");
  await db.insert("entities", entity(ENTITY));
  accounts = buildAccounts(ENTITY, () => db.newId());
  await db.insertMany("accounts", accounts);
  bank = await B.createBankAccount(ENTITY, { name: "Demo Bank IDR", currency: "IDR", accountId: code("1-1100").id });
  // The company's own accounts as the importer numbers them: in sequence, so the code family says little.
  vehicle = await B.createAccount(ENTITY, { code: "1-2600", name: "Vehicle", type: "asset", subtype: "fixed_asset" });
  accumVehicle = await B.createAccount(ENTITY, { code: "1-2610", name: "Accumulated Depreciation - Vehicle", type: "asset", subtype: "accum_depr" });
  accumEquipment = await B.createAccount(ENTITY, { code: "1-2620", name: "Accumulated Depreciation - Kitchen Equipment", type: "asset", subtype: "accum_depr" });
  building = await B.createAccount(ENTITY, { code: "1-2630", name: "Villa under construction", type: "asset", subtype: "fixed_asset" });
  equipment = await B.createAccount(ENTITY, { code: "1-2640", name: "Kitchen Equipment", type: "asset", subtype: "fixed_asset" });
  deprVehicle = await B.createAccount(ENTITY, { code: "6-2120", name: "Depreciation Expense - Vehicle", type: "expense", subtype: "depreciation" });
  accounts = await B.entityAccounts(ENTITY);

  // The history: an opening entry dated the day the books were taken over, monthly depreciation (the vehicle through
  // September 2025, the equipment through June 2025) and a villa paid in six instalments less a refund.
  const equity = code("3-1000");
  opening = await history("2025-01-01", "Opening balances", [
    dr(vehicle, 300_000_000, "Demo pickup truck"), dr(equipment, 24_000_000, "Demo oven"), dr(equipment, 12_000_000, "Demo chiller"),
    cr(accumVehicle, 59_375_000), cr(accumEquipment, 9_000_000), cr(equity, 267_625_000),
  ]);
  for (const p of ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09"]) {
    await history(lastDay(p), `Depreciation ${p}`, [dr(deprVehicle, 3_125_000), cr(accumVehicle, 3_125_000)]);
    if (p <= "2025-06") await history(lastDay(p), `Depreciation ${p}`, [dr(code("6-2100"), 750_000), cr(accumEquipment, 750_000)]);
  }
  for (const p of ["2024-03", "2024-04", "2024-05", "2024-06", "2024-07", "2024-08"]) await history(`${p}-10`, `Contractor instalment ${p}`, [dr(building, 45_000_000), cr(code("1-1100"), 45_000_000)]);
  await history("2024-09-15", "Contractor refund", [dr(code("1-1100"), 30_000_000), cr(building, 30_000_000)]);
});
after(() => rmSync(DIR, { recursive: true, force: true }));

test("after a migration the ledger carries fixed assets the register does not know", async () => {
  assert.deepEqual(await assetsOf(), [], "QuickBooks history never registers assets by itself");
  const plan = await T.takeOnPreview(ENTITY);
  assert.deepEqual(plan.offers.map((o) => [o.code, o.unregistered, o.lines.length, o.defaultMode]), [["1-2600", 300_000_000, 1, "line"], ["1-2630", 240_000_000, 6, "account"], ["1-2640", 36_000_000, 2, "line"]]);
  assert.equal(plan.unregisteredTotal, 576_000_000);
  assert.deepEqual(plan.ledgerVsRegister.filter((r) => r.kind === "accumulated").map((r) => [r.code, r.ledger, r.register]), [["1-2610", 87_500_000, 0], ["1-2620", 13_500_000, 0]]);
});

test("bringing in creates the assets once, flagged for review, with what the previous books had depreciated; an account can be left out", async () => {
  const outcome = await T.takeOnAssets(ENTITY, { [building.id]: "skip" }, "user-1");
  assert.deepEqual([outcome.created.length, outcome.problems, outcome.leftOut], [3, [], [building.id]]);
  assert.deepEqual((await db.get("entities", ENTITY))!.assetAccountsOutsideRegister, [building.id]);
  const truck = await named("Demo pickup truck"), oven = await named("Demo oven"), chiller = await named("Demo chiller");
  assert.deepEqual([truck.cost, truck.acquisitionDate, truck.needsReview, truck.status, truck.accumulatedDepreciation, truck.depreciatedThrough], [300_000_000, "2025-01-01", true, "active", 87_500_000, "2025-09"]);
  assert.deepEqual([truck.takeOn?.accumulated, truck.takeOn?.through, truck.takeOn?.mode, truck.takeOn?.byUserId, Boolean(truck.takeOn?.at)], [87_500_000, "2025-09", "line", "user-1", true]);
  assert.deepEqual([truck.assetAccountId, truck.accumDeprAccountId, truck.deprExpenseAccountId, truck.sourceJournalId, truck.sourceLineIndex], [vehicle.id, accumVehicle.id, deprVehicle.id, opening.id, 0]);
  assert.deepEqual([truck.fiscalGroup, truck.method, truck.usefulLifeMonths], ["group2", "straight_line", 96]);
  assert.deepEqual([[oven.cost, oven.accumulatedDepreciation, oven.depreciatedThrough], [chiller.cost, chiller.accumulatedDepreciation, chiller.depreciatedThrough]], [[24_000_000, 9_000_000, "2025-06"], [12_000_000, 4_500_000, "2025-06"]], "the equipment account's accumulated depreciation, pro rata to cost");
  assert.equal(oven.accumDeprAccountId, accumEquipment.id);

  // Again, with or without choices: nothing more to bring in, nothing created twice.
  assert.deepEqual((await T.takeOnAssets(ENTITY)).created, []);
  assert.deepEqual((await T.takeOnAssets(ENTITY, { [vehicle.id]: "account", [equipment.id]: "account" })).created, []);
  assert.equal((await assetsOf()).length, 3);
  const plan = await T.takeOnPreview(ENTITY);
  assert.deepEqual([plan.offers, plan.unregisteredTotal, plan.leftOut.map((l) => [l.code, l.ledgerCost])], [[], 0, [["1-2630", 240_000_000]]], "the account left out is neither offered nor counted");
  assert.deepEqual(plan.ledgerVsRegister.filter((r) => !r.outside).map((r) => r.difference), [0, 0, 0, 0], "cost and accumulated depreciation agree with the ledger");
});

test("until it is confirmed a take-on asset is neither depreciated nor disposable, and what came from the ledger can be corrected", async () => {
  const truck = await named("Demo pickup truck"), chiller = await named("Demo chiller");
  assert.equal((await B.runDepreciation(ENTITY, "2025-12")).journal, undefined);
  await assert.rejects(B.disposeAsset(ENTITY, truck.id, { date: "2025-12-01" }), /Confirm this asset first/);
  // The review refuses what cannot be: more depreciation than there is to depreciate, a month before the purchase, an amount without its month.
  await assert.rejects(B.updateAsset(ENTITY, truck.id, { takeOnAccumulated: 300_000_001 }), /must be between zero and the cost less the salvage value/);
  await assert.rejects(B.updateAsset(ENTITY, truck.id, { salvageValue: 250_000_000 }), /must be between zero and the cost less the salvage value/);
  await assert.rejects(B.updateAsset(ENTITY, truck.id, { acquisitionDate: "2025-11-03" }), /cannot be before the acquisition month/);
  await assert.rejects(B.updateAsset(ENTITY, truck.id, { takeOnThrough: "2024-12" }), /cannot be before the acquisition month/);
  await assert.rejects(B.updateAsset(ENTITY, truck.id, { takeOnThrough: null, takeOnAccumulated: 87_500_000 }), /Enter the month the asset was depreciated through/);
  assert.deepEqual([(await reload(truck)).accumulatedDepreciation, (await reload(truck)).needsReview], [87_500_000, true], "a refused correction changes nothing");
  // Cost, date and the depreciation taken over are corrected without confirming, and corrected back.
  const corrected = await B.updateAsset(ENTITY, chiller.id, { cost: 12_500_000, acquisitionDate: "2024-01-05", takeOnAccumulated: 4_000_000, takeOnThrough: "2025-05" });
  assert.deepEqual([corrected.cost, corrected.acquisitionDate, corrected.accumulatedDepreciation, corrected.depreciatedThrough, corrected.takeOn?.accumulated, corrected.takeOn?.through, corrected.needsReview], [12_500_000, "2024-01-05", 4_000_000, "2025-05", 4_000_000, "2025-05", true]);
  assert.equal((await row(equipment.id)).difference, -500_000, "the register now says more than the ledger: the check shows it");
  const never = await B.updateAsset(ENTITY, chiller.id, { takeOnThrough: null });
  assert.deepEqual([never.accumulatedDepreciation, never.depreciatedThrough, never.takeOn?.accumulated, never.takeOn?.through], [0, undefined, 0, undefined], "never depreciated: nothing taken over");
  const back = await B.updateAsset(ENTITY, chiller.id, { cost: 12_000_000, takeOnAccumulated: 4_500_000, takeOnThrough: "2025-06" });
  assert.deepEqual([back.cost, back.accumulatedDepreciation, back.depreciatedThrough], [12_000_000, 4_500_000, "2025-06"]);
  // A purchase registered the ordinary way still keeps its cost and date.
  const bill = await B.postBill(ENTITY, (await B.createBill(ENTITY, { vendor: { type: "other", name: "Toko Demo" }, date: "2025-11-12", currency: "IDR", fxRate: 1, lines: [{ description: "Demo blender", amount: 4_800_000, accountId: code("1-2300").id, taxCode: "none", withholding: "none" }] })).id);
  const blender = (await assetsOf()).find((a) => a.billId === bill.id)!;
  await assert.rejects(B.updateAsset(ENTITY, blender.id, { cost: 5_000_000 }), /come from the purchase/);
  await B.voidBill(ENTITY, bill.id);
  assert.equal((await assetsOf()).length, 3);
});

test("once confirmed, the run posts only the months after the previous books, and the figures taken over are locked", async () => {
  const truck = await named("Demo pickup truck");
  // The real purchase date: June 2023, so 28 of the 96 months are behind and 3,125,000 a month goes on.
  const confirmed = await B.updateAsset(ENTITY, truck.id, { acquisitionDate: "2023-06-10", confirm: true });
  assert.deepEqual([confirmed.needsReview, confirmed.status, confirmed.acquisitionDate, confirmed.accumulatedDepreciation, confirmed.depreciatedThrough], [false, "active", "2023-06-10", 87_500_000, "2025-09"]);
  await assert.rejects(B.updateAsset(ENTITY, truck.id, { cost: 310_000_000 }), /confirmed: its cost, acquisition date and the depreciation taken over/);
  await assert.rejects(B.updateAsset(ENTITY, truck.id, { takeOnAccumulated: 0 }), /confirmed/);
  await assert.rejects(B.updateAsset(ENTITY, truck.id, { takeOnThrough: null }), /confirmed/);
  assert.equal((await B.updateAsset(ENTITY, truck.id, { usefulLifeMonths: 96, notes: "Plate DK 0000 XX" })).notes, "Plate DK 0000 XX", "the rest stays open until the register posts");

  assert.equal((await B.runDepreciation(ENTITY, "2025-09")).journal, undefined, "the previous books already posted September");
  const run = await B.runDepreciation(ENTITY, "2025-11");
  assert.deepEqual(run.runs.map((r) => [r.asset.id, r.amount, r.periods]), [[truck.id, 6_250_000, ["2025-10", "2025-11"]]], "October and November only; the assets still in review are left out");
  assert.equal(run.journal!.date, "2025-11-30");
  assert.deepEqual([sum(run.journal!, deprVehicle.id, "debit"), sum(run.journal!, accumVehicle.id, "credit")], [6_250_000, 6_250_000], "on the accounts the history used");
  const after = await reload(truck);
  assert.deepEqual([after.accumulatedDepreciation, after.depreciatedThrough, after.status, after.takeOn?.accumulated], [93_750_000, "2025-11", "active", 87_500_000]);
  assert.equal((await B.runDepreciation(ENTITY, "2025-11")).journal, undefined, "nothing is posted twice");
  // Ledger and register still agree, to the rupiah, after the register's own posting.
  assert.deepEqual([(await row(accumVehicle.id)).ledger, (await row(accumVehicle.id)).register, (await row(accumVehicle.id)).difference], [93_750_000, 93_750_000, 0]);
  await assert.rejects(B.updateAsset(ENTITY, truck.id, { usefulLifeMonths: 120 }), /can no longer change/);
  await assert.rejects(B.deleteAsset(ENTITY, truck.id), /already posted/);
});

test("selling a take-on asset: the catch-up starts after the previous books and the net book value counts what they had depreciated", async () => {
  const oven = await named("Demo oven");
  // Bought January 2024: 500,000 a month, 18 months (9,000,000) in the previous books through June 2025.
  await B.updateAsset(ENTITY, oven.id, { acquisitionDate: "2024-01-05", confirm: true });
  const disposal = await B.disposeAsset(ENTITY, oven.id, { date: "2025-09-15", proceeds: 12_000_000, bankAccountId: bank.id });
  const [catchUp] = await db.list("journal_entries", { where: { entityId: ENTITY, sourceId: `${oven.id}:catchup` } });
  assert.deepEqual([catchUp.date, sum(catchUp, code("6-2100").id, "debit"), sum(catchUp, accumEquipment.id, "credit")], ["2025-08-31", 1_000_000, 1_000_000], "July and August, not the eighteen months before");
  const loss = (await B.entityAccounts(ENTITY)).find((a) => a.code === "8-1210")!;
  assert.deepEqual([sum(disposal, accumEquipment.id, "debit"), sum(disposal, code("1-1100").id, "debit"), sum(disposal, loss.id, "debit"), sum(disposal, equipment.id, "credit")], [10_000_000, 12_000_000, 2_000_000, 24_000_000]);
  const sold = await reload(oven);
  assert.deepEqual([sold.status, sold.accumulatedDepreciation, sold.depreciatedThrough, sold.disposalGainLoss], ["disposed", 10_000_000, "2025-08", -2_000_000], "net book value 14,000,000 against 12,000,000 received");
  // The chiller alone is left on the account, in the ledger as in the register; nothing is offered again.
  assert.deepEqual([(await row(equipment.id)).ledger, (await row(equipment.id)).register, (await row(accumEquipment.id)).ledger, (await row(accumEquipment.id)).register], [12_000_000, 12_000_000, 4_500_000, 4_500_000]);
  assert.deepEqual((await T.takeOnPreview(ENTITY)).offers, []);
});

test("an account brought back is offered again; confirmed as never depreciated, the automatic run starts it without holding it", async () => {
  await T.setAssetAccountOutside(ENTITY, building.id, false);
  assert.deepEqual((await db.get("entities", ENTITY))!.assetAccountsOutsideRegister, []);
  const plan = await T.takeOnPreview(ENTITY);
  assert.deepEqual(plan.offers.map((o) => [o.code, o.unregistered, o.lineAllowed, o.accountOnly]), [["1-2630", 240_000_000, false, "6 purchase lines"]]);
  // One asset per line is not possible there: reported, nothing created.
  const refused = await T.takeOnAssets(ENTITY, { [building.id]: "line" });
  assert.deepEqual([refused.created, refused.problems.map((p) => p.account)], [[], ["1-2630 Villa under construction"]]);
  const { created: [villa] } = await T.takeOnAssets(ENTITY);
  assert.deepEqual([villa.name, villa.cost, villa.acquisitionDate, villa.sourceJournalId, villa.fiscalGroup, villa.usefulLifeMonths], ["Villa under construction", 240_000_000, "2024-03-10", undefined, "building_permanent", 240]);
  assert.deepEqual([villa.takeOn?.mode, villa.takeOn?.accumulated, villa.takeOn?.through, villa.accumulatedDepreciation, villa.depreciatedThrough, villa.needsReview], ["account", 0, undefined, 0, undefined, true]);
  assert.equal(villa.accumDeprAccountId, "", "no accumulated account is named after it, and the two next to it in the code family belong to the vehicle and the equipment");
  await assert.rejects(B.updateAsset(ENTITY, villa.id, { confirm: true }), /Choose the accumulated depreciation account/);
  // Put in use in October 2025 and confirmed as never depreciated: 1,000,000 a month from October.
  await B.updateAsset(ENTITY, villa.id, { name: "Demo villa", acquisitionDate: "2025-10-01", takeOnThrough: null, accumDeprAccountId: code("1-2110").id, confirm: true });
  // A printer registered by hand years back, never depreciated: that one the automatic run must not start by itself.
  const printer = await B.createAsset(ENTITY, { name: "Demo printer (by hand)", assetAccountId: code("1-2300").id, accumDeprAccountId: code("1-2310").id, deprExpenseAccountId: code("6-2100").id, acquisitionDate: "2024-02-01", cost: 9_600_000, fiscalGroup: "group1" });

  const auto = await A.runAutoDepreciation("2025-12-01");
  assert.deepEqual([auto.period, auto.posted.map((p) => [p.entityId, p.amount])], ["2025-11", [[ENTITY, 2_000_000]]], "October and November of the villa; the truck is already posted through November");
  assert.equal(auto.skipped.length, 1);
  assert.match(auto.skipped[0].reason, /1 asset registered by hand and never depreciated \(Demo printer \(by hand\)\)/);
  assert.deepEqual([(await reload(villa)).accumulatedDepreciation, (await reload(villa)).depreciatedThrough, (await reload(printer)).accumulatedDepreciation], [2_000_000, "2025-11", 0]);
  const january = await A.runAutoDepreciation("2026-01-02");
  assert.deepEqual(january.posted.map((p) => p.amount), [4_125_000], "December: 3,125,000 for the truck and 1,000,000 for the villa");
  // An asset removed from the register while nothing was posted on it from here is simply offered again.
  const chiller = await named("Demo chiller");
  await B.deleteAsset(ENTITY, chiller.id);
  assert.deepEqual((await T.takeOnPreview(ENTITY)).offers.map((o) => [o.code, o.unregistered, o.defaultMode]), [["1-2640", 12_000_000, "account"]], "the account now has a credit (the oven's disposal): one asset for what is left");
});

// ---------- The QuickBooks migration fills the register ----------

const FOOTER = ["Friday, Nov 20, 2026 09:00:00 AM GMT+8 - Accrual Basis"];
const COMPANY = "Demo Hospitality Co";
const MIGRATED = entity("ent-migrated", { name: COMPANY, legalName: "PT Demo Hospitality Co" });
const xlsx = (grid: string[][]): Buffer => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
};
const ACCOUNT_LIST = [
  ["Account List"], [COMPANY], [],
  ["Account", "Type", "Detail type", "Description", "Balance"],
  ["Bank Demo IDR", "Bank", "Checking", "", ""],
  ["Demo Vehicle", "Fixed Assets", "Vehicles", "", ""],
  ["Accumulated Depreciation - Demo Vehicle", "Fixed Assets", "Accumulated Depreciation", "", ""],
  ["Opening Balance Equity", "Equity", "Opening Balance Equity", "", ""],
  ["Depreciation Expense - Demo Vehicle", "Expenses", "Depreciation", "", ""],
  [], FOOTER,
];
const JH = ["", "Date", "Transaction Type", "Num", "Name", "Memo/Description", "Account", "Debit", "Credit"];
const txn = (date: string, num: string, memo: string, lines: Array<[account: string, debit: string, credit: string]>): string[][] => {
  const total = lines.reduce((s, l) => s + Number(l[1].replace(/,/g, "") || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
  return [...lines.map((l, i) => (i === 0 ? ["", date, "Journal Entry", num, "", memo, l[0], l[1], l[2]] : ["", "", "", "", "", memo, l[0], l[1], l[2]])), ["", "", "", "", "", "", "", total, total]];
};
const JOURNAL = [
  [COMPANY], ["Journal"], ["January - March 2025"], [], JH,
  ...txn("01/01/2025", "1", "Opening balance", [["Demo Vehicle", "300,000,000.00", ""], ["Bank Demo IDR", "50,000,000.00", ""], ["Accumulated Depreciation - Demo Vehicle", "", "59,375,000.00"], ["Opening Balance Equity", "", "290,625,000.00"]]),
  ...["31/01/2025", "28/02/2025", "31/03/2025"].flatMap((d, i) => txn(d, String(i + 2), "Monthly depreciation", [["Depreciation Expense - Demo Vehicle", "3,125,000.00", ""], ["Accumulated Depreciation - Demo Vehicle", "", "3,125,000.00"]])),
  ["", "TOTAL", "", "", "", "", "", "1.00", "1.00"], [], FOOTER,
];

test("a QuickBooks migration brings its fixed assets into the register by itself, once", async () => {
  const { buildAccounts } = await import("../lib/coa");
  await db.insert("entities", MIGRATED);
  await db.insertMany("accounts", buildAccounts(MIGRATED.id, () => db.newId()));
  const user = { id: "user-1", name: "Tester" };
  const target = `entity:${MIGRATED.id}`;
  const upload = async () => { for (const [name, grid] of [["Account List.xlsx", ACCOUNT_LIST], ["Journal.xlsx", JOURNAL]] as const) await S.addWizardFile(user.id, target, name, xlsx(grid), [MIGRATED.name, MIGRATED.legalName]); };

  await upload();
  const result = await S.runMigration(user, target, MIGRATED);
  assert.equal(result.failed, false);
  assert.deepEqual(result.steps.map((s) => [s.key, s.errorCount]), [["accounts", 0], ["journal", 0]]);
  assert.deepEqual(result.takeOn, { created: 1, problems: [] });
  const [asset] = await assetsOf(MIGRATED.id);
  const chart = await B.entityAccounts(MIGRATED.id);
  const name = (id: string) => chart.find((a) => a.id === id)?.name;
  assert.deepEqual([asset.name, asset.cost, asset.acquisitionDate, asset.needsReview, asset.takeOn?.mode, asset.takeOn?.byUserId], ["Demo Vehicle", 300_000_000, "2025-01-01", true, "line", "user-1"], "every line of the opening entry says “Opening balance”: the asset takes its account's name");
  assert.deepEqual([asset.accumulatedDepreciation, asset.depreciatedThrough], [68_750_000, "2025-03"], "the opening figure and the three months posted in QuickBooks");
  assert.deepEqual([name(asset.assetAccountId), name(asset.accumDeprAccountId), name(asset.deprExpenseAccountId)], ["Demo Vehicle", "Accumulated Depreciation - Demo Vehicle", "Depreciation Expense - Demo Vehicle"]);
  assert.equal((await B.runDepreciation(MIGRATED.id, "2025-06")).journal, undefined, "waiting for review: nothing is posted yet");

  // The same files again: the ledger is recognised and the register left as it is.
  await upload();
  const again = await S.runMigration(user, target, MIGRATED);
  assert.deepEqual([again.steps.map((s) => s.inserted), again.takeOn], [[0, 0], { created: 0, problems: [] }]);
  assert.equal((await assetsOf(MIGRATED.id)).length, 1);

  // Confirmed with its real purchase date (June 2023, 96 months): the register carries on at 3,125,000 a month from April.
  await B.updateAsset(MIGRATED.id, asset.id, { acquisitionDate: "2023-06-10", name: "Demo pickup truck", confirm: true });
  const run = await B.runDepreciation(MIGRATED.id, "2025-05");
  assert.deepEqual(run.runs.map((r) => [r.amount, r.periods]), [[6_250_000, ["2025-04", "2025-05"]]]);
});
