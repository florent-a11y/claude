import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { docDisplayStatus, invoiceOutstanding } from "@/lib/ledger";
import { fmtDate, todayISO } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Card, Badge, statusTone, DL, Field, Select, Money, CardTable, Cols, Dash, TableCard } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/client";
import { Attachments } from "@/components/Attachments";
import { MoneyInput } from "@/components/MoneyInput";
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
        <div className="min-w-0 space-y-4">
          <TableCard>
            <table className="table table-data min-w-[760px]">
              <Cols widths={[undefined, 56, 130, 170, 70, 136]} />
              <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th>Account</th><th>Tax</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {invoice.lines.map((l) => (
                  <tr key={l.id}>
                    <td><span className="cell" title={l.description}>{l.description}</span></td>
                    <td className="num">{l.qty}</td>
                    <td className="num"><span className="money">{fmtMoney(l.unitPrice, ccy)}</span></td>
                    <td><span className="cell text-xs" title={accName(l.accountId)}>{accName(l.accountId)}</span></td>
                    <td className="whitespace-nowrap text-xs">{l.taxCode === "ppn" ? "PPN" : l.taxCode === "out_of_scope" ? "no PPN" : <Dash />}</td>
                    <td className="num"><span className="money">{fmtMoney(l.amount, ccy)}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={5} className="text-right !font-normal text-ink-500">Subtotal</td><td className="num !font-normal">{fmtMoney(invoice.subtotal, ccy)}</td></tr>
                {invoice.discount > 0 && <tr><td colSpan={5} className="text-right !font-normal text-ink-500">Discount</td><td className="num !font-normal">−{fmtMoney(invoice.discount, ccy)}</td></tr>}
                {invoice.ppnAmount > 0 && <tr><td colSpan={5} className="text-right !font-normal text-ink-500">PPN</td><td className="num !font-normal">{fmtMoney(invoice.ppnAmount, ccy)}</td></tr>}
                <tr><td colSpan={5} className="text-right">Total</td><td className="num">{fmtMoney(invoice.total, ccy)}</td></tr>
                <tr><td colSpan={5} className="text-right !font-normal text-ink-500">Paid</td><td className="num !font-normal">{fmtMoney(invoice.amountPaid, ccy)}</td></tr>
                <tr><td colSpan={5} className="text-right">Outstanding</td><td className="num">{fmtMoney(outstanding, ccy)}</td></tr>
              </tfoot>
            </table>
          </TableCard>
          <Card title={`Receipts (${payments.length})`}>
            {payments.length === 0 ? <p className="text-sm text-ink-500">No receipt recorded yet.</p> : (
              <CardTable>
                <table className="table table-data min-w-[640px]">
                  <Cols widths={[118, undefined, 150, 90, 90]} />
                  <thead><tr><th>Date</th><th>Bank</th><th className="num">Amount</th><th>Journal</th><th></th></tr></thead>
                  <tbody>
                    {payments.map((p) => {
                      const bankName = banks.find((x) => x.id === p.bankAccountId)?.name ?? p.bankAccountId;
                      const ref = [p.reference, p.bankTransactionId ? "(bank match)" : ""].filter(Boolean).join(" ");
                      return (
                        <tr key={p.id}>
                          <td className="whitespace-nowrap">{fmtDate(p.date)}</td>
                          <td><span className="cell" title={bankName}>{bankName}</span>{ref && <span className="cell-sub" title={ref}>{ref}</span>}</td>
                          <td className="num"><Money amount={p.amount} currency={p.currency} className="money" />{p.currency !== "IDR" && <span className="cell-sub">@ {p.fxRate}</span>}</td>
                          <td className="text-xs">{p.journalId ? <Link href={`${b}/journal/${p.journalId}`} className="text-brand-600 underline">journal</Link> : <Dash />}</td>
                          <td className="no-print text-right">{writable && <ConfirmForm action={voidPaymentAction.bind(null, entityId, p.id, here)} message="Reverse this receipt? Its journal is voided and the invoice balance restored."><button className="text-xs text-red-600 underline" type="submit">reverse</button></ConfirmForm>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardTable>
            )}
          </Card>
          <Attachments entityId={entityId} docType="invoice" docId={invoice.id} items={invoice.attachments ?? []} canWrite={writable} backTo={here} />
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
                    <Field label={`Amount (${ccy})`}><MoneyInput name="amount" defaultValue={outstanding} currency={ccy} required /></Field>
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
