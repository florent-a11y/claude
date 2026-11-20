import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccounts } from "../lib/coa";
import { findByCode } from "../lib/balances";
import { depreciationDue, depreciationSchedule, disposalPreview } from "../lib/ledger";
import { roundMoney } from "../lib/money";
import { heldForFirstRun, isUntouched } from "../lib/asset-auto";
import { depreciationStarted } from "../lib/books";
import { distinctiveWords, nameMatch, pairAccumulatedAccounts, pairedExpenseAccount, shareProRata, takeOnNote, takeOnPlan, type TakeOnDraft, type TakeOnInput } from "../lib/asset-takeon";
import type { Account, FixedAsset, JournalEntry, JournalLine, JournalSource } from "../lib/types";

/**
 * Take-on of the fixed assets a migrated ledger carries (lib/asset-takeon.ts) and the schedule that continues from
 * what the previous books had depreciated (lib/ledger.ts). Invented data only: "PT Contoh" style names and round
 * figures, laid out the way a QuickBooks history arrives (one big opening entry, monthly depreciation journals).
 */

let seq = 0;
const newId = () => `id-${++seq}`;
const ENTITY = "ent-takeon";
const template: Account[] = buildAccounts(ENTITY, newId);
const acct = (code: string, name: string, subtype: Account["subtype"], over: Partial<Account> = {}): Account => ({
  id: `acc-${code}`, entityId: ENTITY, code, name, type: subtype === "depreciation" ? "expense" : "asset", subtype, normalBalance: subtype === "depreciation" ? "debit" : subtype === "accum_depr" ? "credit" : "debit", isSystem: false, active: true, ...over,
});

// A chart as the QuickBooks importer leaves it: the template plus the company's own accounts, numbered in sequence.
const vehicle = acct("1-2600", "Vehicle", "fixed_asset");
const accumVehicle = acct("1-2610", "Accumulated Depreciation - Vehicle", "accum_depr");
const accumEquipment = acct("1-2620", "Accumulated Depreciation - Kitchen Equipment", "accum_depr");
const building = acct("1-2630", "Building under construction", "fixed_asset");
const equipment = acct("1-2640", "Kitchen Equipment", "fixed_asset");
const lease = acct("1-2700", "Demo lease premium", "other_asset");
const deprVehicle = acct("6-2120", "Depreciation Expense - Vehicle", "depreciation");
const chart: Account[] = [...template, vehicle, accumVehicle, accumEquipment, building, equipment, lease, deprVehicle];
const code = (c: string) => findByCode(chart, c)!;
const equity = code("3-1000");
const bank = code("1-1100");

