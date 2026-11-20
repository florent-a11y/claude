/**
 * Take-on: the fixed assets a ledger already carries are brought into the asset register (accounting team request
 * after the QuickBooks migration). The register of lib/asset-auto.ts only fills itself from purchases posted in the
 * app; a migrated ledger arrives with cost and accumulated depreciation on its accounts and an empty register.
 *
 * Rules, per entity, from the chart, the posted journal entries (every source: QuickBooks history, opening entries,
 * hand-written journals) and the register as it stands:
 *
 * - Cost. For each account of subtype `fixed_asset` the ledger cost (debits − credits) is compared with the cost of
 *   the register's assets on it (disposed ones excepted, their cost having left the ledger too). What the register
 *   lacks is offered: as one asset per purchase line while the account is simple (at most five debit lines without
 *   an asset, no credit, lines adding up to the missing amount), else as one asset for the account (a building paid
 *   in fifty instalments). Accounts the entity keeps outside the register are neither offered nor counted.
 * - Accumulated depreciation. Each cost account is paired with its accumulated-depreciation account by name first
 *   (imported charts are numbered in sequence, so the code family alone pairs wrongly), then by code family among the
 *   accounts no other cost account claimed by name, else none. What the ledger carries on that account beyond the
 *   register is shared pro rata to cost among the new assets paired with it, and the last month the previous books
 *   posted there is the month the register continues after (`FixedAsset.takeOn`, `depreciationSchedule`).
 * - Depreciation expense. The account the previous books debited when they credited that accumulated account, so the
 *   profit and loss continues on the same line; else the expense account named after the cost account; else the
 *   usual default of lib/asset-auto.ts.
 * - Nothing here posts or changes the ledger: taking on only describes what is already there. Every asset arrives
 *   flagged `needsReview`, and the accountant confirms the acquisition date (the journal date of an opening entry is
 *   the migration date), the fiscal group, the useful life and the depreciation taken over.
 *
 * Pure (no database): the services are in lib/asset-takeon-services.ts, the tests in tests/asset-takeon.test.ts.
 */
import { assetKeyOf, assetSourceKey, defaultDeprExpenseAccount, guessFiscalGroup } from "./asset-auto";
import { periodOf } from "./dates";
import { defaultUsefulLifeMonths } from "./ledger";
import { roundMoney, roundRupiah } from "./money";
import type { Account, FiscalAssetGroup, FixedAsset, JournalEntry } from "./types";

/** Two ledger amounts are the same when they agree to the cent. */
const EPS = 0.005;
/** One asset per purchase line is only proposed for an account with at most this many lines. */
export const TAKE_ON_MAX_LINES = 5;

export type TakeOnMode = "line" | "account";
/** "skip": leave the account out of the register (remembered on the entity by the service). */
export type TakeOnChoice = TakeOnMode | "skip";
export const TAKE_ON_CHOICES: readonly TakeOnChoice[] = ["line", "account", "skip"];

type LedgerEntry = Pick<JournalEntry, "id" | "number" | "date" | "memo" | "source" | "status" | "lines">;
type RegisterAsset = Pick<FixedAsset, "assetAccountId" | "accumDeprAccountId" | "cost" | "accumulatedDepreciation" | "status" | "sourceJournalId" | "sourceLineIndex">;

export interface TakeOnInput {
  accounts: Account[];
  /** The entity's journal entries: only posted ones are read. */
  entries: LedgerEntry[];
  /** The register as it stands, disposed assets included. */
  assets: RegisterAsset[];
  /** `Entity.assetAccountsOutsideRegister`: cost accounts kept outside the register. */
  outside?: readonly string[];
}

// ---------- Pairing by name ----------

/** Words that say "this is an accumulated-depreciation (or expense, or fixed-asset) account", not which asset it is about. */
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  "accumulated", "accumulation", "accum", "acc", "akumulasi", "akum", "depreciation", "depr", "dep", "penyusutan", "amortisation", "amortization", "amortisasi", "amort",
  "expense", "beban", "biaya", "fixed", "asset", "aset", "aktiva", "tetap", "cost", "harga", "perolehan", "less", "and", "dan", "of", "the", "for", "on", "at", "atas",
]);
/** "vehicles" and "vehicle" are one word; nothing cleverer is needed for account names. */
const stem = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/** The words of an account name that tell assets apart: lower case, no punctuation, plural "s" dropped, generic words left out. */
export function distinctiveWords(label: string): string[] {
  const words = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).map(stem);
  return [...new Set(words.filter((w) => w.length > 1 && !GENERIC_WORDS.has(w)))];
}

