/**
 * QuickBooks → ILA Office, one company at a time: the pure rules behind the wizard at Settings → Import → Migrate a
 * company from QuickBooks. Which of the uploaded reports does what and in which order (`migrationRules`), how the
 * uploads are cut into requests (`uploadBatches`), and the proof at the end: the app's trial balance compared with
 * the QuickBooks one, account by account (`compareTrialBalance`). No I/O: lib/qbo-migration-services.ts reads and
 * writes the store, and the browser imports the labels and limits from here.
 */
import { accountBalances } from "./balances";
import { roundMoney } from "./money";
import { accountResolver, type QboReportKind } from "./importers";
import type { Account, JournalEntry, QboMigration } from "./types";

export const QBO_KIND_LABELS: Record<QboReportKind, string> = {
  accounts: "Account List", journal: "Journal (complete history)", trial_balance: "Trial Balance", general_ledger: "General Ledger (not supported)",
  invoices: "Invoice List / Open Invoices", bills: "Unpaid Bills / Bill list", customers: "Customer Contact List", vendors: "Vendor (Supplier) Contact List", unknown: "Not recognised (ignored)",
};
/** The order the files are applied in: the chart first, then the ledger, then the directories, then the documents. */
export const QBO_KIND_ORDER: QboReportKind[] = ["accounts", "journal", "trial_balance", "vendors", "customers", "invoices", "bills"];
export const isImportableKind = (kind: QboReportKind): boolean => QBO_KIND_ORDER.includes(kind);
/** Why a recognised file is left aside, and what to export instead. */
export const QBO_NOT_IMPORTED: Partial<Record<QboReportKind, string>> = {
  general_ledger: "The General Ledger report is not read: export the Journal report instead (Reports › Journal, report period All Dates). It lists the same transactions with both sides of every entry.",
  unknown: "Not one of the reports the migration reads. Pick its kind by hand if this is a mistake, or remove it.",
};

/** Vercel refuses a request body over 4.5 MB: one file, and one upload request, stay under 4 MB. */
export const QBO_MAX_FILE_BYTES = 4 * 1024 * 1024;
/** Rows read per sheet (passed to lib/statement-file.ts); a file that reaches it would be cut, so it is refused. About 20,000 transactions: a full year of a busy company. */
export const QBO_MAX_ROWS = 60_000;
export const QBO_TOO_LARGE = "is larger than 4 MB: in QuickBooks export one year at a time (Report period: custom dates), or save the file as CSV, and upload the parts together.";

/** Groups file sizes into upload requests of at most `maxBytes` each, keeping the order (indexes into `sizes`). A file over the limit is left out: the caller rejects it. */
export function uploadBatches(sizes: number[], maxBytes = QBO_MAX_FILE_BYTES): number[][] {
  const out: number[][] = [];
  let current: number[] = [], total = 0;
  sizes.forEach((size, i) => {
    if (size > maxBytes) return;
    if (current.length && total + size > maxBytes) { out.push(current); current = []; total = 0; }
    current.push(i); total += size;
  });
  if (current.length) out.push(current);
  return out;
}

// ---------- One plan, right order ----------

export interface MigrationRules {
  /**
   * history: the Journal is posted in full. opening: no Journal, the Trial Balance becomes the opening entry. check:
   * the ledger was migrated by an earlier run, a Trial Balance alone is only compared. documents: nothing reaches
   * the ledger.
   */
  mode: "history" | "opening" | "check" | "documents" | "empty";
  postJournal: boolean;
  /** The Trial Balance is posted as one opening entry (only without a Journal). */
  postOpening: boolean;
  /** The Trial Balance is compared with the books after the import. */
  check: boolean;
  /** Invoices and bills never post from the wizard: the Journal or the opening balances already carry them. */
  documentsPostToLedger: false;
  notes: string[];
}

/**
 * The rules of the combined plan, from the kinds of the files given. With a Journal the complete history is posted
 * and the Trial Balance is NOT posted: it is the check. Without a Journal the Trial Balance is the opening entry at
 * the cut-over date, unless an earlier run already migrated the ledger (`ledgerMigrated`: a journal history, or
 * opening balances at another date, is in the books): then it is only compared, never posted on top. Either way open
 * invoices and bills become documents without a posting of their own, so receivables and payables are collected and
 * paid in the app without being counted twice.
 */