const dr = (a: Account, amount: number, description?: string): JournalLine => ({ accountId: a.id, accountCode: a.code, debit: amount, credit: 0, description });
const cr = (a: Account, amount: number, description?: string): JournalLine => ({ accountId: a.id, accountCode: a.code, debit: 0, credit: amount, description });
let je = 0;
function journal(date: string, memo: string, lines: JournalLine[], over: Partial<JournalEntry> = {}): JournalEntry {
  je++;
  return { id: `je-${je}`, entityId: ENTITY, number: `JE-${date.slice(0, 4)}-${String(je).padStart(4, "0")}`, date, period: date.slice(0, 7), memo, source: "manual" as JournalSource, sourceId: `qbo:Journal Entry:${je}:${date}`, lines, status: "posted", createdAt: `${date}T00:00:00.000Z`, ...over };
}
const months = (from: string, count: number): string[] => { const out: string[] = []; let [y, m] = from.split("-").map(Number); for (let i = 0; i < count; i++) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } } return out; };
const lastDay = (period: string) => { const [y, m] = period.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

// Shape 1. A vehicle and two pieces of equipment in the opening entry dated the migration start (not their purchase
// dates), their accumulated depreciation to that day, then monthly depreciation posted in QuickBooks: the vehicle
// through September 2025, the equipment through June 2025.
const opening = journal("2025-01-01", "Opening balances", [
  dr(vehicle, 300_000_000, "Demo pickup truck"), dr(equipment, 24_000_000, "Demo oven"), dr(equipment, 12_000_000, "Demo chiller"), dr(lease, 120_000_000, "Demo lease premium"),
  cr(accumVehicle, 59_375_000), cr(accumEquipment, 9_000_000), cr(equity, 387_625_000),
]);
const vehicleDepreciation = months("2025-01", 9).map((p) => journal(lastDay(p), `Depreciation ${p}`, [dr(deprVehicle, 3_125_000), cr(accumVehicle, 3_125_000)]));
const equipmentDepreciation = months("2025-01", 6).map((p) => journal(lastDay(p), `Depreciation ${p}`, [dr(code("6-2100"), 750_000), cr(accumEquipment, 750_000)]));
// Shape 2. A building capitalised payment by payment: fifty debit lines over two years and one credit (a refund).
const instalments = months("2024-01", 25).flatMap((p, i) => [journal(`${p}-10`, `Contractor progress payment ${2 * i + 1}`, [dr(building, 40_000_000), cr(bank, 40_000_000)]), journal(`${p}-25`, `Contractor progress payment ${2 * i + 2}`, [dr(building, 20_000_000), cr(bank, 20_000_000)])]);
const refund = journal("2025-06-30", "Contractor refund", [dr(bank, 15_000_000), cr(building, 15_000_000)]);
// Shape 3. An asset amortised by the direct method: the asset account itself is credited, there is no accumulated account.
const amortisation = months("2025-01", 9).map((p) => journal(lastDay(p), `Amortisation ${p}`, [dr(code("6-2110"), 1_000_000), cr(lease, 1_000_000)]));
const ledger: JournalEntry[] = [opening, ...vehicleDepreciation, ...equipmentDepreciation, ...instalments, refund, ...amortisation];

const input = (over: Partial<TakeOnInput> = {}): TakeOnInput => ({ accounts: chart, entries: ledger, assets: [], ...over });
/** The register once the drafts are in it, as `createAsset` stores them. */
const registered = (drafts: TakeOnDraft[]): FixedAsset[] => drafts.map((d, i) => ({
  id: `fa-${i}`, entityId: ENTITY, name: d.name, assetAccountId: d.assetAccountId, accumDeprAccountId: d.accumDeprAccountId, deprExpenseAccountId: d.deprExpenseAccountId, acquisitionDate: d.acquisitionDate, cost: d.cost, salvageValue: 0,
  fiscalGroup: d.fiscalGroup, method: d.method, usefulLifeMonths: d.usefulLifeMonths, accumulatedDepreciation: d.takeOn.accumulated, depreciatedThrough: d.takeOn.through, status: "active", needsReview: true,
  sourceJournalId: d.sourceJournalId, sourceLineIndex: d.sourceLineIndex, takeOn: { ...d.takeOn, at: "2026-11-20T00:00:00.000Z" }, createdAt: "2026-11-20T00:00:00.000Z",
}));
const asset = (over: Partial<FixedAsset> = {}): FixedAsset => ({
  id: "fa-x", entityId: ENTITY, name: "Demo pickup truck", assetAccountId: vehicle.id, accumDeprAccountId: accumVehicle.id, deprExpenseAccountId: deprVehicle.id, acquisitionDate: "2023-06-10", cost: 300_000_000, salvageValue: 0,
  fiscalGroup: "group2", method: "straight_line", usefulLifeMonths: 96, accumulatedDepreciation: 0, status: "active", createdAt: "2026-11-20T00:00:00.000Z", ...over,
});
const sum = (xs: number[]) => roundMoney(xs.reduce((s, x) => s + x, 0));

// ---------- The three ledger shapes ----------

test("a migrated ledger: the vehicle and the equipment come in line by line with their accumulated depreciation, the building as one asset", () => {
  const plan = takeOnPlan(input());
  assert.deepEqual(plan.offers.map((o) => [o.code, o.ledgerCost, o.registeredCost, o.unregistered, o.lines.length, o.credits, o.defaultMode]), [
    ["1-2600", 300_000_000, 0, 300_000_000, 1, 0, "line"],
    ["1-2630", 1_485_000_000, 0, 1_485_000_000, 50, 15_000_000, "account"],
    ["1-2640", 36_000_000, 0, 36_000_000, 2, 0, "line"],
  ]);
  assert.equal(plan.unregisteredTotal, 1_821_000_000);
  assert.deepEqual(plan.offers.map((o) => [o.lineAllowed, o.accountOnly]), [[true, undefined], [false, "50 purchase lines"], [true, undefined]]);
  assert.deepEqual(plan.problems, []);

  const [truck, site, oven, chiller] = plan.drafts;
  assert.equal(plan.drafts.length, 4);
  // The vehicle: one purchase line, the accumulated account named after it, everything QuickBooks had posted on it.
  assert.deepEqual([truck.name, truck.cost, truck.acquisitionDate, truck.assetAccountId, truck.accumDeprAccountId, truck.deprExpenseAccountId], ["Demo pickup truck", 300_000_000, "2025-01-01", vehicle.id, accumVehicle.id, deprVehicle.id]);
  assert.deepEqual([truck.fiscalGroup, truck.method, truck.usefulLifeMonths], ["group2", "straight_line", 96]);
  assert.deepEqual(truck.takeOn, { accumulated: 87_500_000, through: "2025-09", mode: "line" }, "59,375,000 in the opening entry + nine months of 3,125,000");
  assert.deepEqual([truck.sourceJournalId, truck.sourceLineIndex], [opening.id, 0]);
  // The equipment: two lines of one account share its accumulated depreciation pro rata to cost.
  assert.deepEqual([oven.name, oven.cost, oven.takeOn], ["Demo oven", 24_000_000, { accumulated: 9_000_000, through: "2025-06", mode: "line" }]);
  assert.deepEqual([chiller.name, chiller.cost, chiller.takeOn], ["Demo chiller", 12_000_000, { accumulated: 4_500_000, through: "2025-06", mode: "line" }]);
  assert.deepEqual([oven.sourceLineIndex, chiller.sourceLineIndex, oven.fiscalGroup, oven.accumDeprAccountId], [1, 2, "group1", accumEquipment.id]);
  // The building: fifty lines and a credit are one asset for the account, dated its first payment, never depreciated.
  assert.deepEqual([site.name, site.cost, site.acquisitionDate, site.fiscalGroup, site.usefulLifeMonths], ["Building under construction", 1_485_000_000, "2024-01-10", "building_permanent", 240]);
  assert.deepEqual(site.takeOn, { accumulated: 0, mode: "account" });
  assert.equal(site.accumDeprAccountId, code("1-2110").id, "named after buildings: the template's account, never the vehicle's or the equipment's next to it in the code family");
  assert.deepEqual([site.sourceJournalId, site.sourceLineIndex], [undefined, undefined]);
  // What the page shows per account.
  assert.deepEqual(plan.offers.map((o) => [o.accumAccountId, o.pairedBy, o.accumulated, o.through]), [[accumVehicle.id, "name", 87_500_000, "2025-09"], [code("1-2110").id, "name", 0, undefined], [accumEquipment.id, "name", 13_500_000, "2025-06"]]);
});

test("the direct-method asset (credited on its own account, subtype other_asset) is left alone and breaks nothing", () => {
  const plan = takeOnPlan(input());
  assert.equal(plan.offers.some((o) => o.accountId === lease.id), false);
  assert.equal(plan.drafts.some((d) => d.assetAccountId === lease.id), false);
  assert.equal(plan.ledgerVsRegister.some((r) => r.accountId === lease.id), false);
  // A fixed-asset account amortised the same way is offered for what is left on it, as one asset, with no accumulated account.
  const direct = acct("1-2800", "Demo software licence", "fixed_asset");
  const entries = [journal("2025-01-01", "Licence", [dr(direct, 60_000_000), cr(bank, 60_000_000)]), ...months("2025-01", 6).map((p) => journal(lastDay(p), `Amortisation ${p}`, [dr(code("6-2110"), 1_000_000), cr(direct, 1_000_000)]))];
  const own = takeOnPlan({ accounts: [...template, direct], entries, assets: [] });
  assert.deepEqual(own.offers.map((o) => [o.code, o.unregistered, o.defaultMode, o.accountOnly, o.accumAccountId]), [["1-2800", 54_000_000, "account", "the account also has credit lines", ""]]);
  assert.deepEqual(own.drafts.map((d) => [d.cost, d.takeOn]), [[54_000_000, { accumulated: 0, mode: "account" }]]);
});

test("ledger and register: every account with a balance, differences before the take-on and none after", () => {
  const before = takeOnPlan(input());
  assert.deepEqual(before.ledgerVsRegister.map((r) => [r.kind, r.code, r.ledger, r.register, r.difference]), [
    ["cost", "1-2600", 300_000_000, 0, 300_000_000], ["cost", "1-2630", 1_485_000_000, 0, 1_485_000_000], ["cost", "1-2640", 36_000_000, 0, 36_000_000],
    ["accumulated", "1-2610", 87_500_000, 0, 87_500_000], ["accumulated", "1-2620", 13_500_000, 0, 13_500_000],
  ]);
  assert.deepEqual(before.accumulated.filter((a) => a.ledgerAccumulated).map((a) => [a.code, a.through]), [["1-2610", "2025-09"], ["1-2620", "2025-06"]]);
  // Computed again with the drafts in the register: nothing more to offer, nothing differs.
  const after = takeOnPlan(input({ assets: registered(before.drafts) }));
  assert.deepEqual([after.offers, after.drafts, after.problems, after.unregisteredTotal], [[], [], [], 0]);
  assert.deepEqual(after.ledgerVsRegister.map((r) => [r.code, r.difference]), [["1-2600", 0], ["1-2630", 0], ["1-2640", 0], ["1-2610", 0], ["1-2620", 0]]);
});

// ---------- Modes ----------

test("default mode: one asset per line up to five lines without credits that add up, else one asset for the account", () => {
  const eq = code("1-2300");
  const buy = (n: number) => Array.from({ length: n }, (_, i) => journal(`2025-02-${String(i + 1).padStart(2, "0")}`, `Demo desk ${i + 1}`, [dr(eq, 1_000_000 + i), cr(bank, 1_000_000 + i)]));
  const plan = (entries: JournalEntry[], assets: FixedAsset[] = []) => takeOnPlan({ accounts: template, entries, assets });
  const five = plan(buy(5));
  assert.deepEqual([five.offers[0].defaultMode, five.drafts.length, five.drafts.map((d) => d.name)], ["line", 5, ["Demo desk 1", "Demo desk 2", "Demo desk 3", "Demo desk 4", "Demo desk 5"]]);
  assert.equal(five.drafts[0].name, "Demo desk 1", "a line without description takes the journal memo");
  const six = plan(buy(6));
  assert.deepEqual([six.offers[0].defaultMode, six.offers[0].lineAllowed, six.offers[0].accountOnly, six.drafts.length], ["account", false, "6 purchase lines", 1]);
  assert.deepEqual([six.drafts[0].name, six.drafts[0].cost, six.drafts[0].acquisitionDate, six.drafts[0].takeOn.mode], ["Equipment and furniture", 6_000_015, "2025-02-01", "account"]);
  // A credit on the account (a sale, a correction): the lines no longer say what is still there.
  const sold = plan([...buy(2), journal("2025-03-01", "Desk sold", [dr(bank, 400_000), cr(eq, 400_000)])]);
  assert.deepEqual([sold.offers[0].defaultMode, sold.offers[0].accountOnly, sold.drafts[0].cost], ["account", "the account also has credit lines", 1_600_001]);
  // An asset registered by hand on the account (no link to a line): the lines do not add up to what is missing.
  const byHand = asset({ id: "fa-hand", assetAccountId: eq.id, accumDeprAccountId: code("1-2310").id, cost: 1_000_000 });
  const partly = plan(buy(3), [byHand]);
  assert.deepEqual([partly.offers[0].unregistered, partly.offers[0].defaultMode, partly.offers[0].accountOnly], [2_000_003, "account", "the purchase lines do not add up to the amount missing from the register"]);
  // An asset registered from one of the lines: only the others are offered, line by line.
  const entries = buy(3);
  const linked = asset({ id: "fa-linked", assetAccountId: eq.id, accumDeprAccountId: code("1-2310").id, cost: 1_000_001, sourceJournalId: entries[1].id, sourceLineIndex: 0 });
  const rest = plan(entries, [linked]);
  assert.deepEqual([rest.offers[0].unregistered, rest.offers[0].defaultMode, rest.drafts.map((d) => d.name)], [2_000_002, "line", ["Demo desk 1", "Demo desk 3"]]);
  // A disposed asset is out of the register and, through its disposal entry, out of the ledger.
  const disposal = journal("2025-04-01", "Disposal of Demo desk 2", [dr(bank, 1_000_001), cr(eq, 1_000_001)], { source: "adjustment", sourceId: "fa-linked" });
  const gone = plan([...entries, disposal], [{ ...linked, status: "disposed", disposalJournalId: disposal.id }]);
  assert.deepEqual([gone.offers[0].ledgerCost, gone.offers[0].registeredCost, gone.offers[0].unregistered, gone.offers[0].lines.length], [2_000_002, 0, 2_000_002, 2]);
  // Void and draft entries are not the ledger.
  assert.deepEqual(plan(buy(2).map((e, i) => ({ ...e, status: i ? "void" as const : "draft" as const }))).offers, []);
});

test("choices: a mode per account, one asset per line only where it is possible, and accounts left out", () => {
  const all = takeOnPlan(input());
  // The vehicle as one asset for the account: the same cost, dated its first line, named after the account.
  const asAccount = takeOnPlan(input(), { [vehicle.id]: "account" });
  const truck = asAccount.drafts.find((d) => d.assetAccountId === vehicle.id)!;
  assert.deepEqual([truck.name, truck.cost, truck.acquisitionDate, truck.takeOn, truck.sourceJournalId], ["Vehicle", 300_000_000, "2025-01-01", { accumulated: 87_500_000, through: "2025-09", mode: "account" }, undefined]);
  // Fifty lines cannot become fifty assets: reported, nothing created for that account, the others unaffected.
  const forced = takeOnPlan(input(), { [building.id]: "line" });
  assert.equal(forced.drafts.some((d) => d.assetAccountId === building.id), false);
  assert.deepEqual(forced.problems.map((p) => p.accountId), [building.id]);
  assert.match(forced.problems[0].message, /One asset per purchase line is not possible for 1-2630 Building under construction \(50 purchase lines\)/);
  assert.equal(forced.drafts.length, 3);
  // "skip" creates nothing now; an account kept outside the register is not offered and not counted.
  const skipped = takeOnPlan(input(), { [building.id]: "skip" });
  assert.deepEqual([skipped.drafts.length, skipped.offers.length, skipped.unregisteredTotal], [3, 3, all.unregisteredTotal]);
  const outside = takeOnPlan(input({ outside: [building.id] }));
  assert.deepEqual([outside.offers.map((o) => o.code), outside.unregisteredTotal, outside.drafts.length], [["1-2600", "1-2640"], 336_000_000, 3]);
  assert.deepEqual(outside.leftOut, [{ accountId: building.id, code: "1-2630", name: "Building under construction", ledgerCost: 1_485_000_000, registeredCost: 0 }]);
  assert.deepEqual(outside.ledgerVsRegister.filter((r) => r.outside).map((r) => [r.code, r.difference]), [["1-2630", 1_485_000_000]], "still listed, marked as left out");
});

test("an asset is named after its purchase line when the line says what was bought, else after its account", () => {
  const names = (...entries: JournalEntry[]) => takeOnPlan({ accounts: chart, entries, assets: [] }).drafts.map((d) => d.name);
  // The take-over entry as it often arrives: the same words on every line.
  assert.deepEqual(names(journal("2025-01-01", "QBO Journal Entry 1 · Opening balance", [dr(vehicle, 300_000_000, "Opening balance"), dr(equipment, 24_000_000, "Opening balance"), dr(equipment, 12_000_000, "Opening balance"), cr(equity, 336_000_000, "Opening balance")])), ["Vehicle", "Kitchen Equipment (1)", "Kitchen Equipment (2)"]);
  // No description at all, and a memo that is only the importer's label.
  assert.deepEqual(names(journal("2025-01-01", "QBO Journal Entry 7", [dr(vehicle, 300_000_000), dr(equipment, 24_000_000), cr(equity, 324_000_000)])), ["Vehicle", "Kitchen Equipment"]);
  // One description on the lines of two cost accounts describes the entry, whatever its words.
  assert.deepEqual(names(journal("2025-01-01", "QBO Journal Entry 8 · Take-over 2025", [dr(vehicle, 300_000_000, "Take-over 2025"), dr(equipment, 24_000_000, "Take-over 2025"), cr(equity, 324_000_000)])), ["Vehicle", "Kitchen Equipment"]);
  // A purchase keeps its description, also when the bank line repeats it; without one, the memo less the importer's label.
  assert.deepEqual(names(journal("2025-03-01", "QBO Expense · Demo espresso machine", [dr(equipment, 20_000_000, "Demo espresso machine"), cr(bank, 20_000_000, "Demo espresso machine")])), ["Demo espresso machine"]);
  assert.deepEqual(names(journal("2025-03-02", "QBO Expense 12 · Demo blender", [dr(equipment, 5_000_000), cr(bank, 5_000_000)])), ["Demo blender"]);
  // Two lots under one description are numbered so they can be told apart.
  assert.deepEqual(names(journal("2025-03-03", "QBO Bill 4 · Demo chairs", [dr(equipment, 6_000_000, "Demo chairs"), dr(equipment, 4_000_000, "Demo chairs"), cr(bank, 10_000_000)])), ["Demo chairs (1)", "Demo chairs (2)"]);
});

// ---------- Pairing ----------

test("distinctive words: what names the asset, without the words every such account carries", () => {
  assert.deepEqual(distinctiveWords("Accumulated Depreciation - Vehicle"), ["vehicle"]);
  assert.deepEqual(distinctiveWords("Akumulasi penyusutan kendaraan"), ["kendaraan"]);
  assert.deepEqual(distinctiveWords("Accumulated amortisation - leasehold"), ["leasehold"]);
  assert.deepEqual(distinctiveWords("Vehicles"), ["vehicle"], "plural and singular are one word");
  assert.deepEqual(distinctiveWords("Equipment and furniture"), ["equipment", "furniture"]);
  assert.deepEqual(distinctiveWords("Accumulated depreciation"), []);
  assert.deepEqual(distinctiveWords("Fixed Assets (at cost)"), []);
  assert.equal(nameMatch({ name: "Vehicle" }, { name: "ACCUMULATED DEPRECIATION - VEHICLES" }), 3);
  assert.equal(nameMatch({ name: "Vehicle" }, { name: "Accumulated depreciation - vehicle and machinery" }), 2);
  assert.equal(nameMatch({ name: "Equipment and furniture" }, { name: "Accumulated depreciation - equipment" }), 1);
  assert.equal(nameMatch({ name: "Vehicle" }, { name: "Accumulated depreciation - building" }), 0);
  assert.equal(nameMatch({ name: "Fixed assets" }, { name: "Accumulated depreciation" }), 0, "nothing distinctive on either side is not a match");
  assert.equal(nameMatch({ name: "Operational cars", nameId: "Kendaraan" }, { name: "Accumulated depreciation", nameId: "Akumulasi penyusutan kendaraan" }), 3, "the Indonesian names count too");
});

test("accumulated accounts are paired by name first, then by code family among the accounts nobody claimed, else not at all", () => {
  // The template pairs by name, whatever the codes.
  const std = pairAccumulatedAccounts(template);
  const pairOf = (m: ReturnType<typeof pairAccumulatedAccounts>, c: Account) => { const p = m.get(c.id); return p ? [p.account.code, p.by] : undefined; };
  const t = (c: string) => findByCode(template, c)!;
  assert.deepEqual(["1-2000", "1-2100", "1-2200", "1-2300", "1-2400"].map((c) => pairOf(std, t(c))), [undefined, ["1-2110", "name"], ["1-2210", "name"], ["1-2310", "name"], ["1-2410", "name"]]);
  // Sequential codes from an import: the second cost account of the family does not inherit the vehicle's account.
  const pairs = pairAccumulatedAccounts(chart);
  assert.deepEqual(pairOf(pairs, vehicle), ["1-2610", "name"]);
  assert.deepEqual(pairOf(pairs, equipment), ["1-2620", "name"]);
  assert.deepEqual(pairOf(pairs, building), ["1-2110", "name"], "the template's account for buildings");
  const machinery = acct("1-2650", "Machinery", "fixed_asset");
  assert.equal(pairOf(pairAccumulatedAccounts([...chart, machinery]), machinery), undefined, "1-2610 and 1-2620 share its code family but are named after the vehicle and the equipment");
  // Two accounts named alike (the template's and the imported one): the one with postings wins, then the same family.
  const twins = [...template, vehicle, accumVehicle];
  assert.deepEqual(pairOf(pairAccumulatedAccounts(twins), vehicle), ["1-2610", "name"], "same family");
  assert.deepEqual(pairOf(pairAccumulatedAccounts(twins, new Set([t("1-2210").id])), vehicle), ["1-2210", "name"], "the account that carries the depreciation");
  // Names that say nothing: the code family, the account that follows the cost account first.
  const plant = acct("1-2900", "Plant", "fixed_asset"), tools = acct("1-2930", "Tools", "fixed_asset");
  const generic = acct("1-2910", "Accumulated depreciation", "accum_depr"), other = acct("1-2950", "Accumulated depreciation (other)", "accum_depr");
  const byFamily = pairAccumulatedAccounts([plant, tools, generic, other]);
  assert.deepEqual([pairOf(byFamily, plant), pairOf(byFamily, tools)], [["1-2910", "code"], ["1-2950", "code"]]);
  // No account in the family, or only an inactive one without postings: none (chosen when the asset is confirmed).
  assert.equal(pairAccumulatedAccounts([plant, acct("1-3010", "Accumulated depreciation", "accum_depr")]).size, 0);
  const closed = acct("1-2910", "Accumulated depreciation - plant", "accum_depr", { active: false });
  assert.equal(pairAccumulatedAccounts([plant, closed]).size, 0);
  assert.deepEqual(pairOf(pairAccumulatedAccounts([plant, closed], new Set([closed.id])), plant), ["1-2910", "name"], "an inactive account that carries the balance is still the pair");
});

test("the expense account named after the cost account is preferred to the general one", () => {
  assert.equal(pairedExpenseAccount(vehicle, chart)?.id, deprVehicle.id);
  assert.equal(pairedExpenseAccount(equipment, chart)?.code, "6-2100", "none named after it: the usual depreciation expense");
  assert.equal(pairedExpenseAccount(findByCode(template, "1-2400")!, template)?.code, "6-2110", "leasehold is amortised");
  assert.equal(pairedExpenseAccount(vehicle, [vehicle, { ...deprVehicle, active: false }]), undefined);
});

test("depreciation carries on to the expense account the previous books used with that accumulated account", () => {
  // The company's own "Depreciation" account, which no name ties to the vehicle: the history does.
  const own = acct("6-2130", "Depreciation", "depreciation");
  const own2 = acct("6-2140", "Depreciation of fittings", "depreciation");
  const accounts = [...template, vehicle, accumVehicle, equipment, accumEquipment, own, own2];
  const expenseOf = (entries: JournalEntry[]) => takeOnPlan({ accounts, entries, assets: [] }).drafts.map((d) => accounts.find((a) => a.id === d.deprExpenseAccountId)?.code);
  const start = journal("2025-01-01", "Opening balances", [dr(vehicle, 300_000_000, "Demo pickup truck"), dr(equipment, 36_000_000, "Demo oven"), cr(accumVehicle, 59_375_000), cr(accumEquipment, 9_000_000), cr(equity, 267_625_000)]);
  assert.deepEqual(expenseOf([start]), ["6-2100", "6-2100"], "no depreciation posted yet, no account named after them: the usual one");
  // One entry a month for everything, on one expense account.
  const together = journal("2025-01-31", "Depreciation", [dr(own, 3_875_000), cr(accumVehicle, 3_125_000), cr(accumEquipment, 750_000)]);
  assert.deepEqual(expenseOf([start, together]), ["6-2130", "6-2130"]);
  // One entry with a pair per asset class: told apart by amount.
  const pairs = journal("2025-01-31", "Depreciation", [dr(own, 3_125_000), dr(own2, 750_000), cr(accumVehicle, 3_125_000), cr(accumEquipment, 750_000)]);
  assert.deepEqual(expenseOf([start, pairs]), ["6-2130", "6-2140"]);
  // Several expense lines and none of the same amount: nothing can be read from the entry.
  const unclear = journal("2025-01-31", "Depreciation", [dr(own, 2_000_000), dr(own2, 1_875_000), cr(accumVehicle, 3_125_000), cr(accumEquipment, 750_000)]);
  assert.deepEqual(expenseOf([start, unclear]), ["6-2100", "6-2100"]);
  // An account closed since is not proposed.
  assert.deepEqual(takeOnPlan({ accounts: accounts.map((a) => (a.id === own.id ? { ...a, active: false } : a)), entries: [start, together], assets: [] }).drafts.map((d) => d.deprExpenseAccountId), [code("6-2100").id, code("6-2100").id]);
});

// ---------- Sharing accumulated depreciation ----------

test("accumulated depreciation is shared pro rata to cost in whole rupiah, the last one absorbs the remainder, nobody exceeds its cost", () => {
  assert.deepEqual(shareProRata(13_500_000, [24_000_000, 12_000_000]), [9_000_000, 4_500_000]);
  assert.deepEqual(shareProRata(100, [1_000, 1_000, 1_000]), [33, 33, 34]);
  assert.deepEqual(shareProRata(1_000.5, [3_000, 1_000]), [750, 250.5], "the cents go to the last one");
  assert.deepEqual(shareProRata(0, [5, 5]), [0, 0]);
  assert.deepEqual(shareProRata(-10, [5, 5]), [0, 0], "the register carrying more than the ledger shares nothing");
  assert.deepEqual(shareProRata(50, [0, 0]), [0, 0]);
  assert.deepEqual(shareProRata(90, [60, 0, 30]), [60, 0, 30]);
  // More in the ledger than the assets cost: each is capped, the rest stays a difference between ledger and register.
  assert.deepEqual(shareProRata(500, [100, 200]), [100, 200]);
  assert.deepEqual(shareProRata(250, [100, 200], [100, 160]), [90, 160], "what the last cannot take goes to the one before, up to its own cap");
  assert.equal(sum(shareProRata(7_777_777.77, [1_234_567_890, 987_654_321, 5_000_000_000])), 7_777_777.77);
});

test("an asset bought after the last depreciation of the previous books takes none of it; the register's own runs do not move that month", () => {
  const late = journal("2025-08-20", "Demo freezer", [dr(equipment, 18_000_000, "Demo freezer"), cr(bank, 18_000_000)]);
  const plan = takeOnPlan(input({ entries: [...ledger, late] }));
  const kitchen = plan.drafts.filter((d) => d.assetAccountId === equipment.id);
  assert.deepEqual(kitchen.map((d) => [d.name, d.takeOn.accumulated, d.takeOn.through]), [["Demo oven", 9_000_000, "2025-06"], ["Demo chiller", 4_500_000, "2025-06"], ["Demo freezer", 0, undefined]]);
  // The oven and the chiller are in the register and were depreciated from it through October: the freezer brought
  // in afterwards still sees June as the previous books' last month, and nothing left to take over.
  const run = journal("2025-10-31", "Depreciation 2025-10", [dr(code("6-2100"), 3_000_000), cr(accumEquipment, 3_000_000)], { source: "depreciation", sourceId: "2025-10" });
  const inRegister = registered(kitchen.slice(0, 2)).map((a, i) => ({ ...a, accumulatedDepreciation: a.accumulatedDepreciation + (i ? 1_000_000 : 2_000_000), depreciatedThrough: "2025-10" }));
  const later = takeOnPlan(input({ entries: [...ledger, late, run], assets: inRegister }));
  const equipmentRow = later.accumulated.find((a) => a.accountId === accumEquipment.id)!;
  assert.deepEqual([equipmentRow.ledgerAccumulated, equipmentRow.registeredAccumulated, equipmentRow.difference, equipmentRow.through], [16_500_000, 16_500_000, 0, "2025-06"]);
  assert.deepEqual(later.drafts.filter((d) => d.assetAccountId === equipment.id).map((d) => [d.name, d.takeOn]), [["Demo freezer", { accumulated: 0, mode: "line" }]]);
});

// ---------- The schedule that continues ----------

test("straight line continues after the take-on: the remainder over the months left, ending exactly at the salvage value", () => {
  // Bought June 2023, 96 months, 3,125,000 a month: 28 months (87,500,000) were depreciated in the previous books through September 2025.
  const truck = asset({ takeOn: { accumulated: 87_500_000, through: "2025-09", mode: "line", at: "" }, accumulatedDepreciation: 87_500_000, depreciatedThrough: "2025-09" });
  const rows = depreciationSchedule(truck);
  assert.equal(rows.length, 68, "96 months less the 28 from June 2023 through September 2025");
  assert.deepEqual([rows[0].period, rows[0].amount, rows[0].accumulated, rows[0].nbv], ["2025-10", 3_125_000, 90_625_000, 209_375_000]);
  assert.ok(rows.every((r) => r.amount === 3_125_000));
  assert.deepEqual([rows[67].period, rows[67].accumulated, rows[67].nbv], ["2031-05", 300_000_000, 0], "the same last month as a schedule from the acquisition date");
  assert.equal(depreciationSchedule(asset()).at(-1)!.period, "2031-05");
  // With the journal date of the opening entry as acquisition date (not corrected yet) the months left are counted from there.
  const uncorrected = depreciationSchedule({ ...truck, acquisitionDate: "2025-01-01" });
  assert.deepEqual([uncorrected.length, uncorrected[0].period, uncorrected.at(-1)!.period, uncorrected.at(-1)!.accumulated], [87, "2025-10", "2032-12", 300_000_000]);
  // Odd figures, a salvage value and cents: whole rupiah every month, the last month absorbs the rest.
  const odd = depreciationSchedule({ ...truck, cost: 100_000_000.5, salvageValue: 10_000_000, usefulLifeMonths: 60, takeOn: { accumulated: 33_333_333, through: "2025-09" } });
  assert.equal(odd.length, 32);
  assert.ok(odd.slice(0, -1).every((r) => Number.isInteger(r.amount) && r.amount === odd[0].amount));
  assert.equal(sum(odd.map((r) => r.amount)), 56_666_667.5);
  assert.deepEqual([odd.at(-1)!.accumulated, odd.at(-1)!.nbv], [90_000_000.5, 10_000_000]);
  // The previous books ran past the useful life with something left: one last month takes it.
  const overdue = depreciationSchedule({ ...truck, usefulLifeMonths: 24, takeOn: { accumulated: 299_000_000, through: "2025-09" } });
  assert.deepEqual(overdue.map((r) => [r.period, r.amount, r.nbv]), [["2025-10", 1_000_000, 0]]);
  // Fully depreciated in the previous books: nothing left to post.
  assert.deepEqual(depreciationSchedule({ ...truck, takeOn: { accumulated: 300_000_000, through: "2025-09" } }), []);
  assert.deepEqual(depreciationSchedule({ ...truck, salvageValue: 30_000_000, takeOn: { accumulated: 270_000_000, through: "2025-09" } }), []);
});

test("declining balance continues from the accumulated amount taken on, and ends at the salvage value", () => {
  const laptop = asset({ cost: 48_000_000, fiscalGroup: "group1", usefulLifeMonths: 48, method: "declining_balance", acquisitionDate: "2024-01-15" });
  const theory = depreciationSchedule(laptop);
  assert.deepEqual([theory[23].period, theory[23].accumulated], ["2025-12", 36_000_000]);
  // Taken on at a year end with what the method itself gives: the rest of the theoretical schedule, row for row.
  assert.deepEqual(depreciationSchedule({ ...laptop, takeOn: { accumulated: 36_000_000, through: "2025-12" } }), theory.slice(24));
  // Taken on with another figure (the previous books used their own rate): 50% of the net book value taken on per
  // year, then the remainder written off over the last fiscal year.
  const rows = depreciationSchedule({ ...laptop, takeOn: { accumulated: 30_000_000, through: "2025-12" } });
  assert.equal(rows.length, 24);
  assert.deepEqual([rows[0].period, rows[0].amount, rows[11].accumulated], ["2026-01", 750_000, 39_000_000]);
  assert.deepEqual([rows[12].amount, rows[23].period, rows[23].accumulated, rows[23].nbv], [750_000, "2027-12", 48_000_000, 0]);
  // Mid-year take-on with a salvage value: still ends exactly at the salvage value.
  const mid = depreciationSchedule({ ...laptop, salvageValue: 3_000_000, takeOn: { accumulated: 20_000_000.25, through: "2025-06" } });
  assert.deepEqual([mid[0].period, mid.length, mid.at(-1)!.period, mid.at(-1)!.accumulated, mid.at(-1)!.nbv], ["2025-07", 30, "2027-12", 45_000_000, 3_000_000]);
  assert.equal(sum(mid.map((r) => r.amount)), 24_999_999.75);
  assert.ok(mid.every((r) => r.amount > 0));
});

test("without a take-on, and for a take-on that was never depreciated, the schedule is the ordinary one", () => {
  for (const base of [asset(), asset({ method: "declining_balance" }), asset({ cost: 10_000_000.5, salvageValue: 1_000_000, usefulLifeMonths: 36, fiscalGroup: "group1" })]) {
    const plain = depreciationSchedule(base);
    assert.equal(plain[0].period, "2023-06");
    assert.equal(plain.length, base.usefulLifeMonths);
    assert.deepEqual(depreciationSchedule({ ...base, takeOn: undefined }), plain);
    assert.deepEqual(depreciationSchedule({ ...base, takeOn: { accumulated: 0 } }), plain, "never depreciated in the previous books: from the acquisition month");
    assert.deepEqual(depreciationSchedule(asset({ ...base, takeOn: { accumulated: 0, mode: "account", at: "" } })), plain);
  }
  assert.equal(depreciationSchedule(asset())[0].amount, 3_125_000);
  assert.deepEqual(depreciationSchedule(asset({ fiscalGroup: "land", usefulLifeMonths: 0, takeOn: { accumulated: 0, through: "2025-09", mode: "account", at: "" } })), [], "land is not depreciated, taken on or not");
});

test("what is due, the disposal figures and the automatic run all continue from the take-on", () => {
  const truck = asset({ takeOn: { accumulated: 87_500_000, through: "2025-09", mode: "line", at: "" }, accumulatedDepreciation: 87_500_000, depreciatedThrough: "2025-09" });
  assert.deepEqual(depreciationDue(truck, "2025-09"), { amount: 0, periods: [] }, "nothing before or in the month the previous books ran through");
  assert.deepEqual(depreciationDue(truck, "2025-12"), { amount: 9_375_000, periods: ["2025-10", "2025-11", "2025-12"] });
  // The same asset registered by hand without the take-on would post the 28 earlier months again.
  assert.equal(depreciationDue(asset(), "2025-12").periods.length, 31);
  // Sold in January 2026: October to December are caught up, the net book value starts from what was taken on.
  const sale = disposalPreview(truck, "2026-01-20", 210_000_000);
  assert.deepEqual([sale.through, sale.catchUp.amount, sale.accumulated, sale.netBookValue, sale.gainLoss], ["2025-12", 9_375_000, 96_875_000, 203_125_000, 6_875_000]);
  // Sold before the register posted anything: the previous books' figure stands.
  const early = disposalPreview(truck, "2025-10-05", 200_000_000);
  assert.deepEqual([early.catchUp.amount, early.netBookValue, early.gainLoss, early.postedAhead], [0, 212_500_000, -12_500_000, false]);
  // Never held back by the automatic run, whether it continues after a month or starts from the acquisition month.
  assert.equal(heldForFirstRun(truck, "2026-10"), false);
  assert.equal(heldForFirstRun(asset({ takeOn: { accumulated: 0, mode: "account", at: "" } }), "2026-10"), false, "confirmed as never depreciated: the run starts it");
  assert.equal(heldForFirstRun(asset(), "2026-10"), true, "registered by hand without a take-on: still held");
  assert.equal(heldForFirstRun({ ...truck, needsReview: true }, "2026-10"), false);
  // What the previous books posted is not a posting of the register: the asset can still be corrected or removed.
  assert.equal(depreciationStarted(truck), false);
  assert.equal(isUntouched(truck), true);
  assert.equal(depreciationStarted({ ...truck, accumulatedDepreciation: 90_625_000, depreciatedThrough: "2025-10" }), true);
  assert.equal(depreciationStarted(asset({ accumulatedDepreciation: 3_125_000, depreciatedThrough: "2023-06" })), true);
  assert.equal(depreciationStarted(asset()), false);
});

test("the note after a take-on", () => {
  assert.equal(takeOnNote(0), "");
  assert.equal(takeOnNote(1), "1 fixed asset brought into the Assets register for review");
  assert.equal(takeOnNote(3), "3 fixed assets brought into the Assets register for review");
});
