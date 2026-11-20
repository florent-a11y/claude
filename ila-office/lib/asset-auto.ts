/**
 * The fixed-asset register keeps itself up to date (accounting team request). Three automations, all built on the
 * ordinary Books services so numbering, period locks and the audit trail stay in one place:
 *
 * 1. Purchases register themselves. Every DEBIT line on an account of subtype `fixed_asset` in a posted bill,
 *    expense or hand-written journal becomes a `FixedAsset` flagged `needsReview`: cost = the debit in IDR, name =
 *    the line description (else the memo), acquisition date = the journal date, with the paired accumulated-
 *    depreciation account, the usual expense account and a fiscal group guessed from the asset account. Until an
 *    accountant confirms it on the asset page it is neither depreciated nor disposable. One asset per journal line
 *    (`assetSourceKey`), so registering twice changes nothing. Never from opening / closing / fx / depreciation
 *    entries, QuickBooks history (`sourceId` "qbo:…") or a disposal entry: what a ledger already carried when it
 *    arrived is brought in by the take-on instead (lib/asset-takeon.ts). Voiding the document removes an asset
 *    nothing was posted on and flags the others; editing a hand-written journal re-points, re-prices, removes or
 *    adds assets for the lines that changed (`planAssetSync`).
 * 2. Sale and disposal live in `disposeAsset` (lib/books.ts) with the figures of `disposalPreview` (lib/ledger.ts);
 *    this file finds or names the dedicated gain and loss accounts and re-opens an asset whose disposal entry is voided.
 * 3. `runAutoDepreciation` posts the last completed month for every entity with automatic depreciation on, from the
 *    daily job (app/api/recurring/run). It never throws: a locked period or any error is reported per entity.
 *
 * Everything above "Services" is pure (no database) and unit-tested in tests/asset-auto.test.ts.
 */
import { db } from "./db";
import { BooksError, createAccount, createAsset, depreciationStarted, entityAccounts, errorMessage, runDepreciation } from "./books";
import { periodOf, prevPeriod, todayISO } from "./dates";
import { defaultUsefulLifeMonths } from "./ledger";
import { fmtMoney, roundMoney } from "./money";
import type { Account, AccountSubtype, AccountType, Entity, FiscalAssetGroup, FixedAsset, JournalEntry, JournalSource } from "./types";

// ---------- Pure: which journals register assets ----------

/** Journals that can carry a purchase: bills, expenses (source "bank") and hand-written entries. */
export const AUTO_REGISTER_SOURCES: readonly JournalSource[] = ["bill", "bank", "manual", "adjustment"];

type JournalHead = Pick<JournalEntry, "id" | "source" | "sourceId" | "status">;
type DisposalRef = Pick<FixedAsset, "id" | "disposalJournalId">;

/** The entry that disposed of one of `assets` (posted by `disposeAsset` as an "adjustment" whose sourceId is the asset). */
export function isDisposalEntry(journal: JournalHead, assets: DisposalRef[]): boolean {
  return assets.some((a) => a.disposalJournalId === journal.id || (journal.source === "adjustment" && journal.sourceId === a.id));
}

/** Why a journal never registers assets, or null when its fixed-asset debit lines do. */
export function autoRegisterSkipReason(journal: JournalHead, assets: DisposalRef[] = []): string | null {
  if (journal.status !== "posted") return `the entry is ${journal.status}`;
  if (!AUTO_REGISTER_SOURCES.includes(journal.source)) return `"${journal.source}" entries do not register assets`;
  if (journal.sourceId?.startsWith("qbo:")) return "QuickBooks history does not register assets";
  if (isDisposalEntry(journal, assets)) return "a disposal entry does not register assets";
  return null;
}

// ---------- Pure: defaults guessed from the asset account ----------

export type AssetKind = "land" | "building" | "vehicle" | "equipment" | "leasehold";