export function migrationRules(kinds: QboReportKind[], state: { ledgerMigrated?: boolean } = {}): MigrationRules {
  const has = (k: QboReportKind) => kinds.includes(k);
  const docs = has("invoices") || has("bills");
  const notes: string[] = [];
  if (has("journal")) {
    notes.push("The Journal is posted in full: one journal entry per QuickBooks transaction (date, type, number, name, memo, account lines).");
    notes.push(has("trial_balance") ? "The Trial Balance is not posted (the Journal already carries every balance): it is used to check the result against QuickBooks." : "No Trial Balance was given: add one (as of the last day you used QuickBooks) to prove the result equals QuickBooks.");
    if (docs) notes.push("Invoices and bills are already in the ledger through the Journal: the ones listed in the Invoice List / Unpaid Bills files are created as documents without a new posting, so they can be collected and paid here without double counting.");
    return { mode: "history", postJournal: true, postOpening: false, check: has("trial_balance"), documentsPostToLedger: false, notes };
  }
  if (has("trial_balance") && state.ledgerMigrated) {
    notes.push("The ledger of this company was already migrated from QuickBooks by an earlier import: the Trial Balance is not posted, it is compared with the books.");
    if (docs) notes.push("Invoices and bills are created as documents without a posting: the ledger already carries them.");
    return { mode: "check", postJournal: false, postOpening: false, check: true, documentsPostToLedger: false, notes };
  }
  if (has("trial_balance")) {
    notes.push("No Journal was given: the Trial Balance is posted as one opening entry at its date (the cut-over), and the QuickBooks history stays in QuickBooks.");
    if (docs) notes.push("Open invoices and bills are created as documents without a posting: the opening balances already include receivables and payables.");
    return { mode: "opening", postJournal: false, postOpening: true, check: true, documentsPostToLedger: false, notes };
  }
  if (kinds.some(isImportableKind)) {
    notes.push("Neither a Journal nor a Trial Balance was given: nothing is posted to the ledger. Add the Journal (complete history) or the Trial Balance (opening balances).");
    if (docs) notes.push("Invoices and bills are created as documents without a posting.");
    return { mode: "documents", postJournal: false, postOpening: false, check: false, documentsPostToLedger: false, notes };
  }
  return { mode: "empty", postJournal: false, postOpening: false, check: false, documentsPostToLedger: false, notes };
}

// ---------- Proof: the app's trial balance against QuickBooks ----------

export interface TbCheckRow {
  /** Our account; absent when the QuickBooks account is not in the chart. */
  accountId?: string;
  code: string;
  name: string;
  /** QuickBooks accounts summed into this row. */
  qboNames: string[];
  /** Net balances, debit positive and credit negative. */
  qbo: number;
  app: number;
  /** app − qbo. */
  difference: number;
}

export interface TbCheck {
  asOf: string;
  /** Income and expense accounts are summed from this day; what they earned before sits in retained earnings, as QuickBooks reports it. */
  plFrom?: string;
  rows: TbCheckRow[];
  /** Rows compared, and how many differ. */
  accounts: number;
  differences: number;
  /** Every difference is zero (and there was something to compare). */
  matches: boolean;
  qboDebit: number; qboCredit: number; appDebit: number; appCredit: number;
}

type LedgerEntry = Pick<JournalEntry, "status" | "date" | "lines">;

/**
 * Compares the books with a QuickBooks trial balance as of `asOf`, per account. QuickBooks never posts a year-end
 * close: its trial balance shows income and expense accounts for the current financial year only and adds the result
 * of the years before to Retained Earnings. With `plFrom` (the first day of that financial year) the app's figures
 * are laid out the same way, from the same posted entries; without it every account is cumulative. QuickBooks
 * accounts are matched to ours like the imports do (stored QBO name, then name); several on one of ours are summed.
 */