type Label = Pick<Account, "name" | "nameId">;
const labelsOf = (a: Label) => [a.name, a.nameId ?? ""].map(distinctiveWords).filter((w) => w.length > 0);

/**
 * How well `other` (an accumulated-depreciation or depreciation-expense account) is named after the cost account:
 * 3 = the same distinctive words ("Vehicle" / "Accumulated Depreciation - Vehicle"), 2 = it has every distinctive
 * word of the cost account, 1 = all of its distinctive words are the cost account's ("Equipment and furniture" /
 * "Accumulated depreciation - equipment"), 0 = no match. English and Indonesian names are both tried.
 */
export function nameMatch(cost: Label, other: Label): number {
  let best = 0;
  for (const c of labelsOf(cost)) {
    for (const o of labelsOf(other)) {
      const costInOther = c.every((w) => o.includes(w));
      const otherInCost = o.every((w) => c.includes(w));
      best = Math.max(best, costInOther && otherInCost ? 3 : costInOther ? 2 : otherInCost ? 1 : 0);
    }
  }
  return best;
}

/** "1-2600" and "1-2610" belong to one family: the code without its last two digits. */
const family = (code: string) => code.slice(0, -2);
const byCode = (x: Pick<Account, "code">, y: Pick<Account, "code">) => x.code.localeCompare(y.code);

export interface AccumPairing { account: Account; by: "name" | "code" }

/**
 * The accumulated-depreciation account of every cost account (subtype `fixed_asset`) of the chart, keyed by the cost
 * account's id; a cost account without one is absent. By name first; between two accounts named alike the one with
 * postings (`used`), then the one of the same code family, then the lower code wins. Then by code family, but only
 * among the accounts no cost account claimed by name: in an imported chart numbered in sequence (cost 1-2600,
 * accumulated 1-2610, another cost 1-2630) the family alone would give the second cost account the first one's
 * accumulated depreciation. Inactive accounts count only when they carry postings.
 */
export function pairAccumulatedAccounts(accounts: Account[], used: ReadonlySet<string> = new Set()): Map<string, AccumPairing> {
  const costs = accounts.filter((a) => a.subtype === "fixed_asset").sort(byCode);
  const accums = accounts.filter((a) => a.subtype === "accum_depr" && (a.active || used.has(a.id))).sort(byCode);
  const out = new Map<string, AccumPairing>();
  for (const cost of costs) {
    const ranked = accums.map((a) => ({ a, score: nameMatch(cost, a) })).filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score || Number(used.has(y.a.id)) - Number(used.has(x.a.id)) || Number(family(y.a.code) === family(cost.code)) - Number(family(x.a.code) === family(cost.code)) || byCode(x.a, y.a));
    if (ranked.length) out.set(cost.id, { account: ranked[0].a, by: "name" });
  }
  const claimed = new Set([...out.values()].map((p) => p.account.id));
  for (const cost of costs) {
    if (out.has(cost.id)) continue;
    const free = accums.filter((a) => !claimed.has(a.id) && family(a.code) === family(cost.code));
    // The accumulated account usually follows its cost account (1-2300 → 1-2310).
    const pick = free.find((a) => a.code > cost.code) ?? free[0];
    if (pick) out.set(cost.id, { account: pick, by: "code" });
  }
  return out;
}

/**
 * The depreciation expense account for assets of a cost account: the active one named after it ("Depreciation
 * Expense - Vehicle"), else the usual default of lib/asset-auto.ts (6-2100, 6-2110 for leasehold, else the first).
 */
export function pairedExpenseAccount(cost: Account, accounts: Account[]): Account | undefined {
  const named = accounts.filter((a) => a.active && a.subtype === "depreciation").map((a) => ({ a, score: nameMatch(cost, a) })).filter((x) => x.score > 0).sort((x, y) => y.score - x.score || byCode(x.a, y.a));
  return named[0]?.a ?? defaultDeprExpenseAccount(cost, accounts);
}

// ---------- Sharing accumulated depreciation ----------

/**
 * Shares `pool` pro rata to `weights` in whole rupiah; the last one absorbs the remainder (and the cents), none gets
 * more than its cap (`caps`, the weights when omitted). What the caps leave unallocated stays in the pool: the ledger
 * and the register then show it as a difference.
 */
