import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { docDisplayStatus, billOutstanding, WITHHOLDING_LABELS } from "@/lib/ledger";
import { fmtDate, todayISO } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Card, Badge, statusTone, DL, Field, Select, Money } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Search } from "../../shared";
import { postBillAction, disbursementAction, voidBillAction, voidBillPaymentAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function BillPage({ params, searchParams }: { params: Promise<{ entityId: string; billId: string }>; searchParams: Search }) {
  const user = await requireUser();
  const { entityId, billId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const bill = await db.get("bills", billId);
  if (!bill || bill.entityId !== entityId) notFound();
  const [payments, banks, accounts] = await Promise.all([db.list("payments", { where: { entityId, billId }, orderBy: "date" }), db.list("bank_accounts", { where: { entityId, active: true } }), db.list("accounts", { where: { entityId } })]);
  const accName = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : id; };
  const today = todayISO();
  const display = docDisplayStatus(bill, today);
  const writable = can(user, "books:write");
  const open = bill.status === "sent" || bill.status === "partial";
  const outstanding = billOutstanding(bill);
  const b = base(entityId);
  const here = `${b}/purchases/${bill.id}`;
  const ccy = bill.currency;
  const sameCcyBanks = banks.filter((x) => x.currency === ccy);
  const bankOpts = (sameCcyBanks.length ? sameCcyBanks : banks).map((x) => ({ value: x.id, label: `${x.name} (${x.currency})` }));
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-500"><Link href={`${b}/purchases`} className="hover:underline">Purchases</Link> / {bill.number}</p>
          <h2 className="text-xl font-bold">{bill.number} <Badge tone={statusTone(display)}>{display}</Badge></h2>
          <p className="text-sm text-ink-700">{bill.vendor.name}{bill.vendorInvoiceNumber ? ` · ${bill.vendorInvoiceNumber}` : ""} · {fmtDate(bill.date)} · due {fmtDate(bill.dueDate)}</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          {writable && bill.status === "draft" && <Link href={`${here}/edit`} className="btn-secondary">Edit</Link>}
          {writable && bill.status === "draft" && <ConfirmForm action={postBillAction.bind(null, entityId, bill.id)} message={`Post ${bill.number}? This books Dr expense${entity.tax.pkp && bill.ppnInput ? " / Dr PPN input" : ""} / Cr AP${bill.withholdingTotal ? " / Cr withholding payable" : ""} dated ${bill.date}.`}><button className="btn-primary" type="submit">Post bill</button></ConfirmForm>}
          {writable && bill.status !== "void" && bill.amountPaid === 0 && <ConfirmForm action={voidBillAction.bind(null, entityId, bill.id)} message={`Void ${bill.number}?${bill.journalId ? " Its journal entry will be voided too." : ""}`}><button className="btn-danger" type="submit">Void</button></ConfirmForm>}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="overflow-x-auto !p-0">
            <table className="table">
              <thead><tr><th className="pl-4">Description</th><th>Account</th><th>PPN</th><th>Withholding</th><th className="num">Withheld</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {bill.lines.map((l) => (
                  <tr key={l.id}><td className="pl-4">{l.description}</td><td className="text-xs">{accName(l.accountId)}</td><td className="text-xs">{l.taxCode}</td><td className="text-xs">{l.withholding === "none" ? "—" : `${WITHHOLDING_LABELS[l.withholding].split(" (")[0]} ${((l.withholdingRate ?? 0) * 100).toFixed(l.withholdingRate && l.withholdingRate * 100 % 1 ? 2 : 0)}%`}</td><td className="num">{l.withholdingAmount ? fmtMoney(l.withholdingAmount, ccy) : ""}</td><td className="num">{fmtMoney(l.amount, ccy)}</td></tr>
                ))}
              </tbody>
              <tfoot className="text-sm">
                <tr><td colSpan={5} className="pl-4 py-1 text-right text-ink-500">Subtotal (DPP)</td><td className="num py-1">{fmtMoney(bill.subtotal, ccy)}</td></tr>
                {bill.ppnInput > 0 && <tr><td colSpan={5} className="pl-4 py-1 text-right text-ink-500">PPN input {entity.tax.pkp ? "(creditable)" : "(expensed, non-PKP)"}</td><td className="num py-1">{fmtMoney(bill.ppnInput, ccy)}</td></tr>}
                <tr className="font-semibold"><td colSpan={5} className="pl-4 py-1 text-right">Total</td><td className="num py-1">{fmtMoney(bill.total, ccy)}</td></tr>
                {bill.withholdingTotal > 0 && <tr><td colSpan={5} className="pl-4 py-1 text-right text-ink-500">Withholding (remit to DJP)</td><td className="num py-1">−{fmtMoney(bill.withholdingTotal, ccy)}</td></tr>}
                <tr className="border-t border-slate-200 font-semibold"><td colSpan={5} className="pl-4 py-2 text-right">Amount payable</td><td className="num py-2">{fmtMoney(bill.amountPayable, ccy)}</td></tr>
                <tr><td colSpan={5} className="pl-4 py-1 text-right text-ink-500">Paid</td><td className="num py-1">{fmtMoney(bill.amountPaid, ccy)}</td></tr>
                <tr className="font-semibold"><td colSpan={5} className="pl-4 py-1 text-right">Outstanding</td><td className="num py-1">{fmtMoney(outstanding, ccy)}</td></tr>
              </tfoot>
            </table>
          </Card>
          <Card title={`Payments (${payments.length})`}>
            {payments.length === 0 ? <p className="text-sm text-ink-500">No payment recorded yet.</p> : (
              <table className="table">
                <thead><tr><th>Date</th><th>Bank</th><th className="num">Amount</th><th>Rate</th><th>Journal</th><th>Reference</th><th></th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtDate(p.date)}</td><td>{banks.find((x) => x.id === p.bankAccountId)?.name ?? p.bankAccountId}</td><td className="num"><Money amount={p.amount} currency={p.currency} /></td><td className="text-xs">{p.currency === "IDR" ? "" : p.fxRate}</td>
                      <td>{p.journalId && <Link href={`${b}/journal/${p.journalId}`} className="text-brand-600 underline">journal</Link>}</td><td className="text-xs">{p.reference ?? ""}{p.bankTransactionId && <span className="ml-1 text-ink-500">(bank match)</span>}</td>
                      <td className="no-print">{writable && <ConfirmForm action={voidBillPaymentAction.bind(null, entityId, p.id, here)} message="Reverse this payment? Its journal is voided and the bill balance restored."><button className="text-xs text-red-600 underline" type="submit">reverse</button></ConfirmForm>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Details">
            <DL items={[["Vendor", <span key="v">{bill.vendor.name}{bill.vendor.npwp && <><br /><span className="text-xs text-ink-500">NPWP {bill.vendor.npwp}</span></>}{bill.vendor.country && bill.vendor.country !== "ID" && <><br /><span className="text-xs text-ink-500">{bill.vendor.country} (foreign: PPh 26)</span></>}</span>], ["Currency", `${ccy}${ccy !== "IDR" ? ` @ ${bill.fxRate}` : ""}`], ["Journal", bill.journalId ? <Link href={`${b}/journal/${bill.journalId}`} className="text-brand-600 underline">view entry</Link> : "not posted"], ["e-Faktur", bill.fakturNumber ?? "—"], ["Project", bill.projectId ?? "—"], ["Notes", bill.notes ?? "—"]]} />
          </Card>
          {writable && open && (
            <Card title="Record payment">
              {banks.length === 0 ? <p className="text-sm text-ink-500">Add a <Link href={`${b}/bank`} className="text-brand-600 underline">bank account</Link> first.</p> : (
                <form action={disbursementAction.bind(null, entityId, bill.id)} className="space-y-3">
                  <Field label="Bank account"><Select name="bankAccountId" options={bankOpts} required /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Date"><input name="date" type="date" defaultValue={today} required className="input" /></Field>
                    <Field label={`Amount (${ccy})`}><input name="amount" defaultValue={String(outstanding)} inputMode="decimal" required className="input text-right" /></Field>
                  </div>
                  {ccy !== "IDR" && <Field label={`Rate on payment (IDR per 1 ${ccy})`}><input name="fxRate" defaultValue={String(bill.fxRate)} inputMode="decimal" className="input" /></Field>}
                  <Field label="Reference"><input name="reference" className="input" placeholder="Transfer reference" /></Field>
                  <SubmitButton pendingText="Recording…">Record payment</SubmitButton>
                </form>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