export function compareTrialBalance(input: { rows: Array<{ account: string; debit: number; credit: number }>; accounts: Account[]; entries: LedgerEntry[]; asOf: string; plFrom?: string }): TbCheck {
  const { accounts, asOf, plFrom } = input;
  const entries = input.entries as JournalEntry[];
  const resolve = accountResolver(accounts);
  const rows = new Map<string, TbCheckRow>();
  const rowOf = (a: Account): TbCheckRow => {
    let r = rows.get(a.id);
    if (!r) { r = { accountId: a.id, code: a.code, name: a.name, qboNames: [], qbo: 0, app: 0, difference: 0 }; rows.set(a.id, r); }
    return r;
  };
  let retained: Account | undefined;
  for (const q of input.rows) {
    const a = resolve(q.account);
    const net = roundMoney(q.debit) - roundMoney(q.credit);
    if (a) {
      const r = rowOf(a);
      r.qbo += net; r.qboNames.push(q.account);
      if (!retained && a.subtype === "retained_earnings") retained = a;
    } else {
      const key = `qbo:${q.account}`;
      const r = rows.get(key) ?? { code: "", name: q.account, qboNames: [q.account], qbo: 0, app: 0, difference: 0 };
      r.qbo += net;
      rows.set(key, r);
    }
  }
  retained = retained ?? accounts.find((a) => a.taxTag === "retained_earnings" && a.active) ?? accounts.find((a) => a.subtype === "retained_earnings");
  const all = accountBalances(entries, { to: asOf });
  const before = plFrom ? accountBalances(entries.filter((e) => e.date < plFrom), { to: asOf }) : new Map<string, { net: number }>();
  let priorEarnings = 0; // debit positive: a profit of earlier years is a credit, so negative here
  for (const a of accounts) {
    let net = all.get(a.id)?.net ?? 0;
    if (plFrom && (a.type === "revenue" || a.type === "expense")) { const prior = before.get(a.id)?.net ?? 0; priorEarnings += prior; net -= prior; }
    if (roundMoney(net) !== 0) rowOf(a).app += net;
  }
  if (roundMoney(priorEarnings) !== 0) {
    if (retained) rowOf(retained).app += priorEarnings;
    else rows.set("prior", { code: "", name: "Retained earnings (result of earlier years)", qboNames: [], qbo: 0, app: priorEarnings, difference: 0 });
  }
  const out: TbCheckRow[] = [];
  let qboDebit = 0, qboCredit = 0, appDebit = 0, appCredit = 0;
  for (const r of rows.values()) {
    r.qbo = roundMoney(r.qbo); r.app = roundMoney(r.app); r.difference = roundMoney(r.app - r.qbo);
    if (r.qbo === 0 && r.app === 0) continue;
    if (r.qbo > 0) qboDebit += r.qbo; else qboCredit -= r.qbo;
    if (r.app > 0) appDebit += r.app; else appCredit -= r.app;
    out.push(r);
  }
  out.sort((x, y) => (x.code ? 0 : 1) - (y.code ? 0 : 1) || x.code.localeCompare(y.code) || x.name.localeCompare(y.name)); // by code; QuickBooks accounts we do not have last
  const differences = out.filter((r) => r.difference !== 0).length;
  return {
    asOf, plFrom, rows: out, accounts: out.length, differences, matches: differences === 0 && input.rows.length > 0,
    qboDebit: roundMoney(qboDebit), qboCredit: roundMoney(qboCredit), appDebit: roundMoney(appDebit), appCredit: roundMoney(appCredit),
  };
}

/**
 * Runs the comparison once per candidate start of the financial year and keeps the layout with the fewest
 * differences (the first candidate wins a tie). QuickBooks' own layout depends on the report period chosen at export
 * (a date range, "as of" the year to date, or all dates), which the file does not always say.
 */
export function bestTrialBalanceCheck(input: Omit<Parameters<typeof compareTrialBalance>[0], "plFrom">, candidates: Array<string | undefined>): TbCheck {
  let best: TbCheck | undefined;
  for (const plFrom of candidates.filter((c, i) => candidates.indexOf(c) === i)) {
    const check = compareTrialBalance({ ...input, plFrom });
    if (!best || check.differences < best.differences) best = check;
  }
  return best ?? compareTrialBalance(input);
}

// ---------- Status ----------

export type MigrationState = "not_started" | QboMigration["status"];
export const MIGRATION_STATE_LABELS: Record<MigrationState, string> = { not_started: "Not started", in_progress: "In progress", checked_ok: "Checked OK", differences: "Differences to review" };
export const migrationState = (m: QboMigration | null | undefined): MigrationState => m?.status ?? "not_started";