export function shareProRata(pool: number, weights: number[], caps: number[] = weights): number[] {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const amount = Math.min(roundMoney(Math.max(0, pool)), roundMoney(caps.reduce((s, c) => s + Math.max(0, c), 0)));
  if (total <= 0 || amount < EPS) return weights.map(() => 0);
  const shares = weights.map((w, i) => Math.min(Math.max(0, caps[i]), roundRupiah((amount * Math.max(0, w)) / total)));
  let rest = roundMoney(amount - shares.reduce((s, x) => s + x, 0));
  for (let i = shares.length - 1; i >= 0 && Math.abs(rest) >= EPS; i--) {
    const next = Math.min(Math.max(0, caps[i]), Math.max(0, roundMoney(shares[i] + rest)));
    rest = roundMoney(rest - (next - shares[i]));
    shares[i] = next;
  }
  return shares.map((x) => roundMoney(x));
}

// ---------- Naming ----------

/** The memo the QuickBooks import writes starts with the transaction ("QBO Journal Entry 12 · …"): only what follows describes anything. */
const describe = (line: Pick<JournalEntry["lines"][number], "description">, memo: string) => line.description?.trim() || memo.replace(/^QBO [^·]*(·|$)/, "").trim();
/** A description of the entry rather than of an asset ("Opening balance" on every line of the take-over entry). */
const GENERIC_DESCRIPTION = /\b(opening|beginning|brought forward|b\/f|saldo awal|pembukaan)\b/i;
const sameText = (x: string) => x.trim().toLowerCase();

/** Names used more than once get a number, so two assets of one account can be told apart ("Equipment (1)", "Equipment (2)"). */
function numbered(names: string[]): string[] {
  const count = new Map<string, number>();
  for (const n of names) count.set(sameText(n), (count.get(sameText(n)) ?? 0) + 1);
  const seen = new Map<string, number>();
  return names.map((n) => {
    if ((count.get(sameText(n)) ?? 0) < 2) return n;
    const i = (seen.get(sameText(n)) ?? 0) + 1;
    seen.set(sameText(n), i);
    return `${n.slice(0, 150)} (${i})`;
  });
}

// ---------- The plan ----------

/** A debit line on a cost account that no asset of the register stands for yet. `description`: the line's, else the entry's memo ("" when neither says anything). */
export interface TakeOnLine { journalId: string; journalNumber: string; lineIndex: number; date: string; amount: number; description: string }

/** A cost account whose ledger balance is not (wholly) in the register. */
export interface TakeOnOffer {
  accountId: string; code: string; name: string;
  /** Debits − credits of the posted lines on the account. */
  ledgerCost: number;
  /** Cost of the register's assets on the account, disposed ones excepted. */
  registeredCost: number;
  /** ledgerCost − registeredCost: what bringing in adds to the register. */
  unregistered: number;
  lines: TakeOnLine[];
  /** Total of the credit lines on the account (a sale, a reclassification out, a correction). */
  credits: number;
  /** One asset per purchase line is possible; when not, `accountOnly` says why. */
  lineAllowed: boolean;
  accountOnly?: string;
  defaultMode: TakeOnMode;
  /** The paired accumulated-depreciation account ("" when none: chosen when the asset is confirmed). */
  accumAccountId: string;
  pairedBy?: "name" | "code";
  /** Under the plan's choices: accumulated depreciation the assets of this account take over, and the month it runs through. */
  accumulated: number;
  through?: string;
}

export interface TakeOnLeftOut { accountId: string; code: string; name: string; ledgerCost: number; registeredCost: number }

/** An accumulated-depreciation account: what the ledger carries against what the register's assets carry. */
export interface TakeOnAccumulated {
  accountId: string; code: string; name: string;
  /** Credits − debits of the posted lines on the account. */
  ledgerAccumulated: number;
  /** Accumulated depreciation of the register's assets that use the account, disposed ones excepted. */
  registeredAccumulated: number;
  /** What new assets take over (when positive). */
  difference: number;
  /** Month (YYYY-MM) of the last credit the previous books posted there (the register's own depreciation entries apart); undefined when none. */
  through?: string;
}

export interface LedgerRegisterRow { kind: "cost" | "accumulated"; accountId: string; code: string; name: string; ledger: number; register: number; difference: number; /** A cost account kept outside the register: its difference is expected. */ outside: boolean }