/** Names win over codes so a renumbered or imported chart still guesses right; the template's code families are the fallback. */
const KIND_BY_NAME: Array<[AssetKind, RegExp]> = [
  ["leasehold", /leasehold|hak sewa|hak guna|\bhgb\b|\bhgu\b|sewa jangka/i],
  ["building", /building|bangunan|gedung|villa|\bvila\b|renovat|renovasi/i],
  ["land", /\bland\b|tanah/i],
  ["vehicle", /vehicle|kendaraan|\bcars?\b|mobil|motor|scooter|truck|\btruk\b|boat|kapal|machin|mesin/i],
  ["equipment", /equipment|peralatan|perlengkapan|furniture|mebel|fixture|computer|komputer|laptop|inventaris/i],
];
const KIND_BY_FAMILY: Record<string, AssetKind> = { "1-20": "land", "1-21": "building", "1-22": "vehicle", "1-23": "equipment", "1-24": "leasehold" };
/** Leasehold is a placeholder: its term (and so its group) depends on the lease, which only the accountant knows. */
const GROUP_BY_KIND: Record<AssetKind, FiscalAssetGroup> = { land: "land", building: "building_permanent", vehicle: "group2", equipment: "group1", leasehold: "group4" };

type AccountLabel = Pick<Account, "code" | "name" | "nameId">;
/** Ledger amounts carry cents: two amounts are the same when they agree to the cent. */
export const sameMoney = (x: number, y: number) => Math.abs(x - y) < 0.005;
/** "1-2100" and "1-2110" belong to one family: the code without its last two digits. */
const family = (code: string) => code.slice(0, -2);
const byCode = (x: Account, y: Account) => x.code.localeCompare(y.code);

export function assetKindOf(account: AccountLabel): AssetKind {
  const text = `${account.name} ${account.nameId ?? ""}`;
  return KIND_BY_NAME.find(([, re]) => re.test(text))?.[0] ?? KIND_BY_FAMILY[account.code.slice(0, 4)] ?? "equipment";
}

export function guessFiscalGroup(account: AccountLabel): FiscalAssetGroup {
  return GROUP_BY_KIND[assetKindOf(account)];
}

/** The accumulated-depreciation account of the same code family (1-2200 → 1-2210), else the first active one of the chart. */
export function pairedAccumAccount(asset: Pick<Account, "code">, accounts: Account[]): Account | undefined {
  const accum = accounts.filter((a) => a.active && a.subtype === "accum_depr").sort(byCode);
  return accum.find((a) => family(a.code) === family(asset.code)) ?? accum[0];
}

/** 6-2100 Depreciation expense, or 6-2110 Amortisation expense for leasehold and intangibles; else the first active depreciation account. */
export function defaultDeprExpenseAccount(asset: AccountLabel, accounts: Account[]): Account | undefined {
  const depr = accounts.filter((a) => a.active && a.subtype === "depreciation").sort(byCode);
  const at = (code: string) => depr.find((a) => a.code === code);
  const amortised = assetKindOf(asset) === "leasehold" || /intangible|tak berwujud|amorti/i.test(`${asset.name} ${asset.nameId ?? ""}`);
  return (amortised ? at("6-2110") ?? depr.find((a) => /amorti/i.test(a.name)) : undefined) ?? at("6-2100") ?? depr[0];
}

// ---------- Pure: drafts from a journal ----------

export interface AssetDraft {
  /** Index of the debit line in `journal.lines`; with the journal id it is the idempotency key. */
  lineIndex: number;
  name: string;
  /** The line's debit, IDR. */
  cost: number;
  acquisitionDate: string;
  assetAccountId: string;
  /** Empty when the chart has no such account: chosen when the asset is confirmed. */
  accumDeprAccountId: string;
  deprExpenseAccountId: string;
  fiscalGroup: FiscalAssetGroup;
  method: "straight_line";
  usefulLifeMonths: number;
}

/** One asset per journal line: the key that makes registration idempotent. */
export function assetSourceKey(journalId: string, lineIndex: number): string {
  return `${journalId}:${lineIndex}`;
}

export function assetKeyOf(asset: Pick<FixedAsset, "sourceJournalId" | "sourceLineIndex">): string | undefined {
  return asset.sourceJournalId !== undefined && asset.sourceLineIndex !== undefined ? assetSourceKey(asset.sourceJournalId, asset.sourceLineIndex) : undefined;
}

