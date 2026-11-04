import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { periodOf } from "@/lib/dates";
import { num, str, rateOf } from "@/lib/util";
import { isMoneyMove, recordMoneyMove, voidMoneyMove, type MoneyMoveInput, type MoneyMoveKind } from "@/lib/money-moves";
import type { Account, AccountType, Payment, TaxTag } from "@/lib/types";
import type { AccountOption } from "@/components/AccountPicker";
import { act, base } from "../shared";

/**
 * Shared by the Expenses and Deposits routes (server side, not a "use server" module): labels, loaders, form
 * parsing and the bodies of the server actions that each route's actions.ts wraps.
 */

export interface MoneyMoveMeta {
  kind: MoneyMoveKind; label: string; plural: string; seg: string; paymentKind: Payment["kind"];
  /** Column / field label for the other party. */
  party: string;
  newLabel: string; txButton: string; hint: string; emptyHint: string;
}

export const MONEY_MOVE_META: Record<MoneyMoveKind, MoneyMoveMeta> = {
  expense: {
    kind: "expense", label: "Expense", plural: "Expenses", seg: "expenses", paymentKind: "disbursement", party: "Payee", newLabel: "New expense", txButton: "Record as expense",
    hint: "Money paid straight from a bank or cash account with no bill behind it: bank charges, loan repayments, tax payments, owner drawings. Bill payments are recorded from Purchases, customer receipts from Sales. A withholding tax (PPh 21/23/26/4(2)) deducted from the payment goes on a negative line to the PPh payable account; the bank line is the net amount.",
    emptyHint: "Record bank charges, loan repayments, tax payments and other outgoings paid without a bill.",
  },
  deposit: {
    kind: "deposit", label: "Deposit", plural: "Deposits", seg: "deposits", paymentKind: "receipt", party: "Received from", newLabel: "New deposit", txButton: "Record as deposit",
    hint: "Money received that is not a customer payment: capital contributions, loans received, bank interest, refunds. Customer receipts are recorded from Sales, bill payments from Purchases.",
    emptyHint: "Record capital contributions, loans received, bank interest and other money in that is not a customer payment.",
  },
};

export function moneyMoveBase(entityId: string, kind: MoneyMoveKind): string {
  return `${base(entityId)}/${MONEY_MOVE_META[kind].seg}`;
}

/** Expense accounts are offered on a deposit too, for a charge deducted from the money received (a negative line). */
export function counterAccountTypes(kind: MoneyMoveKind): AccountType[] {
  return kind === "expense" ? ["expense", "asset", "liability", "equity"] : ["revenue", "liability", "equity", "asset", "expense"];
}

/** Active accounts of the types that make sense as counter accounts; the form also hides the chosen bank's own GL account. */
export function counterAccountOptions(accounts: Account[], kind: MoneyMoveKind): AccountOption[] {
  const types = counterAccountTypes(kind);
  return accounts.filter((a) => a.active && types.includes(a.type)).map(({ id, code, name, type, subtype }) => ({ id, code, name, type, subtype }));
}

/** The PPh payable accounts the "+ PPh withheld" button can post to, in the order the form offers them; the rate is the usual one (0 when it depends on the case). */
const WITHHOLDING_TAGS: Array<{ tag: TaxTag; label: string; rate: number }> = [
  { tag: "pph23_payable", label: "PPh 23 (2%)", rate: 0.02 },
  { tag: "pph21_payable", label: "PPh 21", rate: 0 },
  { tag: "pph26_payable", label: "PPh 26 (20%)", rate: 0.2 },
  { tag: "pph4_2_payable", label: "PPh 4(2) final (10%)", rate: 0.1 },
];

/** Withholding options for an expense form: only the tagged accounts present and active in the entity's chart. */
export function withholdingLineOptions(accounts: Account[]): Array<{ accountId: string; label: string; rate: number }> {
  return WITHHOLDING_TAGS.flatMap(({ tag, label, rate }) => {
    const a = accounts.find((x) => x.active && x.taxTag === tag);
    return a ? [{ accountId: a.id, label, rate }] : [];
  });
}

/** Expenses or deposits of one entity, newest first (bill payments, invoice receipts and transfers are left out). */
export async function listMoneyMoves(entityId: string, kind: MoneyMoveKind): Promise<Payment[]> {
  const rows = await db.list("payments", { where: { entityId, kind: MONEY_MOVE_META[kind].paymentKind } });
  return rows.filter(isMoneyMove).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** Months offered by the list filter: every month with an entry plus the current one, newest first. */
export function monthOptions(rows: Payment[], current: string): string[] {
  return [...new Set([current, ...rows.map((p) => periodOf(p.date))])].sort().reverse();
}

const lineSchema = z.object({
  accountId: z.string().min(1, "Every line needs an account"),
  description: z.string().max(200).optional(),
  // Negative for a withholding tax or a deduction (the bank line is the net); lib/money-moves checks the total.
  amount: z.number().refine((v) => v !== 0, "Amounts must not be zero"),
});
const schema = z.object({
  bankAccountId: z.string().min(1, "Choose a bank or cash account"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  payee: z.string().max(160).optional(),
  memo: z.string().min(1, "Memo is required").max(300),
  reference: z.string().max(120).optional(),
  method: z.enum(["transfer", "cash", "card", "other"]).optional(),
  fxRate: z.number().min(0).optional(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
  bankTransactionId: z.string().optional(),
});

/** Reads the MoneyMoveForm submission: plain fields plus the `lines` JSON the form keeps in a hidden input. */
export function readMoneyMoveForm(kind: MoneyMoveKind, fd: FormData): MoneyMoveInput {
  let lines: unknown;
  try { lines = JSON.parse(String(fd.get("lines") ?? "[]")); } catch { throw new Error("Lines could not be read."); }
  const v = schema.parse({
    bankAccountId: str(fd, "bankAccountId"), date: str(fd, "date"), payee: str(fd, "payee"), memo: str(fd, "memo"), reference: str(fd, "reference"),
    method: str(fd, "method"), fxRate: rateOf(fd, "fxRate") || undefined, lines, bankTransactionId: str(fd, "bankTransactionId"),
  });
  return { kind, ...v };
}

/** Body of the create action: posts the entry and lands on its detail page, or back on the form with `?error=`. */
export async function createMoneyMove(kind: MoneyMoveKind, entityId: string, fd: FormData): Promise<never> {
  const tx = str(fd, "bankTransactionId");
  const to = moneyMoveBase(entityId, kind);
  const meta = MONEY_MOVE_META[kind];
  return act(entityId, async () => {
    const user = await requirePermission("books:write");
    const r = await recordMoneyMove(entityId, readMoneyMoveForm(kind, fd), user.id);
    return `${to}/${r.payment.id}?ok=${encodeURIComponent(`${meta.label} recorded: ${r.journal.number} posted${tx ? " and the statement line matched" : ""}`)}`;
  }, `${to}/new${tx ? `?tx=${encodeURIComponent(tx)}` : ""}`);
}

/** Body of the void action. */
export async function voidMoneyMoveFromPage(kind: MoneyMoveKind, entityId: string, paymentId: string): Promise<never> {
  const to = `${moneyMoveBase(entityId, kind)}/${paymentId}`;
  const meta = MONEY_MOVE_META[kind];
  return act(entityId, async () => {
    await requirePermission("books:write");
    await voidMoneyMove(entityId, paymentId);
    return `${to}?ok=${encodeURIComponent(`${meta.label} voided: its journal entry is void and any matched statement line is unmatched again`)}`;
  }, to);
}