/** What bringing in creates: the input of `createAsset`, less the flags the service adds. */
export interface TakeOnDraft {
  name: string;
  assetAccountId: string;
  /** Empty when the chart has no such account: chosen when the asset is confirmed. */
  accumDeprAccountId: string;
  deprExpenseAccountId: string;
  acquisitionDate: string;
  cost: number;
  fiscalGroup: FiscalAssetGroup;
  method: "straight_line";
  usefulLifeMonths: number;
  takeOn: { accumulated: number; through?: string; mode: TakeOnMode };
  /** Mode "line": the purchase line the asset stands for (the idempotency key of lib/asset-auto.ts). */
  sourceJournalId?: string;
  sourceLineIndex?: number;
}

export interface TakeOnPlan {
  offers: TakeOnOffer[];
  /** Sum of `unregistered` over the offers: the figure of the notice on the Assets page. */
  unregisteredTotal: number;
  /** Accounts kept outside the register that are still in the chart. */
  leftOut: TakeOnLeftOut[];
  accumulated: TakeOnAccumulated[];
  /** Cost and accumulated depreciation, ledger against register, for every account with a balance on either side. */
  ledgerVsRegister: LedgerRegisterRow[];
  /** Assets to create under the choices given (the default mode of every offer when none is). */
  drafts: TakeOnDraft[];
  /** Choices that cannot be followed (one asset per line on an account where that is not possible): nothing is created for them. */
  problems: Array<{ accountId: string; message: string }>;
}

/** Posted lines of one account: totals, the debit lines of a cost account, the first posting, and the month of the last credit that is not the register's own depreciation. */
interface Tally { debit: number; credit: number; debits: TakeOnLine[]; firstDate?: string; lastCarried?: string }

/**
 * Everything the Assets page and the take-on service need, in one pass over the ledger. `choices` (by cost account
 * id) picks the mode per offer; an account without a choice takes its default mode, "skip" creates nothing for it.
 * Computing the plan again once its drafts are in the register offers nothing more.
 */