/**
 * One draft per debit line on a fixed-asset account; credit lines (a sale, a reclassification out) and every other
 * account are ignored. Empty for the journals `autoRegisterSkipReason` rules out; pass the entity's assets so a
 * disposal entry is recognised.
 */
export function assetDraftsFromJournal(journal: JournalHead & Pick<JournalEntry, "date" | "memo" | "lines">, accounts: Account[], assets: DisposalRef[] = []): AssetDraft[] {
  if (autoRegisterSkipReason(journal, assets)) return [];
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const drafts: AssetDraft[] = [];
  journal.lines.forEach((l, lineIndex) => {
    const account = byId.get(l.accountId);
    if (!account || account.subtype !== "fixed_asset" || !(l.debit > 0)) return;
    const fiscalGroup = guessFiscalGroup(account);
    drafts.push({
      lineIndex, name: (l.description?.trim() || journal.memo.trim() || account.name).slice(0, 160), cost: roundMoney(l.debit), acquisitionDate: journal.date, assetAccountId: account.id,
      accumDeprAccountId: pairedAccumAccount(account, accounts)?.id ?? "", deprExpenseAccountId: defaultDeprExpenseAccount(account, accounts)?.id ?? "",
      fiscalGroup, method: "straight_line", usefulLifeMonths: defaultUsefulLifeMonths(fiscalGroup),
    });
  });
  return drafts;
}

// ---------- Pure: an edited journal ----------

type Linked = Pick<FixedAsset, "id" | "sourceLineIndex">;
export interface AssetSyncPlan<A extends Linked> {
  /** Assets whose line is still in the entry: the draft carries its new index, cost and date. */
  keep: Array<{ asset: A; draft: AssetDraft }>;
  /** Assets whose line was removed or moved to another account. */
  orphans: A[];
  /** Fixed-asset debit lines the previous version did not have. */
  create: AssetDraft[];
}

/**
 * What an in-place edit of a journal means for the assets registered from it. Lines are paired before → after by
 * asset account and amount (same position first), then by position and account for a corrected amount. Only lines
 * that are new create an asset: a line that was already there and has no asset (removed from the register on
 * review, or posted before automatic registration existed) stays without one.
 */
export function planAssetSync<A extends Linked>(before: AssetDraft[], after: AssetDraft[], linked: A[]): AssetSyncPlan<A> {
  const free = new Set(after);
  const pairs = new Map<AssetDraft, AssetDraft>();
  const tests: Array<(b: AssetDraft, a: AssetDraft) => boolean> = [
    (b, a) => a.assetAccountId === b.assetAccountId && sameMoney(a.cost, b.cost) && a.lineIndex === b.lineIndex,
    (b, a) => a.assetAccountId === b.assetAccountId && sameMoney(a.cost, b.cost),
    (b, a) => a.assetAccountId === b.assetAccountId && a.lineIndex === b.lineIndex,
  ];
  for (const test of tests) {
    for (const b of before) {
      if (pairs.has(b)) continue;
      const match = [...free].find((a) => test(b, a));
      if (match) { pairs.set(b, match); free.delete(match); }
    }
  }
  const plan: AssetSyncPlan<A> = { keep: [], orphans: [], create: [...free] };
  const paired = new Map([...pairs].map(([b, a]) => [b.lineIndex, a]));
  const known = new Set(before.map((b) => b.lineIndex));
  for (const asset of linked) {
    const draft = asset.sourceLineIndex === undefined ? undefined : paired.get(asset.sourceLineIndex);
    if (draft) plan.keep.push({ asset, draft });
    // An asset pointing at a line the previous version did not have as a purchase is left alone rather than guessed at.
    else if (asset.sourceLineIndex !== undefined && known.has(asset.sourceLineIndex)) plan.orphans.push(asset);
  }
  return plan;
}

// ---------- Pure: leaving the register, first automatic run ----------

/**
 * Nothing was posted or filed on the asset from this register, so it can simply leave it when its purchase is voided.
 * What an asset brought in from the ledger carried over from the previous books (`takeOn`) is not a posting of the register.
 */
