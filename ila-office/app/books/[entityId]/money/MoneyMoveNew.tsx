import Link from "next/link";
import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { entityAccounts } from "@/lib/books";
import { fmtDate, todayISO } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import type { MoneyMoveKind } from "@/lib/money-moves";
import { Notice } from "@/components/ui";
import { ErrorNotice, base, first, requireEntity, type Params, type Search } from "../shared";
import { MONEY_MOVE_META, counterAccountOptions, moneyMoveBase } from "./shared";
import { MoneyMoveForm, type Prefill } from "./MoneyMoveForm";

/** "New expense" / "New deposit" page; `?tx=<bankTransactionId>` prefills the form from a statement line and links it. */
export async function MoneyMoveNewPage({ kind, action, params, searchParams }: { kind: MoneyMoveKind; action: (entityId: string, fd: FormData) => Promise<void>; params: Params; searchParams: Search }) {
  await requirePermission("books:write");
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const meta = MONEY_MOVE_META[kind];
  const other = MONEY_MOVE_META[kind === "expense" ? "deposit" : "expense"];
  const b = base(entityId);
  const here = moneyMoveBase(entityId, kind);
  const [accounts, banksAll] = await Promise.all([entityAccounts(entityId), db.list("bank_accounts", { where: { entityId, active: true }, orderBy: "name" })]);
  const banks = banksAll.map(({ id, name, currency, accountId }) => ({ id, name, currency, accountId }));
  const txId = first(sp.tx);
  let prefill: Prefill | undefined;
  let notice: ReactNode;
  let tone: "amber" | "red" | "blue" = "blue";
  if (txId) {
    const tx = await db.get("bank_transactions", txId);
    if (!tx || tx.entityId !== entityId) { notice = "The bank statement line was not found."; tone = "red"; }
    else if (tx.status !== "unmatched") { notice = <>This statement line is already {tx.status}. <Link href={`${b}/bank/${tx.bankAccountId}?status=${tx.status}`} className="underline">Open the bank account</Link>.</>; tone = "amber"; }
    else if (kind === "expense" ? tx.amount > 0 : tx.amount < 0) { notice = <>This statement line is money {tx.amount > 0 ? "in" : "out"}: <Link href={`${b}/${other.seg}/new?tx=${tx.id}`} className="underline">record it as a {other.label.toLowerCase()}</Link> instead.</>; tone = "amber"; }
    else {
      const bank = banksAll.find((x) => x.id === tx.bankAccountId);
      const def = kind === "expense" ? accounts.find((a) => a.code === "6-2000" && a.active) : accounts.find((a) => a.subtype === "other_income" && a.active);
      prefill = { bankTransactionId: tx.id, bankAccountId: tx.bankAccountId, date: tx.date, amount: Math.abs(tx.amount), memo: tx.description.slice(0, 300), reference: tx.reference, accountId: def?.id };
      notice = <>From the statement line of {fmtDate(tx.date)} on {bank?.name ?? "the bank account"}: {tx.description} · {fmtMoney(Math.abs(tx.amount), bank?.currency ?? "IDR")}. The line is matched to this {meta.label.toLowerCase()} once it is posted; check the account and adjust the memo.</>;
    }
  }
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} />
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold">{meta.newLabel}</h2><Link href={here} className="text-xs text-brand-600 underline">Back to {meta.plural.toLowerCase()}</Link></div>
      {notice && <Notice tone={tone}>{notice}</Notice>}
      {banks.length === 0 ? <Notice tone="amber">Add a <Link href={`${b}/bank`} className="underline">bank or cash account</Link> first.</Notice> : (
        <MoneyMoveForm kind={kind} action={action.bind(null, entityId)} banks={banks} accounts={counterAccountOptions(accounts, kind)} defaultDate={todayISO()} prefill={prefill} />
      )}
      <p className="text-xs text-ink-500">{meta.hint}</p>
    </div>
  );
}
