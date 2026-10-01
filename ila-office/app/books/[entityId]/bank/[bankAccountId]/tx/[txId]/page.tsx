import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { entityAccounts, openInvoices, openBills } from "@/lib/books";
import { invoiceOutstanding, billOutstanding } from "@/lib/ledger";
import { fmtDate } from "@/lib/dates";
import { fmtMoney, roundMoney } from "@/lib/money";
import { Card, Badge, DL, Field, Select, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ErrorNotice, accountOptions, base, first, requireEntity, type Search } from "../../../../shared";
import { matchAction, postBankTxAction, linkJournalAction, excludeTxAction } from "../../../actions";

export const dynamic = "force-dynamic";

/** Reconciliation screen for one statement line: suggested documents, any open document, quick journal, link, exclude. */
export default async function MatchTransaction({ params, searchParams }: { params: Promise<{ entityId: string; bankAccountId: string; txId: string }>; searchParams: Search }) {
  const user = await requireUser();
  const { entityId, bankAccountId, txId } = await params;
  const sp = await searchParams;
  await requireEntity(entityId);
  const [bank, tx] = await Promise.all([db.get("bank_accounts", bankAccountId), db.get("bank_transactions", txId)]);
  if (!bank || bank.entityId !== entityId || !tx || tx.entityId !== entityId || tx.bankAccountId !== bank.id) notFound();
  const b = base(entityId);
  const listHref = `${b}/bank/${bank.id}`;
  if (tx.status === "matched") redirect(`${listHref}?status=matched`);
  const writable = can(user, "books:write");
  const moneyIn = tx.amount > 0;
  const amt = Math.abs(tx.amount);
  const [accounts, invoices, bills, journals] = await Promise.all([entityAccounts(entityId), moneyIn ? openInvoices(entityId) : Promise.resolve([]), moneyIn ? Promise.resolve([]) : openBills(entityId), db.list("journal_entries", { where: (j) => j.entityId === entityId && j.status === "posted" && j.period === tx.date.slice(0, 7) && j.lines.some((l) => l.accountId === bank.accountId) })]);
  const linkedIds = new Set((await db.list("bank_transactions", { where: (t) => t.entityId === entityId && t.status === "matched" && Boolean(t.matchedJournalId) })).map((t) => t.matchedJournalId));
  const candidateJournals = journals.filter((j) => !linkedIds.has(j.id)).sort((x, y) => y.date.localeCompare(x.date));
  const near = (x: number) => Math.abs(roundMoney(x, bank.currency) - amt) < 0.5;
  const invSuggested = invoices.filter((i) => i.currency === bank.currency && near(invoiceOutstanding(i)));
  const billSuggested = bills.filter((x) => x.currency === bank.currency && near(billOutstanding(x)));
  const counterOptions = accountOptions(accounts, (a) => a.id !== bank.accountId);
  const defaultCounter = (moneyIn ? accounts.find((a) => a.subtype === "other_income" && a.active) : accounts.find((a) => a.code === "6-2000" && a.active)) ?? accounts.find((a) => a.taxTag === "suspense");
  const back = `${listHref}/tx/${tx.id}`;
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} />
      <p className="text-xs text-ink-500"><Link href={`${b}/bank`} className="hover:underline">Bank</Link> / <Link href={listHref} className="hover:underline">{bank.name}</Link> / match</p>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DL items={[["Date", fmtDate(tx.date)], ["Description", tx.description], ["Reference", tx.reference ?? "—"], ["Amount", <span key="a" className={moneyIn ? "font-semibold text-green-700" : "font-semibold text-red-700"}>{moneyIn ? "+" : "−"}{fmtMoney(amt, bank.currency)}</span>]]} />
          <div className="flex items-center gap-2"><Badge tone={moneyIn ? "green" : "red"}>{moneyIn ? "money in" : "money out"}</Badge>{writable && <form action={excludeTxAction.bind(null, entityId, bank.id, tx.id)}><input type="hidden" name="back" value={`${listHref}?status=unmatched`} /><button className="btn-secondary" type="submit">Exclude (not a business transaction)</button></form>}</div>
        </div>
      </Card>
      {!writable && <Notice tone="amber">You can view suggestions but need the accountant or admin role to post.</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={moneyIn ? `Open invoices${invSuggested.length ? ` — ${invSuggested.length} with the same amount` : ""}` : `Open bills${billSuggested.length ? ` — ${billSuggested.length} with the same amount` : ""}`}>
          {(moneyIn ? invoices.length : bills.length) === 0 ? <p className="text-sm text-ink-500">No open {moneyIn ? "invoices" : "bills"} in these books.</p> : (
            <table className="table">
              <thead><tr><th>Doc</th><th>{moneyIn ? "Customer" : "Vendor"}</th><th>Due</th><th className="num">Outstanding</th><th></th></tr></thead>
              <tbody>
                {(moneyIn ? invoices.map((i) => ({ id: i.id, number: i.number, name: i.customer.name, due: i.dueDate, ccy: i.currency, fxRate: i.fxRate, out: invoiceOutstanding(i), suggested: invSuggested.includes(i), href: `${b}/sales/${i.id}` })) : bills.map((x) => ({ id: x.id, number: x.number, name: x.vendor.name, due: x.dueDate, ccy: x.currency, fxRate: x.fxRate, out: billOutstanding(x), suggested: billSuggested.includes(x), href: `${b}/purchases/${x.id}` })))
                  .sort((x, y) => Number(y.suggested) - Number(x.suggested) || x.due.localeCompare(y.due))
                  .map((d) => {
                    const sameCcy = d.ccy === bank.currency;
                    const defaultAmount = sameCcy ? Math.min(amt, d.out) : d.out;
                    return (
                      <tr key={d.id} className={d.suggested ? "bg-green-50" : ""}>
                        <td><Link href={d.href} className="font-medium hover:underline">{d.number}</Link>{d.suggested && <Badge tone="green" className="ml-1">same amount</Badge>}</td>
                        <td className="max-w-[12rem] truncate">{d.name}</td>
                        <td className="whitespace-nowrap text-xs">{fmtDate(d.due)}</td>
                        <td className="num">{fmtMoney(d.out, d.ccy)}</td>
                        <td className="no-print">
                          {writable && (
                            <form action={matchAction.bind(null, entityId, bank.id, tx.id)} className="flex items-center gap-1">
                              <input type="hidden" name="type" value={moneyIn ? "invoice" : "bill"} /><input type="hidden" name="id" value={d.id} />
                              <input name="amount" defaultValue={String(defaultAmount)} className="input !w-28 !py-1 text-right text-xs" title={`Amount in ${d.ccy}`} />
                              {d.ccy !== "IDR" && bank.currency !== "IDR" && <input name="fxRate" defaultValue={String(d.fxRate)} className="input !w-20 !py-1 text-right text-xs" title="IDR per unit" />}
                              <button className="btn-primary !px-2 !py-1 text-xs" type="submit">Match</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-ink-500">Matching records a {moneyIn ? "receipt (Dr bank / Cr AR)" : "payment (Dr AP / Cr bank)"} dated {fmtDate(tx.date)}; partial amounts are allowed. {bank.currency === "IDR" ? "For foreign-currency documents the rate is derived from the IDR received." : ""}</p>
        </Card>
        <div className="space-y-4">
          {writable && (
            <Card title="Create a journal from this line">
              <form action={postBankTxAction.bind(null, entityId, bank.id, tx.id)} className="space-y-3">
                <Field label="Counter account" hint={moneyIn ? "e.g. interest income, shareholder loan, customer deposit, capital" : "e.g. bank charges, rent, salaries, PPh payment, owner drawings"}><Select name="counterAccountId" defaultValue={defaultCounter?.id} options={counterOptions} required /></Field>
                <Field label="Memo"><input name="description" defaultValue={tx.description.slice(0, 120)} className="input" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Counterparty (optional)"><input name="counterpartyName" className="input" /></Field>
                  {bank.currency !== "IDR" && <Field label={`FX rate (IDR per 1 ${bank.currency})`}><input name="fxRate" inputMode="decimal" className="input" required /></Field>}
                </div>
                <SubmitButton pendingText="Posting…">{moneyIn ? "Post Dr bank / Cr counter" : "Post Dr counter / Cr bank"}</SubmitButton>
              </form>
            </Card>
          )}
          {writable && candidateJournals.length > 0 && (
            <Card title="Link to an existing journal entry">
              <form action={linkJournalAction.bind(null, entityId, bank.id, tx.id)} className="space-y-3">
                <Field label={`Posted entries touching this bank account in ${tx.date.slice(0, 7)}`}>
                  <Select name="journalId" options={candidateJournals.map((j) => { const l = j.lines.find((x) => x.accountId === bank.accountId); return { value: j.id, label: `${j.number} ${fmtDate(j.date)} · ${j.memo.slice(0, 50)} · ${l ? fmtMoney(l.debit - l.credit) : ""}` }; })} />
                </Field>
                <SubmitButton>Link (no new posting)</SubmitButton>
                <p className="text-xs text-ink-500">Use this for transfers, payroll or receipts that were already posted.</p>
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