export function isUntouched(asset: Pick<FixedAsset, "status" | "accumulatedDepreciation" | "depreciatedThrough" | "attachments" | "takeOn">): boolean {
  return asset.status === "active" && !depreciationStarted(asset) && !asset.attachments?.length;
}

/**
 * Held back from the automatic run: an asset registered by hand, never depreciated from the register, whose first
 * posting would reach back before `period`. Such assets come from opening balances or migrated history, where the
 * ledger usually carries the earlier depreciation already; posting it again unasked would double it. One manual
 * "Run depreciation" from the Assets page, where the amount due is shown, starts them; assets registered from a
 * purchase are never held. Nor is an asset brought in from the ledger (`takeOn`, lib/asset-takeon.ts): its
 * confirmation states what the previous books had depreciated (through which month, or never), so the run knows
 * where to continue.
 */
export function heldForFirstRun(asset: Pick<FixedAsset, "status" | "needsReview" | "depreciatedThrough" | "sourceJournalId" | "acquisitionDate" | "fiscalGroup" | "takeOn">, period: string): boolean {
  return asset.status === "active" && !asset.needsReview && !asset.depreciatedThrough && !asset.sourceJournalId && !asset.takeOn && asset.fiscalGroup !== "land" && periodOf(asset.acquisitionDate) < period;
}

/** On unless the entity switched it off (Assets page). */
export function autoDepreciationOn(entity: Pick<Entity, "autoDepreciation">): boolean {
  return entity.autoDepreciation !== false;
}

// ---------- Pure: gain and loss on disposal ----------

export type DisposalResult = "gain" | "loss";
export const DISPOSAL_ACCOUNTS: Record<DisposalResult, { code: string; name: string; nameId: string; type: AccountType; subtype: AccountSubtype; fallbackCode: string }> = {
  gain: { code: "7-1210", name: "Gain on disposal of fixed assets", nameId: "Laba pelepasan aset tetap", type: "revenue", subtype: "other_income", fallbackCode: "7-1200" },
  loss: { code: "8-1210", name: "Loss on disposal of fixed assets", nameId: "Rugi pelepasan aset tetap", type: "expense", subtype: "other_expense", fallbackCode: "8-1200" },
};
const DISPOSAL_NAME: Record<DisposalResult, RegExp> = {
  gain: /(gain|laba|keuntungan).*(dispos|sale|pelepasan|penjualan).*(asset|aset|aktiva)/i,
  loss: /(loss|rugi|kerugian).*(dispos|sale|pelepasan|penjualan).*(asset|aset|aktiva)/i,
};

/** The chart's dedicated account, found by name so a renumbered or imported one is reused: active, of the right type. */
export function findDisposalAccount(accounts: Account[], kind: DisposalResult): Account | undefined {
  const spec = DISPOSAL_ACCOUNTS[kind];
  const candidates = accounts.filter((a) => a.active && a.type === spec.type && DISPOSAL_NAME[kind].test(`${a.name} ${a.nameId ?? ""}`)).sort(byCode);
  return candidates.find((a) => a.code === spec.code) ?? candidates[0];
}

/** `code` when no account uses it, else the next free code counting up ("7-1210" → "7-1211"). */
export function nextFreeCode(accounts: Array<Pick<Account, "code">>, code: string): string {
  const used = new Set(accounts.map((a) => a.code));
  const m = /^(.*?)(\d+)$/.exec(code);
  if (!used.has(code) || !m) return code;
  for (let n = Number(m[2]) + 1; ; n++) {
    const next = `${m[1]}${String(n).padStart(m[2].length, "0")}`;
    if (!used.has(next)) return next;
  }
}

/** Where a gain or loss went before the dedicated accounts existed, kept as the fallback: 7-1200 / 8-1200, else any other income / expense account. */
export function fallbackDisposalAccount(accounts: Account[], kind: DisposalResult): Account | undefined {
  const spec = DISPOSAL_ACCOUNTS[kind];
  return accounts.find((a) => a.code === spec.fallbackCode) ?? accounts.find((a) => a.subtype === spec.subtype && a.active);
}

