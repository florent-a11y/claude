import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { docDisplayStatus, invoiceOutstanding } from "@/lib/ledger";
import { fmtDate, todayISO } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Card, Badge, statusTone, DL, Field, Select, Money } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { ErrorNotice, base, first, requireEntity, type Search } from "../../shared";
import { postInvoiceAction, receiptAction, voidInvoiceAction, voidPaymentAction } from "../actions";
import { SendPanel } from "./SendPanel";
import { defaultPaymentInstructions } from "../_data";
import { fullName } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ entityId: string; invoiceId: string }>; searchParams: Search }) {
  const user = await requireUser();
  const { entityId, invoiceId } = await params;
  const sp = await searchParams;
  const entity = await requireEntity(entityId);
  const invoice = await db.get("invoices", invoiceId);
  if (!invoice || invoice.entityId !== entityId) notFound();
  // Recipient and greeting for "Send to client": the invoice email, else the CRM contact / company primary contact.
  let to = invoice.customer.email ?? "";
  let greetingName = invoice.customer.name;
  if (invoice.customer.type === "contact" && invoice.customer.id) {
    const c = await db.get("contacts", invoice.customer.id);
    if (c) { to = to || c.email || ""; greetingName = c.firstName || fullName(c) || greetingName; }
  } else if (invoice.customer.type === "company" && invoice.customer.id) {
    const co = await db.get("companies", invoice.customer.id);
    const c = co?.primaryContactId ? await db.get("contacts", co.primaryContactId) : null;
    if (c) { to = to || c.email || ""; greetingName = c.firstName || greetingName; }
  }
  const paymentInstructions = invoice.paymentInstructions ?? (await defaultPaymentInstructions(entityId));
  const [payments, banks, accounts] = await Promise.all([db.list("payments", { where: { entityId, invoiceId }, orderBy: "date" }), db.list("bank_accounts", { where: { entityId, active: true } }), db.list("accounts", { where: { entityId } })]);
  const accName = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : id; };
  const today = todayISO();
  const display = docDisplayStatus(invoice, today);
  const writable = can(user, "books:write");
  const open = invoice.status === "sent" || invoice.status === "partial";
  const outstanding = invoiceOutstanding(invoice);
  const b = base(entityId);
  const here = `${b}/sales/${invoice.id}`;
  const ccy = invoice.currency;
  const sameCcyBanks = banks.filter((x) => x.currency === ccy);
  const bankOpts = (sameCcyBanks.length ? sameCcyBanks : banks).map((x) => ({ value: x.id, label: `${x.name} (${x.currency})` }));
  return (
    <div className="space-y-4 pb-8">
      <ErrorNotice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-500"><Link href={`${b}/sales`} className="hover:underline">Sales</Link> / {invoice.number}</p>
          <h2 className="text-xl font-bold">{invoice.number} <Badge tone={statusTone(display)}>{display}</Badge></h2>
          <p className="text-sm text-ink-700">{invoice.customer.name} · {fmtDate(invoice.date)} · due {fmtDate(invoice.dueDate)}</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Link href={`${here}/print`} className="btn-secondary">Print / PDF</Link>
          {writable && invoice.status === "draft" && <Link href={`${here}/edit`} className="btn-secondary">Edit</Link>}
          {writable && invoice.status === "draft" && <ConfirmForm action={postInvoiceAction.bind(null, entityId, invoice.id)} message={`Post ${invoice.number}? This books Dr AR / Cr revenue${invoice.ppnAmount ? " / Cr PPN output" : ""} dated ${invoice.date}.`}><button className="btn-primary" type="submit">Post invoice</button></ConfirmForm>}
          {writable && invoice.status !== "void" && invoice.amountPaid === 0 && <ConfirmForm action={voidInvoiceAction.bind(null, entityId, invoice.id)} message={`Void ${invoice.number}?${invoice.journalId ? " Its journal entry will be voided too." : ""}`}><button className="btn-danger" type="submit">Void</button></ConfirmForm>}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="overflow-x-auto !p-0">
            <table className="table">
              <thead><tr><th className="pl-4">Description</th><th className="num">Qty</th><th className="num">Unit price</th><th>Account</th><th>Tax</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {invoice.lines.map((l) => (
                  <tr key={l.id}><td className="pl-4">{l.description}</td><td className="num">{l.qty}</td><td className="num">{fmtMoney(l.unitPrice, ccy)}</td><td className="text-xs">{accName(l.accountId)}</td><td className="text-xs">{l.taxCode}</td><td className="num">{fmtMoney(l.amount, ccy)}</td></tr>
                ))}
              </tbody>
              <tfoot className="text-sm">
                <tr><td colSpan={5} className="pl-4 py-1 text-right text-ink-500">Subtotal</td><td className="num py-1">{fmtMoney(invoice.subtotal, ccy)}</td></tr>
                {invoice.discount > 0 && <tr><td colSpan={5} className="pl-4 py-1 text-right text-ink-500">Discount</td><td className="num py-1">−{fmtMoney(invoice.discount, ccy)}</td></tr>}
                {invoice.ppnAmount > 0 && <tr><td colSpan={5} className="pl-4 py-1 text-right text-ink-500">PPN</td><td className="num py-1">{fmtMoney(invoice.ppnAmount, ccy)}</td></tr>}
                <tr className="border-t border-slate-200 font-semibold"><td colSpan={5} className="pl-4 py-2 text-right">Total</td><td className="num py-2">{fmtMoney(invoice.total, ccy)}</td></tr>
                <tr><td colSpan={5} className="pl-4 py-1 text-right text-ink-500">Paid</td><td className="num py-1">{fmtMoney(invoice.amountPaid, ccy)}</td></tr>
                <tr className="font-semibold"><td colSpan={5} className="pl-4 py-1 text-right">Outstanding</td><td className="num py-1">{fmtMoney(outstanding, ccy)}</td></tr>
              </tfoot>
            </table>
          </Card>
          <Card title={`Receipts (${payments.length})`}>
            {payments.length === 0 ? <p className="text-sm text-ink-500">No receipt recorded yet.</p> : (
              <table className="table">
                <thead><tr><th>Date</th><th>Bank</th><th className="num">Amount</th><th>Rate</th><th>Journal</th><th>Reference</th><th></th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtDate(p.date)}</td><td>{banks.find((x) => x.id === p.bankAccountId)?.name ?? p.bankAccountId}</td><td className="num"><Money amount={p.amount} currency={p.currency} /></td><td className="text-xs">{p.currency === "IDR" ? "" : p.fxRate}</td>
                      <td>{p.journalId && <Link href={`${b}/journal/${p.journalId}`} className="text-brand-600 underline">journal</Link>}</td><td className="text-xs">{p.reference ?? ""}{p.bankTransactionId && <span className="ml-1 text-ink-500">(bank match)</span>}</td>
                      <td className="no-print">{writable && <ConfirmForm action={voidPaymentAction.bind(null, entityId, p.id, here)} message="Reverse this receipt? Its journal is voided and the invoice balance restored."><button className="text-xs text-red-600 underline" type="submit">reverse</button></ConfirmForm>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <SendPanel entity={entity} invoice={invoice} to={to} greetingName={greetingName} paymentInstructions={paymentInstructions} writable={writable} />
          <Card title="Details">
            <DL items={[["Customer", <span key="c">{invoice.customer.name}{invoice.customer.email && <><br /><span className="text-xs text-ink-500">{invoice.customer.email}</span></>}{invoice.customer.npwp && <><br /><span className="text-xs text-ink-500">NPWP {invoice.customer.npwp}</span></>}</span>], ["Currency", `${ccy}${ccy !== "IDR" ? ` @ ${invoice.fxRate}` : ""}`], ["Journal", invoice.journalId ? <Link href={`${b}/journal/${invoice.journalId}`} className="text-brand-600 underline">view entry</Link> : "not posted"], ["e-Faktur", invoice.fakturNumber ?? "—"], ["Notes", invoice.notes ?? "—"]]} />
          </Card>
          {writable && open && (
            <Card title="Record receipt">
              {banks.length === 0 ? <p className="text-sm text-ink-500">Add a <Link href={`${b}/bank`} className="text-brand-600 underline">bank account</Link> first.</p> : (
                <form action={receiptAction.bind(null, entityId, invoice.id)} className="space-y-3">
                  <Field label="Bank account"><Select name="bankAccountId" options={bankOpts} required /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Date"><input name="date" type="date" defaultValue={today} required className="input" /></Field>
                    <Field label={`Amount (${ccy})`}><input name="amount" defaultValue={String(outstanding)} inputMode="decimal" required className="input text-right" /></Field>
                  </div>
                  {ccy !== "IDR" && <Field label={`Rate on receipt (IDR per 1 ${ccy})`} hint="Difference with the invoice rate posts to FX gain/loss."><input name="fxRate" defaultValue={String(invoice.fxRate)} inputMode="decimal" className="input" /></Field>}
                  <Field label="Reference"><input name="reference" className="input" placeholder="Bank reference / remittance" /></Field>
                  <SubmitButton pendingText="Recording…">Record receipt</SubmitButton>
                </form>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