export function takeOnPlan(input: TakeOnInput, choices: Readonly<Record<string, TakeOnChoice | undefined>> = {}): TakeOnPlan {
  const { accounts, assets } = input;
  const outside = new Set(input.outside ?? []);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const posted = input.entries.filter((e) => e.status === "posted").sort((x, y) => x.date.localeCompare(y.date) || x.number.localeCompare(y.number));
  const tallies = new Map<string, Tally>();
  for (const e of posted) {
    e.lines.forEach((l, lineIndex) => {
      const t = tallies.get(l.accountId) ?? { debit: 0, credit: 0, debits: [] };
      tallies.set(l.accountId, t);
      t.debit += l.debit;
      t.credit += l.credit;
      t.firstDate ??= e.date;
      if (l.debit > 0 && byId.get(l.accountId)?.subtype === "fixed_asset") t.debits.push({ journalId: e.id, journalNumber: e.number, lineIndex, date: e.date, amount: roundMoney(l.debit), description: describe(l, e.memo) });
      // The register's own entries (monthly runs, catch-up before a disposal) are not the previous books.
      if (l.credit > 0 && e.source !== "depreciation") t.lastCarried = periodOf(e.date);
    });
  }
  const used = new Set(tallies.keys());
  // The expense account the ledger debited against each accumulated account: the one line of the entry on an expense
  // account, or, in an entry with several, the one of the same amount. Depreciation carries on there.
  const expenseUse = new Map<string, Map<string, number>>();
  for (const e of posted) {
    const expenses = e.lines.filter((l) => l.debit > 0 && byId.get(l.accountId)?.type === "expense");
    if (expenses.length === 0) continue;
    for (const c of e.lines) {
      if (!(c.credit > 0) || byId.get(c.accountId)?.subtype !== "accum_depr") continue;
      const match = expenses.length === 1 ? expenses : expenses.filter((x) => Math.abs(x.debit - c.credit) < EPS);
      if (match.length !== 1) continue;
      const use = expenseUse.get(c.accountId) ?? new Map<string, number>();
      expenseUse.set(c.accountId, use.set(match[0].accountId, (use.get(match[0].accountId) ?? 0) + c.credit));
    }
  }
  const expenseUsedWith = (accumAccountId: string): Account | undefined => [...(expenseUse.get(accumAccountId) ?? [])].sort((x, y) => y[1] - x[1]).map(([id]) => byId.get(id)).find((a) => a?.active);
  const linked = new Set(assets.map(assetKeyOf));
  const registered = { cost: new Map<string, number>(), accumulated: new Map<string, number>() };
  for (const a of assets) {
    if (a.status === "disposed") continue;
    registered.cost.set(a.assetAccountId, (registered.cost.get(a.assetAccountId) ?? 0) + a.cost);
    if (a.accumDeprAccountId) registered.accumulated.set(a.accumDeprAccountId, (registered.accumulated.get(a.accumDeprAccountId) ?? 0) + a.accumulatedDepreciation);
  }
  const ledgerCostOf = (id: string) => roundMoney((tallies.get(id)?.debit ?? 0) - (tallies.get(id)?.credit ?? 0));
  const registeredCostOf = (id: string) => roundMoney(registered.cost.get(id) ?? 0);

  // Accumulated depreciation: ledger against register, per account.
  const accumulated: TakeOnAccumulated[] = [];
  const accumIds = new Set([...accounts.filter((a) => a.subtype === "accum_depr").map((a) => a.id), ...registered.accumulated.keys()]);
  for (const id of accumIds) {
    const account = byId.get(id);
    if (!account) continue;
    const t = tallies.get(id);
    const ledgerAccumulated = roundMoney((t?.credit ?? 0) - (t?.debit ?? 0));
    const registeredAccumulated = roundMoney(registered.accumulated.get(id) ?? 0);
    accumulated.push({ accountId: id, code: account.code, name: account.name, ledgerAccumulated, registeredAccumulated, difference: roundMoney(ledgerAccumulated - registeredAccumulated), through: t?.lastCarried });
  }
  accumulated.sort(byCode);
  const accumOf = new Map(accumulated.map((a) => [a.accountId, a]));

  // Cost: what the register lacks, per account.
  const pairs = pairAccumulatedAccounts(accounts, used);
  const offers: TakeOnOffer[] = [];
  const leftOut: TakeOnLeftOut[] = [];
  for (const account of accounts.filter((a) => a.subtype === "fixed_asset").sort(byCode)) {
    const ledgerCost = ledgerCostOf(account.id);
    const registeredCost = registeredCostOf(account.id);
    if (outside.has(account.id)) { leftOut.push({ accountId: account.id, code: account.code, name: account.name, ledgerCost, registeredCost }); continue; }
    const unregistered = roundMoney(ledgerCost - registeredCost);
    if (unregistered < EPS) continue;
    const t = tallies.get(account.id);
    const lines = (t?.debits ?? []).filter((l) => !linked.has(assetSourceKey(l.journalId, l.lineIndex)));
    const credits = roundMoney(t?.credit ?? 0);
    const accountOnly = lines.length === 0 ? "no purchase line is left without an asset"
      : lines.length > TAKE_ON_MAX_LINES ? `${lines.length} purchase lines`
      : credits >= EPS ? "the account also has credit lines"
      : Math.abs(roundMoney(lines.reduce((s, l) => s + l.amount, 0)) - unregistered) >= EPS ? "the purchase lines do not add up to the amount missing from the register"
      : undefined;
    const pair = pairs.get(account.id);
    offers.push({
      accountId: account.id, code: account.code, name: account.name, ledgerCost, registeredCost, unregistered, lines, credits,
      lineAllowed: !accountOnly, accountOnly, defaultMode: accountOnly ? "account" : "line", accumAccountId: pair?.account.id ?? "", pairedBy: pair?.by, accumulated: 0,
    });
  }

  // A description carried by purchase lines of two cost accounts in one entry describes the entry, not an asset.
  const describedIn = new Map<string, Set<string>>();
  for (const account of accounts) {
    if (account.subtype !== "fixed_asset") continue;
    for (const l of tallies.get(account.id)?.debits ?? []) {
      const key = `${l.journalId}|${sameText(l.description)}`;
      describedIn.set(key, (describedIn.get(key) ?? new Set()).add(account.id));
    }
  }
  const lineName = (l: TakeOnLine, account: Account) => (!l.description || GENERIC_DESCRIPTION.test(l.description) || (describedIn.get(`${l.journalId}|${sameText(l.description)}`)?.size ?? 0) > 1 ? account.name : l.description);

  // The assets each offer becomes under its choice.
  const drafts: TakeOnDraft[] = [];
  const problems: TakeOnPlan["problems"] = [];
  for (const offer of offers) {
    const choice = choices[offer.accountId] ?? offer.defaultMode;
    if (choice === "skip") continue;
    if (choice === "line" && !offer.lineAllowed) { problems.push({ accountId: offer.accountId, message: `One asset per purchase line is not possible for ${offer.code} ${offer.name} (${offer.accountOnly}): bring it in as one asset for the account.` }); continue; }
    const account = byId.get(offer.accountId)!;
    const fiscalGroup = guessFiscalGroup(account);
    const common = {
      assetAccountId: account.id, accumDeprAccountId: offer.accumAccountId, deprExpenseAccountId: (expenseUsedWith(offer.accumAccountId) ?? pairedExpenseAccount(account, accounts))?.id ?? "",
      fiscalGroup, method: "straight_line" as const, usefulLifeMonths: defaultUsefulLifeMonths(fiscalGroup),
    };
    if (choice === "line") {
      // Named after the purchase line when it says what was bought, else after the account.
      const names = numbered(offer.lines.map((l) => lineName(l, account)));
      offer.lines.forEach((l, i) => drafts.push({ ...common, name: names[i].slice(0, 160), acquisitionDate: l.date, cost: l.amount, takeOn: { accumulated: 0, mode: "line" }, sourceJournalId: l.journalId, sourceLineIndex: l.lineIndex }));
    } else {
      // The earliest purchase still without an asset dates the account's asset; the first posting when none is left.
      const acquisitionDate = offer.lines[0]?.date ?? tallies.get(account.id)?.firstDate ?? "";
      drafts.push({ ...common, name: account.name.slice(0, 160), acquisitionDate, cost: offer.unregistered, takeOn: { accumulated: 0, mode: "account" } });
    }
  }

  // Accumulated depreciation the ledger carries beyond the register, shared among the new assets paired with each account.
  for (const accum of accumulated) {
    const mine = drafts.filter((d) => d.accumDeprAccountId === accum.accountId);
    const through = accum.through;
    if (mine.length === 0 || !through || accum.difference < EPS) continue;
    // An asset bought after the last depreciation the previous books posted cannot have a share of it.
    const weights = mine.map((d) => (periodOf(d.acquisitionDate) <= through ? d.cost : 0));
    shareProRata(accum.difference, weights).forEach((share, i) => { if (share >= EPS) mine[i].takeOn = { ...mine[i].takeOn, accumulated: share, through }; });
  }
  for (const offer of offers) {
    const mine = drafts.filter((d) => d.assetAccountId === offer.accountId);
    offer.accumulated = roundMoney(mine.reduce((s, d) => s + d.takeOn.accumulated, 0));
    offer.through = mine.find((d) => d.takeOn.through)?.takeOn.through;
  }

  // Ledger against register, for the check on the Assets page.
  const ledgerVsRegister: LedgerRegisterRow[] = [];
  const costIds = new Set([...accounts.filter((a) => a.subtype === "fixed_asset").map((a) => a.id), ...registered.cost.keys()]);
  for (const id of costIds) {
    const account = byId.get(id);
    if (!account) continue;
    const ledger = ledgerCostOf(id), register = registeredCostOf(id);
    if (Math.abs(ledger) >= EPS || Math.abs(register) >= EPS) ledgerVsRegister.push({ kind: "cost", accountId: id, code: account.code, name: account.name, ledger, register, difference: roundMoney(ledger - register), outside: outside.has(id) });
  }
  ledgerVsRegister.sort(byCode);
  for (const a of accumulated) {
    if (Math.abs(a.ledgerAccumulated) >= EPS || Math.abs(a.registeredAccumulated) >= EPS) ledgerVsRegister.push({ kind: "accumulated", accountId: a.accountId, code: a.code, name: a.name, ledger: a.ledgerAccumulated, register: a.registeredAccumulated, difference: a.difference, outside: false });
  }

  return { offers, unregisteredTotal: roundMoney(offers.reduce((s, o) => s + o.unregistered, 0)), leftOut, accumulated, ledgerVsRegister, drafts, problems };
}

// ---------- Messages ----------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The line shown after a take-on ("3 fixed assets brought into the Assets register for review"), "" when nothing was created. */
export function takeOnNote(created: number): string {
  return created > 0 ? `${plural(created, "fixed asset")} brought into the Assets register for review` : "";
}