// ---------- Pure: messages ----------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface AutoRegisterOutcome { created: FixedAsset[]; updated: number; removed: number; flagged: number; reopened: number; error?: string }
const emptyOutcome = (): AutoRegisterOutcome => ({ created: [], updated: 0, removed: 0, flagged: 0, reopened: 0 });

/** A clause for the flash message after posting, editing or voiding ("" when the register did not move). */
export function registerNote(o: AutoRegisterOutcome): string {
  const parts: string[] = [];
  if (o.created.length) parts.push(`${plural(o.created.length, "asset")} registered automatically (review under Assets)`);
  if (o.updated) parts.push(`${plural(o.updated, "registered asset")} updated`);
  if (o.removed) parts.push(`${plural(o.removed, "asset")} removed from the register`);
  if (o.flagged) parts.push(`${plural(o.flagged, "asset")} kept in the register with a note (depreciation, a disposal or documents are already on ${o.flagged === 1 ? "it" : "them"}): check Assets`);
  if (o.reopened) parts.push(`${plural(o.reopened, "asset")} back in use`);
  if (o.error) parts.push(`the asset register could not be updated (${o.error}): check Assets`);
  return parts.length ? `; ${parts.join("; ")}` : "";
}

// ---------- Services ----------

/**
 * Creates a `FixedAsset` (flagged `needsReview`) for every fixed-asset debit line of a posted journal that has none
 * yet; `source` links the bill or the expense behind the journal. Pass `accounts` when they are already loaded: a
 * journal without such a line then costs no query at all.
 */
export async function registerAssetsFromJournal(entityId: string, journal: JournalEntry, source: { billId?: string; paymentId?: string } = {}, accounts?: Account[]): Promise<FixedAsset[]> {
  if (journal.entityId !== entityId || autoRegisterSkipReason(journal)) return [];
  const chart = accounts ?? (await entityAccounts(entityId));
  const fixed = new Set(chart.filter((a) => a.subtype === "fixed_asset").map((a) => a.id));
  if (!journal.lines.some((l) => l.debit > 0 && fixed.has(l.accountId))) return [];
  const assets = await db.list("fixed_assets", { where: { entityId } });
  const taken = new Set(assets.map(assetKeyOf));
  const created: FixedAsset[] = [];
  for (const d of assetDraftsFromJournal(journal, chart, assets)) {
    if (taken.has(assetSourceKey(journal.id, d.lineIndex))) continue;
    created.push(await createFromDraft(entityId, journal.id, d, source));
  }
  return created;
}

function createFromDraft(entityId: string, journalId: string, d: AssetDraft, source: { billId?: string; paymentId?: string }): Promise<FixedAsset> {
  const { lineIndex, ...fields } = d;
  return createAsset(entityId, { ...fields, billId: source.billId, paymentId: source.paymentId, sourceJournalId: journalId, sourceLineIndex: lineIndex, needsReview: true });
}

/** Runs a register update that must never undo or mask the posting it follows: a failure is logged and reported in the outcome. */
async function safely(what: string, fn: (o: AutoRegisterOutcome) => Promise<void>): Promise<AutoRegisterOutcome> {
  const outcome = emptyOutcome();
  try { await fn(outcome); } catch (e) {
    outcome.error = errorMessage(e);
    console.error(`[asset-auto] ${what}: ${outcome.error}`);
  }
  return outcome;
}

/** `registerAssetsFromJournal` for the posting paths (bill, expense, manual journal): never throws. */
export function autoRegisterAssets(entityId: string, journal: JournalEntry, source: { billId?: string; paymentId?: string } = {}, accounts?: Account[]): Promise<AutoRegisterOutcome> {
  return safely(`registering assets from ${journal.number}`, async (o) => { o.created = await registerAssetsFromJournal(entityId, journal, source, accounts); });
}

const stamp = (asset: Pick<FixedAsset, "notes">, note: string) => [asset.notes?.trim(), `${todayISO()}: ${note}`].filter(Boolean).join("\n");

/**
 * An asset whose purchase is gone: out of the register when nothing was posted on it, else kept with the reason in
 * its notes and flagged for review (a disposed asset only gets the note: there is nothing left to confirm).
 */
