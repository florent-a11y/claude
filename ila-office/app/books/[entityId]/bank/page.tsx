import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountBalances, naturalBalance } from "@/lib/balances";
import { entityAccounts, entityEntries } from "@/lib/books";
import { todayISO, fmtDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Card, Field, Select, Money, EmptyState, Badge } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ErrorNotice, accountOptions, base, first, requireEntity, type Params, type Search } from "../shared";
import { createBankAccountAction, transferAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Bank({ params, searchParams }: { params: Params; searchParams: Search }) {
  const user = await requireUser();
  const { entityId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const [banks, accounts, entries, txs] = await Promise.all([db.list("bank_accounts", { where: { entityId }, orderBy: "name" }), entityAccounts(entityId), entityEntries(entityId), db.list("bank_transactions", { where: { entityId } })]);
  const bal = accountBalances(entries);
  const writable = can(user, "books:write");
  const b = base(entityId);
  const glOptions = accountOptions(accounts, (a) => (a.subtype === "bank" || a.subtype === "cash") && !banks.some((x) => x.accountId === a.id));
  const rows = banks.map((bk) => {
    const gl = accounts.find((a) => a.id === bk.accountId);
    const mine = txs.filter((t) => t.bankAccountId === bk.id);
    const last = mine.reduce<typeof mine[number] | undefined>((m, t) => (!m || t.date > m.date ? t : m), undefined);
    return { bk, gl, balance: gl ? naturalBalance(gl, bal.get(gl.id)) : 0, unmatched: mine.filter((t) => t.status === "unmatched").length, count: mine.length, last };
  });
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {rows.length === 0 ? <EmptyState title="No bank account yet" hint="Add the entity's bank and cash accounts, then import statements (OCBC, Mandiri, BNI, Aspire, Xendit CSV) to reconcile." /> : (
            <Card className="overflow-x-auto !p-0">
              <table className="table">
                <thead><tr><th className="pl-4">Account</th><th>GL</th><th>Ccy</th><th className="num">GL balance (IDR)</th><th className="num">Lines</th><th className="num">Unmatched</th><th>Last line</th><th></th></tr></thead>
                <tbody>
                  {rows.map(({ bk, gl, balance, unmatched, count, last }) => (
                    <tr key={bk.id} className={bk.active ? "" : "opacity-60"}>
                      <td className="pl-4 font-medium"><Link href={`${b}/bank/${bk.id}`} className="hover:underline">{bk.name}</Link><span className="block text-xs text-ink-500">{[bk.bankName, bk.accountNumber].filter(Boolean).join(" · ")}</span></td>
                      <td className="text-xs">{gl ? `${gl.code} ${gl.name}` : "—"}</td>
                      <td>{bk.currency}</td>
                      <td className="num"><Money amount={balance} /></td>
                      <td className="num">{count}</td>
                      <td className="num">{unmatched > 0 ? <Badge tone="amber">{unmatched}</Badge> : "0"}</td>
                      <td className="text-xs">{last ? `${fmtDate(last.date)}${last.balance !== undefined ? ` · bal ${fmtMoney(last.balance, bk.currency)}` : ""}` : "—"}</td>
                      <td className="whitespace-nowrap text-xs"><Link href={`${b}/bank/${bk.id}/import`} className="text-brand-600 underline">Import CSV</Link> · <Link href={`${b}/bank/${bk.id}?status=unmatched`} className="text-brand-600 underline">Reconcile</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {writable && banks.filter((x) => x.active).length >= 2 && (
            <Card title="Transfer between accounts">
              <form action={transferAction.bind(null, entityId)} className="grid gap-3 md:grid-cols-3">
                <Field label="From"><Select name="fromBankAccountId" options={banks.filter((x) => x.active).map((x) => ({ value: x.id, label: `${x.name} (${x.currency})` }))} /></Field>
                <Field label="To"><Select name="toBankAccountId" defaultValue={banks.filter((x) => x.active)[1]?.id} options={banks.filter((x) => x.active).map((x) => ({ value: x.id, label: `${x.name} (${x.currency})` }))} /></Field>
                <Field label="Date"><input name="date" type="date" defaultValue={todayISO()} className="input" required /></Field>
                <Field label="Amount sent"><input name="amount" inputMode="decimal" className="input text-right" required /></Field>
                <Field label="Currency of amount"><Select name="currency" defaultValue="IDR" options={["IDR", "USD", "EUR", "HKD", "SGD", "AUD", "GBP"]} /></Field>
                <Field label="FX rate (IDR per unit, non-IDR)"><input name="fxRate" inputMode="decimal" className="input" placeholder="1" /></Field>
                <Field label="IDR received (optional, cross-currency)" hint="Leave blank when both sides are the same currency."><input name="toAmountIDR" inputMode="decimal" className="input text-right" /></Field>
                <Field label="Bank fee (IDR)"><input name="feeIDR" inputMode="decimal" className="input text-right" placeholder="0" /></Field>
                <Field label="Reference"><input name="reference" className="input" /></Field>
                <div className="md:col-span-3"><SubmitButton>Post transfer</SubmitButton></div>
              </form>
            </Card>
          )}
        </div>
        {writable && (
          <Card title="Add bank or cash account" className="h-fit">
            <form action={createBankAccountAction.bind(null, entityId)} className="space-y-3">
              <Field label="Name"><input name="name" className="input" required placeholder="OCBC IDR operating" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bank"><input name="bankName" className="input" placeholder="OCBC / Mandiri / BNI / Aspire / Xendit" /></Field>
                <Field label="Account number"><input name="accountNumber" className="input" /></Field>
                <Field label="Currency"><Select name="currency" defaultValue="IDR" options={["IDR", "USD", "EUR", "HKD", "SGD", "AUD", "GBP"]} /></Field>
                <Field label="Opening date"><input name="openingDate" type="date" className="input" /></Field>
              </div>
              <Field label="GL account" hint="Pick an unused bank/cash account or create one."><Select name="accountId" defaultValue={glOptions[0]?.value ?? "__new__"} options={[...glOptions, { value: "__new__", label: "+ Create a new GL account" }]} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="New GL code (if creating)"><input name="newCode" className="input" placeholder="1-1120" pattern="\d-\d{4}" /></Field>
                <Field label="New GL subtype"><Select name="newSubtype" defaultValue="bank" options={["bank", "cash"]} /></Field>
              </div>
              <SubmitButton>Add account</SubmitButton>
              <p className="text-xs text-ink-500">Opening balances are posted with a manual journal (Dr bank / Cr opening balance equity or retained earnings).</p>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