async function release(asset: FixedAsset, reason: string, o: AutoRegisterOutcome): Promise<void> {
  if (isUntouched(asset)) { await db.remove("fixed_assets", asset.id); o.removed++; return; }
  const disposed = asset.status === "disposed";
  await db.update("fixed_assets", asset.id, {
    needsReview: disposed ? asset.needsReview : true,
    notes: stamp(asset, `${reason}. ${disposed ? "The asset was already disposed of: check the ledger." : "Depreciation or documents are already on this asset: check the ledger, then dispose of it or confirm it."}`),
  });
  o.flagged++;
}

/**
 * After a bill, expense or journal is voided: the assets registered from its journal leave the register, or are
 * flagged when depreciation was already posted. `what` names the document for the note ("bill BILL-2026-0007"). Never throws.
 */
export function releaseAssetsOfJournal(entityId: string, journalId: string, what: string): Promise<AutoRegisterOutcome> {
  return safely(`releasing the assets of ${what}`, async (o) => {
    const linked = await db.list("fixed_assets", { where: { entityId, sourceJournalId: journalId } });
    for (const asset of linked) await release(asset, `The ${what} this asset was registered from was voided`, o);
  });
}

/**
 * After any journal is voided from the Journal page: its registered assets are released, and an asset this entry
 * disposed of goes back in use (status, proceeds and result cleared; the statement line matched to the sale is
 * freed). Catch-up depreciation posted before the disposal stays: it was due anyway. Never throws.
 */
export function afterJournalVoided(entityId: string, entry: JournalEntry): Promise<AutoRegisterOutcome> {
  return safely(`updating the register after ${entry.number} was voided`, async (o) => {
    const assets = await db.list("fixed_assets", { where: { entityId } });
    for (const asset of assets) {
      if (asset.sourceJournalId === entry.id) await release(asset, `The journal entry ${entry.number} this asset was registered from was voided`, o);
      else if (asset.status === "disposed" && isDisposalEntry(entry, [asset])) {
        const done = asset.fiscalGroup !== "land" && asset.usefulLifeMonths > 0 && asset.accumulatedDepreciation > roundMoney(asset.cost - asset.salvageValue) - 0.005;
        await db.update("fixed_assets", asset.id, { status: done ? "fully_depreciated" : "active", disposedAt: undefined, disposalProceeds: undefined, disposalJournalId: undefined, disposalGainLoss: undefined, notes: stamp(asset, `Disposal entry ${entry.number} voided: the asset is back in use.`) });
        const lines = await db.list("bank_transactions", { where: { entityId, status: "matched", matchedJournalId: entry.id } });
        for (const tx of lines) await db.update("bank_transactions", tx.id, { status: "unmatched", matchedJournalId: undefined, matchedDocument: undefined });
        o.reopened++;
      }
    }
  });
}

/**
 * After a hand-written journal is edited in place: follows `planAssetSync`. A kept asset takes the line's new
 * position, and its new cost or date while nothing is posted on it (otherwise it is flagged); an asset whose line
 * is gone is released; a new fixed-asset debit line is registered. Never throws.
 */
export function syncAssetsAfterJournalEdit(entityId: string, before: JournalEntry, after: JournalEntry): Promise<AutoRegisterOutcome> {
  return safely(`updating the register after ${after.number} was edited`, async (o) => {
    const assets = await db.list("fixed_assets", { where: { entityId } });
    const linked = assets.filter((a) => a.sourceJournalId === after.id);
    const accounts = await entityAccounts(entityId);
    const fixed = new Set(accounts.filter((a) => a.subtype === "fixed_asset").map((a) => a.id));
    if (linked.length === 0 && !after.lines.some((l) => l.debit > 0 && fixed.has(l.accountId))) return;
    const plan = planAssetSync(assetDraftsFromJournal(before, accounts, assets), assetDraftsFromJournal(after, accounts, assets), linked);
    for (const { asset, draft } of plan.keep) {
      const moved = !sameMoney(draft.cost, asset.cost) || draft.acquisitionDate !== asset.acquisitionDate;
      if (!moved && draft.lineIndex === asset.sourceLineIndex) continue;
      if (!moved || isUntouched(asset)) {
        await db.update("fixed_assets", asset.id, { sourceLineIndex: draft.lineIndex, cost: draft.cost, acquisitionDate: draft.acquisitionDate });
        if (moved) o.updated++;
      } else {
        await db.update("fixed_assets", asset.id, { sourceLineIndex: draft.lineIndex, needsReview: true, notes: stamp(asset, `Journal entry ${after.number} was edited: its line now shows ${fmtMoney(draft.cost)} dated ${draft.acquisitionDate}, the register still ${fmtMoney(asset.cost)} dated ${asset.acquisitionDate} because depreciation or documents are already on this asset.`) });
        o.flagged++;
      }
    }
    for (const asset of plan.orphans) await release(asset, `The line of journal entry ${after.number} this asset was registered from was removed`, o);
    for (const d of plan.create) o.created.push(await createFromDraft(entityId, after.id, d, {}));
  });
}

/** The dedicated gain or loss account, created on first use (7-1210 / 8-1210, or the next free code); the general other income / expense account when that fails. */
export async function disposalResultAccount(entityId: string, accounts: Account[], kind: DisposalResult): Promise<Account> {
  const found = findDisposalAccount(accounts, kind);
  if (found) return found;
  const spec = DISPOSAL_ACCOUNTS[kind];
  try {
    return await createAccount(entityId, { code: nextFreeCode(accounts, spec.code), name: spec.name, nameId: spec.nameId, type: spec.type, subtype: spec.subtype });
  } catch {
    const fallback = fallbackDisposalAccount(accounts, kind);
    if (!fallback) throw new BooksError("Add an 'Other income' and an 'Other expenses' account before disposing assets.");
    return fallback;
  }
}

export interface AutoDepreciationSummary {
  /** The month posted: the last completed month before `today`. */
  period: string;
  /** Entities run: automatic depreciation on, not closed, at least one active and reviewed asset. */
  entities: number;
  posted: Array<{ entityId: string; journalNumber: string; amount: number }>;
  /** Locked period, any error, or assets held for a first manual run (`heldForFirstRun`). */
  skipped: Array<{ entityId: string; reason: string }>;
}

/**
 * The monthly depreciation of every entity, from the daily job: `runDepreciation` through the month before `today`
 * (it catches up skipped months and posts nothing twice, so running it every day is safe and the 1st does the work).
 * Assets waiting for review are left out. Never throws.
 */
export async function runAutoDepreciation(today = todayISO(), userId?: string): Promise<AutoDepreciationSummary> {
  const summary: AutoDepreciationSummary = { period: prevPeriod(periodOf(today)), entities: 0, posted: [], skipped: [] };
  try {
    const assets = await db.list("fixed_assets", { where: { status: "active" } });
    const entityIds = [...new Set(assets.filter((a) => !a.needsReview).map((a) => a.entityId))].sort();
    const entities = await db.getMany("entities", entityIds);
    for (const entityId of entityIds) {
      const entity = entities.get(entityId);
      if (!entity || entity.status === "closed" || !autoDepreciationOn(entity)) continue;
      summary.entities++;
      try {
        const r = await runDepreciation(entityId, summary.period, userId, { automatic: true });
        if (r.journal) summary.posted.push({ entityId, journalNumber: r.journal.number, amount: roundMoney(r.runs.reduce((s, x) => s + x.amount, 0)) });
        if (r.held.length) summary.skipped.push({ entityId, reason: `${plural(r.held.length, "asset")} registered by hand and never depreciated (${r.held.map((a) => a.name).slice(0, 3).join(", ")}${r.held.length > 3 ? "…" : ""}): run depreciation once from the Assets page to start ${r.held.length === 1 ? "it" : "them"}` });
      } catch (e) {
        summary.skipped.push({ entityId, reason: errorMessage(e) });
      }
    }
  } catch (e) {
    summary.skipped.push({ entityId: "*", reason: errorMessage(e) });
  }
  return summary;
}
